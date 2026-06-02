import { Request, Response } from 'express';
import crypto                from 'crypto';
import FacilitatorInvite     from '../models/FacilitatorInvite';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';

// ─────────────────────────────────────────────
// Admin guard middleware
//
// Protects invite-generation endpoints.
// Caller must send:  X-Admin-Secret: <ADMIN_SECRET>
// Set ADMIN_SECRET in your .env — never expose it.
// ─────────────────────────────────────────────

export function requireAdminSecret(req: Request, _res: Response, next: Function): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return next(Errors.internal('ADMIN_SECRET env var is not configured'));
  }
  const provided = req.headers['x-admin-secret'];
  if (!provided || provided !== secret) {
    return next(Errors.forbidden('Invalid or missing admin secret'));
  }
  next();
}

// ─────────────────────────────────────────────
// POST /api/v1/invite/generate
// Admin only (X-Admin-Secret header)
// Body: { note?: string, expiresInHours?: number }
// ─────────────────────────────────────────────

export const generateInvite = asyncHandler(async (req: Request, res: Response) => {
  const note           = (req.body.note          as string)  ?? '';
  const expiresInHours = (req.body.expiresInHours as number) ?? 48;

  const token     = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const invite = await FacilitatorInvite.create({ token, expiresAt, note });

  const baseUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

  sendSuccess(res, {
    token,
    inviteUrl:  `${baseUrl}/invite/${token}`,
    expiresAt:  invite.expiresAt,
    note:       invite.note,
  }, 201);
});

// ─────────────────────────────────────────────
// GET /api/v1/invite/:token
// Public — validate a token before showing the
// registration form (so the UI can show an error
// before the user fills the whole form)
// ─────────────────────────────────────────────

export const validateInvite = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;

  const invite = await FacilitatorInvite.findOne({ token });

  if (!invite)              throw Errors.notFound('Invite link not found or already used');
  if (invite.used)          throw Errors.badRequest('This invite link has already been used');
  if (invite.expiresAt < new Date()) throw Errors.badRequest('This invite link has expired');

  sendSuccess(res, {
    valid:     true,
    expiresAt: invite.expiresAt,
    note:      invite.note,
  });
});

// ─────────────────────────────────────────────
// GET /api/v1/invite
// Admin only — list all active (unused) invites
// ─────────────────────────────────────────────

export const listInvites = asyncHandler(async (_req: Request, res: Response) => {
  const invites = await FacilitatorInvite.find({ used: false })
    .sort({ createdAt: -1 })
    .populate('usedBy', 'name email')
    .lean();

  sendSuccess(res, { invites });
});
