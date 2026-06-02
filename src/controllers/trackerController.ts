import { Request, Response } from 'express';
import mongoose              from 'mongoose';
import PeriodLog             from '../models/PeriodLog';
import { AuthRequest }       from '../types';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
// POST /api/v1/tracker/period
// Private — log the start of a new period
// ─────────────────────────────────────────────

export const logPeriod = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { startDate, endDate, flow, notes } = req.body;

  const start = new Date(startDate);

  // Prevent duplicate logs within 2 days of an existing start date
  const nearby = await PeriodLog.findOne({
    userId,
    startDate: {
      $gte: new Date(start.getTime() - TWO_DAYS_MS),
      $lte: new Date(start.getTime() + TWO_DAYS_MS),
    },
  });
  if (nearby) throw Errors.conflict('A period log already exists near this start date');

  const end      = endDate ? new Date(endDate) : null;
  const duration = end
    ? Math.round((end.getTime() - start.getTime()) / 86_400_000)
    : null;

  const log = await PeriodLog.create({
    userId,
    startDate: start,
    endDate:   end,
    duration,
    flow:  flow  ?? 'medium',
    notes: notes ?? '',
  });

  sendSuccess(res, { log }, 201);
});

// ─────────────────────────────────────────────
// GET /api/v1/tracker/period
// Private — list all period logs (newest first)
// ─────────────────────────────────────────────

export const getPeriodLogs = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const limit  = Math.min(parseInt((req.query.limit  as string) ?? '12', 10), 50);
  const page   = Math.max(parseInt((req.query.page   as string) ??  '1', 10), 1);

  const [logs, total] = await Promise.all([
    PeriodLog.find({ userId })
      .sort({ startDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PeriodLog.countDocuments({ userId }),
  ]);

  sendSuccess(res, { logs, total, page, totalPages: Math.ceil(total / limit) });
});

// ─────────────────────────────────────────────
// GET /api/v1/tracker/period/prediction
// Private — predict next cycle start + end
// ─────────────────────────────────────────────

export const getPrediction = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  // Use last 6 cycles for prediction
  const logs = await PeriodLog.find({ userId })
    .sort({ startDate: -1 })
    .limit(6)
    .lean();

  if (logs.length < 2) {
    return sendSuccess(res, {
      prediction: null,
      message:    'Need at least 2 logged cycles to predict the next one',
    });
  }

  const sorted = [...logs].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff =
      (new Date(sorted[i].startDate).getTime() -
        new Date(sorted[i - 1].startDate).getTime()) /
      86_400_000;
    gaps.push(Math.round(diff));
  }

  const avgCycleLength = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const lastStart      = new Date(sorted[sorted.length - 1].startDate);
  const predictedStart = new Date(lastStart.getTime() + avgCycleLength * 86_400_000);

  const withDuration   = logs.filter((l) => l.duration != null);
  const avgDuration    = withDuration.length
    ? Math.round(
        withDuration.reduce((a, b) => a + (b.duration as number), 0) /
          withDuration.length,
      )
    : 5;

  const predictedEnd = new Date(
    predictedStart.getTime() + avgDuration * 86_400_000,
  );

  sendSuccess(res, {
    prediction: {
      nextStart:      predictedStart,
      nextEnd:        predictedEnd,
      avgCycleLength,
      avgDuration,
      basedOnCycles:  gaps.length,
    },
  });
});

// ─────────────────────────────────────────────
// PATCH /api/v1/tracker/period/:id
// Private — update a period log
// ─────────────────────────────────────────────

export const updatePeriodLog = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid log ID');

  const allowed = ['endDate', 'flow', 'notes'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (updates.endDate) {
    const log = await PeriodLog.findOne({ _id: id, userId });
    if (!log) throw Errors.notFound('Period log not found');
    const end        = new Date(updates.endDate as string);
    updates.duration = Math.round((end.getTime() - log.startDate.getTime()) / 86_400_000);
    updates.endDate  = end;
  }

  const log = await PeriodLog.findOneAndUpdate(
    { _id: id, userId },
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!log) throw Errors.notFound('Period log not found');

  sendSuccess(res, { log });
});

// ─────────────────────────────────────────────
// DELETE /api/v1/tracker/period/:id
// Private
// ─────────────────────────────────────────────

export const deletePeriodLog = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid log ID');

  const log = await PeriodLog.findOneAndDelete({ _id: id, userId });
  if (!log) throw Errors.notFound('Period log not found');

  sendSuccess(res, { message: 'Period log deleted' });
});
