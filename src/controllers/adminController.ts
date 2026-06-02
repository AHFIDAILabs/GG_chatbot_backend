import { Request, Response } from 'express';
import crypto                from 'crypto';
import mongoose              from 'mongoose';
import User                  from '../models/User';
import FacilitatorInvite     from '../models/FacilitatorInvite';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';
import {
  signAccessToken,
  signRefreshToken,
  accessCookieOptions,
  refreshCookieOptions,
} from '../utils/jwt';

// ─────────────────────────────────────────────
// Admin secret guard middleware
// ─────────────────────────────────────────────

export function requireAdminSecret(req: Request, _res: Response, next: Function): void {
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.headers['x-admin-secret'];
  if (!secret)                     return next(Errors.internal('ADMIN_SECRET is not configured'));
  if (!provided || provided !== secret) return next(Errors.forbidden('Invalid or missing admin secret'));
  next();
}

// ─────────────────────────────────────────────
// POST /api/v1/admin/seed
// One-time bootstrap: create the first admin user.
// Protected by X-Admin-Secret header.
// Fails if any admin already exists.
// ─────────────────────────────────────────────

export const seedAdmin = asyncHandler(async (req: Request, res: Response) => {
  const existing = await User.findOne({ role: 'admin' });
  if (existing) throw Errors.conflict('An admin account already exists');

  const { name, email, password } = req.body;

  const emailTaken = await User.findOne({ email });
  if (emailTaken) throw Errors.conflict('An account with this email already exists');

  const admin = await User.create({ name, email, password, role: 'admin' });

  const accessToken  = signAccessToken(admin._id.toString(), admin.role, null);
  const refreshToken = signRefreshToken(admin._id.toString());

  res
    .cookie('access_token',  accessToken,  accessCookieOptions)
    .cookie('refresh_token', refreshToken, refreshCookieOptions);

  sendSuccess(res, {
    user: {
      id:    admin._id,
      name:  admin.name,
      email: admin.email,
      role:  admin.role,
    },
  }, 201);
});

// ─────────────────────────────────────────────
// POST /api/v1/admin/invites
// Generate a new facilitator invite link.
// Body: { note?, expiresInHours? }
// ─────────────────────────────────────────────

export const generateInvite = asyncHandler(async (req: Request, res: Response) => {
  const note           = (req.body.note          as string)  ?? '';
  const expiresInHours = (req.body.expiresInHours as number) ?? 48;

  const token     = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const invite = await FacilitatorInvite.create({ token, expiresAt, note });

  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

  sendSuccess(res, {
    _id:       invite._id,
    token,
    inviteUrl: `${baseUrl}/invite/${token}`,
    expiresAt: invite.expiresAt,
    note:      invite.note,
    used:      false,
  }, 201);
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/invites
// List all invites (newest first).
// ─────────────────────────────────────────────

export const listInvites = asyncHandler(async (_req: Request, res: Response) => {
  const invites = await FacilitatorInvite.find()
    .sort({ createdAt: -1 })
    .populate('usedBy', 'name email')
    .lean();

  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

  const mapped = invites.map(inv => ({
    ...inv,
    inviteUrl: `${baseUrl}/invite/${inv.token}`,
  }));

  sendSuccess(res, { invites: mapped });
});

// ─────────────────────────────────────────────
// DELETE /api/v1/admin/invites/:id
// Revoke (delete) an unused invite.
// ─────────────────────────────────────────────

export const revokeInvite = asyncHandler(async (req: Request, res: Response) => {
  const invite = await FacilitatorInvite.findById(req.params.id);
  if (!invite)   throw Errors.notFound('Invite not found');
  if (invite.used) throw Errors.badRequest('Cannot revoke an already-used invite');

  await invite.deleteOne();
  sendSuccess(res, { message: 'Invite revoked' });
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/facilitators
// List all facilitators with cohort size.
// ─────────────────────────────────────────────

export const listFacilitators = asyncHandler(async (_req: Request, res: Response) => {
  const facilitators = await User.find({ role: 'facilitator' })
    .select('name email groupCode lastLoginAt createdAt isActive')
    .sort({ createdAt: -1 })
    .lean();

  const withCounts = await Promise.all(
    facilitators.map(async f => ({
      ...f,
      girlCount: await User.countDocuments({ facilitatorId: f._id, role: 'girl' }),
    })),
  );

  sendSuccess(res, { facilitators: withCounts });
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/girls/unassigned
// Girls with no facilitator, paginated.
// ─────────────────────────────────────────────

export const getUnassignedGirls = asyncHandler(async (_req: Request, res: Response) => {
  const girls = await User.find({ role: 'girl', facilitatorId: null })
    .select('name email ageGroup lastLoginAt createdAt')
    .sort({ createdAt: -1 })
    .lean();

  sendSuccess(res, { girls, total: girls.length });
});

// ─────────────────────────────────────────────
// PATCH /api/v1/admin/girls/:id/assign
// Assign (or reassign) a girl to a facilitator.
// Body: { facilitatorId } OR { groupCode }
// ─────────────────────────────────────────────

export const assignGirl = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { facilitatorId, groupCode } = req.body;

  const girl = await User.findOne({ _id: id, role: 'girl' });
  if (!girl) throw Errors.notFound('Girl not found');

  let facilId: string;

  if (facilitatorId) {
    const fac = await User.findOne({ _id: facilitatorId, role: 'facilitator' });
    if (!fac) throw Errors.badRequest('Facilitator not found');
    facilId = fac._id.toString();
  } else if (groupCode) {
    const fac = await User.findOne({ groupCode: groupCode.trim().toUpperCase(), role: 'facilitator' });
    if (!fac) throw Errors.badRequest('Group code not found');
    facilId = fac._id.toString();
  } else {
    throw Errors.badRequest('Provide facilitatorId or groupCode');
  }

  girl.facilitatorId = new mongoose.Types.ObjectId(facilId);
  await girl.save({ validateBeforeSave: false });

  sendSuccess(res, { message: 'Girl assigned to facilitator', girlId: girl._id, facilitatorId: facilId });
});

// ─────────────────────────────────────────────
// GET /api/v1/admin/stats
// Dashboard summary numbers.
// ─────────────────────────────────────────────

export const getStats = asyncHandler(async (_req: Request, res: Response) => {
  const [girls, facilitators, pendingInvites, unassigned] = await Promise.all([
    User.countDocuments({ role: 'girl' }),
    User.countDocuments({ role: 'facilitator' }),
    FacilitatorInvite.countDocuments({ used: false }),
    User.countDocuments({ role: 'girl', facilitatorId: null }),
  ]);

  sendSuccess(res, { girls, facilitators, pendingInvites, unassigned });
});
