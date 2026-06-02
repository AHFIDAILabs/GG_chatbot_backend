import { Request, Response } from 'express';
import mongoose              from 'mongoose';
import Goal                  from '../models/Goal';
import User                  from '../models/User';
import { AuthRequest }       from '../types';
import { Errors, asyncHandler } from '../utils/appError';
import { sendSuccess }       from '../utils/apiResponse';

const PILLAR_BADGE_MAP: Record<string, string> = {
  menstrual_hygiene: 'badge_menstrual_hygiene',
  environment:       'badge_environment',
  digital_skills:    'badge_digital_skills',
  life_skills:       'badge_life_skills',
};

// Award a pillar badge if all goals in that pillar are done
async function checkAndAwardBadge(userId: string, pillar: string): Promise<void> {
  const badgeKey = PILLAR_BADGE_MAP[pillar];
  if (!badgeKey) return;

  const [total, done] = await Promise.all([
    Goal.countDocuments({ userId, pillar }),
    Goal.countDocuments({ userId, pillar, status: 'done' }),
  ]);

  if (total >= 3 && done === total) {
    await User.findByIdAndUpdate(userId, { $addToSet: { badges: badgeKey } });
  }
}

// ─────────────────────────────────────────────
// POST /api/v1/goals
// Private — create a new goal
// ─────────────────────────────────────────────

export const createGoal = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { title, pillar, deadline, steps } = req.body;

  const goal = await Goal.create({
    userId,
    title,
    pillar:   pillar   ?? 'personal',
    deadline: deadline ? new Date(deadline) : null,
    steps:    (steps ?? []).map((s: string | { text: string }) =>
      typeof s === 'string' ? { text: s, done: false } : { text: s.text, done: false },
    ),
    status: 'not_started',
  });

  sendSuccess(res, { goal }, 201);
});

// ─────────────────────────────────────────────
// GET /api/v1/goals
// Private — list goals with optional status filter
// ─────────────────────────────────────────────

export const getGoals = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;

  const filter: Record<string, unknown> = { userId };
  if (req.query.status) filter['status'] = req.query.status;
  if (req.query.pillar) filter['pillar'] = req.query.pillar;

  const goals = await Goal.find(filter).sort({ createdAt: -1 }).lean();

  sendSuccess(res, { goals });
});

// ─────────────────────────────────────────────
// GET /api/v1/goals/:id
// Private
// ─────────────────────────────────────────────

export const getGoal = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid goal ID');

  const goal = await Goal.findOne({ _id: id, userId }).lean();
  if (!goal) throw Errors.notFound('Goal not found');

  sendSuccess(res, { goal });
});

// ─────────────────────────────────────────────
// PATCH /api/v1/goals/:id
// Private — update title, deadline, status
// ─────────────────────────────────────────────

export const updateGoal = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid goal ID');

  const allowed = ['title', 'pillar', 'deadline', 'status'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = key === 'deadline' ? new Date(req.body[key]) : req.body[key];
    }
  }

  const goal = await Goal.findOneAndUpdate(
    { _id: id, userId },
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!goal) throw Errors.notFound('Goal not found');

  // Auto-award badge when a goal is marked done
  if (updates.status === 'done') {
    await checkAndAwardBadge(userId, goal.pillar);
  }

  sendSuccess(res, { goal });
});

// ─────────────────────────────────────────────
// PATCH /api/v1/goals/:id/steps/:stepId
// Private — toggle a single step done/undone
// ─────────────────────────────────────────────

export const updateStep = asyncHandler(async (req: Request, res: Response) => {
  const { userId }  = (req as AuthRequest).user;
  const { id, stepId } = req.params;
  const { done }    = req.body;

  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(stepId)) {
    throw Errors.badRequest('Invalid ID');
  }

  const goal = await Goal.findOne({ _id: id, userId });
  if (!goal) throw Errors.notFound('Goal not found');

  const step = goal.steps.find(s => s._id?.toString() === stepId);
  if (!step) throw Errors.notFound('Step not found');

  step.done = Boolean(done);

  // Derive goal status from steps
  const allDone  = goal.steps.every((s) => s.done);
  const anyDone  = goal.steps.some((s) => s.done);
  goal.status    = allDone ? 'done' : anyDone ? 'in_progress' : 'not_started';

  await goal.save();

  if (goal.status === 'done') {
    await checkAndAwardBadge(userId, goal.pillar);
  }

  sendSuccess(res, { goal });
});

// ─────────────────────────────────────────────
// DELETE /api/v1/goals/:id
// Private
// ─────────────────────────────────────────────

export const deleteGoal = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = (req as AuthRequest).user;
  const { id }     = req.params;

  if (!mongoose.isValidObjectId(id)) throw Errors.badRequest('Invalid goal ID');

  const goal = await Goal.findOneAndDelete({ _id: id, userId });
  if (!goal) throw Errors.notFound('Goal not found');

  sendSuccess(res, { message: 'Goal deleted' });
});
