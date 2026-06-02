import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema }                    from 'zod';
import { Errors }                          from '../utils/appError';

// ─────────────────────────────────────────────
// validate
//
// Generic Zod middleware factory.
// Pass in a Zod schema and it validates req.body,
// attaches the parsed (sanitised) data back to
// req.body, and calls next() if valid.
//
// Usage:
//   router.post('/register', validate(registerSchema), authController.register)
// ─────────────────────────────────────────────

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return next(Errors.badRequest(message));
    }
    req.body = result.data; // replace with sanitised data
    next();
  };
}

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const registerSchema = z.object({
  name:  z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z
    .string()
    .min(8,  'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  // inviteToken present → facilitator flow; absent → girl flow
  inviteToken:  z.string().uuid('Invalid invite token').optional(),
  groupCode:    z.string().trim().min(4).max(12).toUpperCase().optional(),
  ageGroup:     z.enum(['10-13', '14-18']).nullable().optional().default(null),
  consentGiven: z.boolean().optional().default(false),
});

// ── Facilitator invite ────────────────────────────────────────────────────────

export const generateInviteSchema = z.object({
  note:           z.string().max(200).optional().default(''),
  expiresInHours: z.number().int().min(1).max(168).optional().default(48),
});

export const loginSchema = z.object({
  email:    z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const sendMessageSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1,    'Question cannot be empty')
    .max(1000, 'Question cannot exceed 1000 characters'),
});

export const createConversationSchema = z.object({
  ageGroup:    z.enum(['10-13', '14-18']).nullable().optional().default(null),
  isAnonymous: z.boolean().optional().default(false),
  language:    z.enum(['en', 'pidgin', 'yoruba', 'hausa']).optional().default('en'),
});

// ── Period Tracker ────────────────────────────────────────────────────────────

export const logPeriodSchema = z.object({
  startDate: z.string().datetime({ message: 'startDate must be an ISO date string' }),
  endDate:   z.string().datetime().optional().nullable(),
  flow:      z.enum(['light', 'medium', 'heavy']).optional().default('medium'),
  notes:     z.string().max(500).optional().default(''),
});

export const updatePeriodSchema = z.object({
  endDate: z.string().datetime().optional().nullable(),
  flow:    z.enum(['light', 'medium', 'heavy']).optional(),
  notes:   z.string().max(500).optional(),
});

// ── Wellbeing Check-in ────────────────────────────────────────────────────────

export const checkInSchema = z.object({
  mood: z.number().int().min(1).max(5),
  note: z.string().max(300).optional().default(''),
  date: z.string().datetime().optional(),   // defaults to today if omitted
});

// ── Goals ─────────────────────────────────────────────────────────────────────

const PILLARS = ['menstrual_hygiene', 'environment', 'digital_skills', 'life_skills', 'personal'] as const;

export const createGoalSchema = z.object({
  title:    z.string().trim().min(1).max(150),
  pillar:   z.enum(PILLARS).optional().default('personal'),
  deadline: z.string().datetime().optional().nullable(),
  steps:    z.array(
    z.union([
      z.string().min(1).max(200),
      z.object({ text: z.string().min(1).max(200) }),
    ]),
  ).optional().default([]),
});

export const updateGoalSchema = z.object({
  title:    z.string().trim().min(1).max(150).optional(),
  pillar:   z.enum(PILLARS).optional(),
  deadline: z.string().datetime().optional().nullable(),
  status:   z.enum(['not_started', 'in_progress', 'done']).optional(),
});

export const updateStepSchema = z.object({
  done: z.boolean(),
});

// ── Facilitator ───────────────────────────────────────────────────────────────

export const facilitatorAckSchema = z.object({
  note: z.string().max(1000).optional().nullable(),
});

export const facilitatorReplySchema = z.object({
  reply: z.string().trim().min(1).max(2000),
});

// ── Admin ─────────────────────────────────────────────────────────────────────

export const seedAdminSchema = z.object({
  name:     z.string().trim().min(2).max(80),
  email:    z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(72),
});

// ── Bookmarks / Progress ──────────────────────────────────────────────────────

export const topicIdSchema = z.object({
  topicId: z.string().trim().min(1).max(100),
});