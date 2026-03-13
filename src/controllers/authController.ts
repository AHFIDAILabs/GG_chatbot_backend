import { Request, Response, NextFunction } from "express";
import User from "../models/User";
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
// POST /api/auth/register
// Public
// ─────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role, ageGroup, consentGiven } = req.body;

  // Check duplicate email
  const existing = await User.findOne({ email });
  if (existing)
    throw Errors.conflict("An account with this email already exists");

  // For girls under 13, consent must be given
  if (ageGroup === "10-13" && !consentGiven) {
    throw Errors.badRequest(
      "Parental or guardian consent is required for users aged 10–13",
    );
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role ?? "girl",
    ageGroup: ageGroup ?? null,
    consentGiven: consentGiven ?? false,
    consentAt: consentGiven ? new Date() : null,
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

  sendSuccess(
    res,
    {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        ageGroup: user.ageGroup,
        avatar: user.avatar,
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
    .cookie("access_token", accessToken, accessCookieOptions)
    .cookie("refresh_token", refreshToken, refreshCookieOptions);

  sendSuccess(res, {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      ageGroup: user.ageGroup,
      avatar: user.avatar,
      lastLoginAt: user.lastLoginAt,
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

  const user = await User.findById(userId).select("-__v");
  if (!user) throw Errors.notFound("User not found");

  sendSuccess(res, {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      ageGroup: user.ageGroup,
      avatar: user.avatar,
      preferredLang: user.preferredLang,
      consentGiven: user.consentGiven,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
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
