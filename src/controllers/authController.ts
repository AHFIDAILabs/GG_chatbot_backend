import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import FacilitatorInvite from "../models/FacilitatorInvite";
import { AuthRequest } from "../types";
import { Errors, asyncHandler } from "../utils/appError";
import { sendSuccess } from "../utils/apiResponse";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  accessCookieOptions,
  refreshCookieOptions,
} from "../utils/jwt";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// Generates a short readable group code: GGA-XXXX (e.g. GGA-K4M9)
async function generateGroupCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous charset (no O/0/I/1)
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const code   = `GGA-${suffix}`;
    const exists = await User.findOne({ groupCode: code });
    if (!exists) return code;
  }
  throw Errors.internal('Could not generate a unique group code — try again');
}

// ─────────────────────────────────────────────
// POST /api/auth/register
// Public
//
// Two flows:
//   1. Girl: normal fields + optional groupCode
//      → links to facilitator who owns that groupCode
//   2. Facilitator: must include a valid inviteToken
//      → validates token, sets role=facilitator, generates groupCode
// ─────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, ageGroup, consentGiven, inviteToken, groupCode } = req.body;

  // ── Check duplicate email ───────────────────
  const existing = await User.findOne({ email });
  if (existing) throw Errors.conflict("An account with this email already exists");

  // ── Facilitator flow (invite token required) ─
  if (inviteToken) {
    const invite = await FacilitatorInvite.findOne({ token: inviteToken });

    if (!invite)              throw Errors.badRequest('Invite link not found or already used');
    if (invite.used)          throw Errors.badRequest('This invite link has already been used');
    if (invite.expiresAt < new Date()) throw Errors.badRequest('This invite link has expired');

    const code = await generateGroupCode();

    const user = await User.create({
      name, email, password,
      role:        'facilitator',
      ageGroup:    null,
      groupCode:   code,
      lastLoginAt: new Date(),
    });

    // Mark invite as consumed
    invite.used   = true;
    invite.usedBy = user._id;
    await invite.save();

    const accessToken  = signAccessToken(user._id.toString(), user.role, user.ageGroup);
    const refreshToken = signRefreshToken(user._id.toString());

    res
      .cookie('access_token',  accessToken,  accessCookieOptions)
      .cookie('refresh_token', refreshToken, refreshCookieOptions);

    return sendSuccess(res, {
      user: {
        id: user._id, name: user.name, email: user.email,
        role: user.role, ageGroup: user.ageGroup,
        avatar: user.avatar, groupCode: user.groupCode,
      },
    }, 201);
  }

  // ── Girl flow ────────────────────────────────
  if (ageGroup === "10-13" && !consentGiven) {
    throw Errors.badRequest("Parental or guardian consent is required for users aged 10–13");
  }

  // Auto-assign to the facilitator with the fewest girls (load-balancing)
  let facilitatorId: string | null = null;
  const facilitators = await User.find({ role: 'facilitator', isActive: true }).select('_id').lean();
  if (facilitators.length > 0) {
    const counts = await Promise.all(
      facilitators.map(f => User.countDocuments({ facilitatorId: f._id, role: 'girl' })),
    );
    const minIndex   = counts.indexOf(Math.min(...counts));
    facilitatorId    = facilitators[minIndex]._id.toString();
  }

  const user = await User.create({
    name, email, password,
    role:         'girl',
    ageGroup:     ageGroup ?? null,
    consentGiven: consentGiven ?? false,
    consentAt:    consentGiven ? new Date() : null,
    facilitatorId,
    lastLoginAt:  new Date(),
  });

  // Issue tokens immediately after registration
  const accessToken = signAccessToken(
    user._id.toString(),
    user.role,
    user.ageGroup,
  );
  const refreshToken = signRefreshToken(user._id.toString());

  res
    .cookie("access_token", accessToken, accessCookieOptions)
    .cookie("refresh_token", refreshToken, refreshCookieOptions);

  // Resolve facilitator name if assigned
  let facilitatorName: string | null = null;
  if (facilitatorId) {
    const fac = await User.findById(facilitatorId).select('name').lean();
    facilitatorName = fac?.name ?? null;
  }

  sendSuccess(
    res,
    {
      user: {
        id:             user._id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        ageGroup:       user.ageGroup,
        avatar:         user.avatar,
        facilitatorId:  facilitatorId ?? null,
        facilitatorName,
      },
    },
    201,
  );
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// Public
// ─────────────────────────────────────────────

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Fetch user with password (select:false by default)
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw Errors.unauthorized("Invalid email or password");

  if (!user.isActive) {
    throw Errors.forbidden(
      "This account has been deactivated. Please contact your facilitator.",
    );
  }

  const passwordMatch = await user.comparePassword(password);
  if (!passwordMatch) throw Errors.unauthorized("Invalid email or password");

  // Update last login timestamp
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const accessToken = signAccessToken(
    user._id.toString(),
    user.role,
    user.ageGroup,
  );
  const refreshToken = signRefreshToken(user._id.toString());

  res
    .cookie('access_token',  accessToken,  accessCookieOptions)
    .cookie('refresh_token', refreshToken, refreshCookieOptions);
  sendSuccess(res, {
    user: {
      id:          user._id,
      name:        user.name,
      email:       user.email,
      role:        user.role,
      ageGroup:    user.ageGroup,
      avatar:      user.avatar,
      lastLoginAt: user.lastLoginAt,
      groupCode:   user.groupCode ?? null,
    },
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/refresh
// Public — uses httpOnly refresh token cookie
// ─────────────────────────────────────────────

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token;
  if (!token) throw Errors.unauthorized("No refresh token provided");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw Errors.unauthorized("Invalid or expired refresh token");
  }

  const user = await User.findById(payload.userId);
  if (!user || !user.isActive) {
    throw Errors.unauthorized("User not found or account deactivated");
  }

  // Issue a fresh access token — refresh token stays the same
  const accessToken = signAccessToken(
    user._id.toString(),
    user.role,
    user.ageGroup,
  );

  res.cookie("access_token", accessToken, accessCookieOptions);

  sendSuccess(res, { message: "Access token refreshed" });
});

