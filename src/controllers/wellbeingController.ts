import { Request, Response } from 'express';
import WellbeingLog          from '../models/WellbeingLog';
import { AuthRequest }       from '../types';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';

// Normalise any date to midnight UTC of that calendar day
function toMidnightUTC(d: Date | string): Date {
  const dt = new Date(d);
  return new Date(
    Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
  );
}

// ─────────────────────────────────────────────
// POST /api/v1/wellbeing
// Private — create or update today's check-in
// (idempotent: one entry per user per calendar day)
// ─────────────────────────────────────────────

export const checkIn = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { mood, note, date } = req.body;

  const day = toMidnightUTC(date ?? new Date());

  const log = await WellbeingLog.findOneAndUpdate(
    { userId, date: day },
    { $set: { mood, note: note ?? '' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  sendSuccess(res, { log }, 201);
});

// ─────────────────────────────────────────────
// GET /api/v1/wellbeing/today
// Private — fetch today's entry (if any)
// ─────────────────────────────────────────────

export const getToday = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const day        = toMidnightUTC(new Date());

  const log = await WellbeingLog.findOne({ userId, date: day }).lean();

  sendSuccess(res, { log: log ?? null });
});

// ─────────────────────────────────────────────
// GET /api/v1/wellbeing
// Private — paginated history, newest first
// ─────────────────────────────────────────────

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const limit  = Math.min(parseInt((req.query.limit as string) ?? '30', 10), 90);
  const page   = Math.max(parseInt((req.query.page  as string) ??  '1', 10), 1);

  // Optional date range filter
  const filter: Record<string, unknown> = { userId };
  if (req.query.from) filter['date'] = { $gte: toMidnightUTC(req.query.from as string) };
  if (req.query.to)   filter['date'] = { ...(filter['date'] as object ?? {}), $lte: toMidnightUTC(req.query.to as string) };

  const [logs, total] = await Promise.all([
    WellbeingLog.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    WellbeingLog.countDocuments(filter),
  ]);

  // Rolling 7-day average mood for the chart
  const last7 = logs.slice(0, 7);
  const avgMood7d =
    last7.length
      ? parseFloat(
          (last7.reduce((s, l) => s + l.mood, 0) / last7.length).toFixed(1),
        )
      : null;

  sendSuccess(res, { logs, total, page, totalPages: Math.ceil(total / limit), avgMood7d });
});

// ─────────────────────────────────────────────
// DELETE /api/v1/wellbeing/:id
// Private — remove a check-in entry
// ─────────────────────────────────────────────

export const deleteCheckIn = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  const log = await WellbeingLog.findOneAndDelete({ _id: id, userId });
  if (!log) throw Errors.notFound('Wellbeing log not found');

  sendSuccess(res, { message: 'Check-in deleted' });
});
