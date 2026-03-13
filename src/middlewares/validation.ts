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
  role:         z.enum(['girl', 'facilitator']).optional().default('girl'),
  ageGroup:     z.enum(['10-13', '14-18']).nullable().optional().default(null),
  consentGiven: z.boolean().optional().default(false),
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