// ─────────────────────────────────────────────
// POST /api/auth/logout
// Private
// ─────────────────────────────────────────────

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // Clear both cookies — same options but maxAge: 0
  res
    .cookie("access_token", "", { ...accessCookieOptions, maxAge: 0 })
    .cookie("refresh_token", "", { ...refreshCookieOptions, maxAge: 0 });

  sendSuccess(res, { message: "Logged out successfully" });
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// Private — returns current user profile
// ─────────────────────────────────────────────

export const me = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const user = await User.findById(userId).select("-__v").populate('facilitatorId', 'name');
  if (!user) throw Errors.notFound("User not found");

  sendSuccess(res, {
    user: {
      id:               user._id,
      name:             user.name,
      email:            user.email,
      role:             user.role,
      ageGroup:         user.ageGroup,
      avatar:           user.avatar,
      preferredLang:    user.preferredLang,
      consentGiven:     user.consentGiven,
      lastLoginAt:      user.lastLoginAt,
      createdAt:        user.createdAt,
      groupCode:        user.groupCode ?? null,
      facilitatorId:    (user.facilitatorId as any)?._id?.toString() ?? user.facilitatorId?.toString() ?? null,
      facilitatorName:  (user.facilitatorId as any)?.name ?? null,
      savedTopics:      user.savedTopics,
      resourcesVisited: user.resourcesVisited,
      badges:           user.badges,
    },
  });
});

// ─────────────────────────────────────────────
// PATCH /api/auth/me
// Private — update name, avatar, preferredLang
// ─────────────────────────────────────────────

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  // Only allow safe fields — never let users update role or password here
  const allowed = ["name", "preferredLang", "avatar", "ageGroup"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true, runValidators: true },
  ).select("-__v -password");

  if (!user) throw Errors.notFound("User not found");

  sendSuccess(res, { user });
});

// ─────────────────────────────────────────────
// PATCH /api/auth/me/facilitator
// Private — girl enters a group code to link herself
// to a facilitator after registration.
// Fails if she's already assigned (use admin to reassign).
// ─────────────────────────────────────────────

