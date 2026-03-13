import { Request, Response, NextFunction } from 'express';

// ─────────────────────────────────────────────
// AppError
//
// All thrown errors in controllers and services
// should be instances of this class.
// The global error handler checks for it and
// responds with the correct HTTP status.
// ─────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code:       string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.statusCode    = statusCode;
    this.code          = code ?? 'INTERNAL_ERROR';
    this.isOperational = true;          // operational = safe to expose to client
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─────────────────────────────────────────────
// Common error factories
// Keeps controllers clean — no magic numbers
// ─────────────────────────────────────────────

export const Errors = {
  badRequest:    (msg: string)  => new AppError(msg, 400, 'BAD_REQUEST'),
  unauthorized:  (msg?: string) => new AppError(msg ?? 'Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden:     (msg?: string) => new AppError(msg ?? 'Forbidden', 403, 'FORBIDDEN'),
  notFound:      (msg?: string) => new AppError(msg ?? 'Resource not found', 404, 'NOT_FOUND'),
  conflict:      (msg: string)  => new AppError(msg, 409, 'CONFLICT'),
  tooMany:       (msg?: string) => new AppError(msg ?? 'Too many requests', 429, 'TOO_MANY_REQUESTS'),
  internal:      (msg?: string) => new AppError(msg ?? 'Internal server error', 500, 'INTERNAL_ERROR'),
} as const;

// ─────────────────────────────────────────────
// asyncHandler
//
// Wraps async route handlers so we don't need
// try/catch in every controller function.
// Unhandled promise rejections are forwarded
// to Express's next(err) error pipeline.
//
// Usage:
//   router.post('/login', asyncHandler(authController.login));
// ─────────────────────────────────────────────

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncFn) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}