export const setFacilitator = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { groupCode } = req.body;

  if (!groupCode?.trim()) throw Errors.badRequest('Group code is required');

  const girl = await User.findById(userId);
  if (!girl)              throw Errors.notFound('User not found');
  if (girl.role !== 'girl') throw Errors.forbidden('Only girl accounts can link to a facilitator');
  if (girl.facilitatorId)   throw Errors.conflict('You are already linked to a facilitator. Contact an admin to change this.');

  const facilitator = await User.findOne({ groupCode: groupCode.trim().toUpperCase(), role: 'facilitator' });
  if (!facilitator) throw Errors.badRequest('Group code not found — check the code and try again');

  girl.facilitatorId = facilitator._id;
  await girl.save({ validateBeforeSave: false });

  sendSuccess(res, {
    message:     'Successfully linked to facilitator',
    facilitator: { id: facilitator._id, name: facilitator.name },
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/bookmarks
// Private — bookmark a topic (idempotent via $addToSet)
// ─────────────────────────────────────────────

export const addBookmark = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { topicId } = req.body;
  if (!topicId?.trim()) throw Errors.badRequest('topicId is required');

  const user = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { savedTopics: topicId.trim() } },
    { new: true },
  ).select('savedTopics');

  if (!user) throw Errors.notFound('User not found');

  sendSuccess(res, { savedTopics: user.savedTopics });
});

// ─────────────────────────────────────────────
// DELETE /api/auth/bookmarks/:topicId
// Private — remove a bookmark
// ─────────────────────────────────────────────

export const removeBookmark = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { topicId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { savedTopics: topicId } },
    { new: true },
  ).select('savedTopics');

  if (!user) throw Errors.notFound('User not found');

  sendSuccess(res, { savedTopics: user.savedTopics });
});

// ─────────────────────────────────────────────
// GET /api/auth/bookmarks
// Private — list saved topic IDs
// ─────────────────────────────────────────────

export const getBookmarks = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const user = await User.findById(userId).select('savedTopics').lean();
  if (!user) throw Errors.notFound('User not found');

  sendSuccess(res, { savedTopics: user.savedTopics });
});

// ─────────────────────────────────────────────
// POST /api/auth/resources/visited
// Private — mark a resource/topic as visited
// ─────────────────────────────────────────────

export const markVisited = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { topicId } = req.body;
  if (!topicId?.trim()) throw Errors.badRequest('topicId is required');

  const user = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { resourcesVisited: topicId.trim() } },
    { new: true },
  ).select('resourcesVisited badges');

  if (!user) throw Errors.notFound('User not found');

  sendSuccess(res, { resourcesVisited: user.resourcesVisited, badges: user.badges });
});

// ─────────────────────────────────────────────
// GET /api/auth/resources/visited
// Private — list visited topic IDs + earned badges
// ─────────────────────────────────────────────

export const getProgress = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const user = await User.findById(userId)
    .select('savedTopics resourcesVisited badges')
    .lean();

  if (!user) throw Errors.notFound('User not found');

  sendSuccess(res, {
    savedTopics:      user.savedTopics,
    resourcesVisited: user.resourcesVisited,
    badges:           user.badges,
  });
});

// ─────────────────────────────────────────────
// PATCH /api/auth/change-password
// Private
// ─────────────────────────────────────────────

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { userId } = (req as AuthRequest).user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw Errors.badRequest("Current password and new password are required");
    }
    if (newPassword.length < 8) {
      throw Errors.badRequest("New password must be at least 8 characters");
    }

    const user = await User.findById(userId).select("+password");
    if (!user) throw Errors.notFound("User not found");

    const match = await user.comparePassword(currentPassword);
    if (!match) throw Errors.unauthorized("Current password is incorrect");

    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    // Invalidate cookies so user must log in again with new password
    res
      .cookie("access_token", "", { ...accessCookieOptions, maxAge: 0 })
      .cookie("refresh_token", "", { ...refreshCookieOptions, maxAge: 0 });

    sendSuccess(res, {
      message: "Password changed successfully. Please log in again.",
    });
  },
);
