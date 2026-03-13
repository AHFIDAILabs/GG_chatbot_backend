import { Response } from 'express';
import { ApiSuccess, ApiError } from '../types';

// ─────────────────────────────────────────────
// sendSuccess
//
// Every successful API response goes through here.
// Keeps the response shape consistent across all
// controllers so the frontend always knows what
// to expect.
// ─────────────────────────────────────────────

export function sendSuccess<T>(
  res:        Response,
  data:       T,
  statusCode: number = 200
): void {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(statusCode).json(body);
}

// ─────────────────────────────────────────────
// sendError
//
// Used by the global error handler in server.ts.
// Controllers should throw AppError instead of
// calling this directly.
// ─────────────────────────────────────────────

export function sendError(
  res:        Response,
  message:    string,
  statusCode: number = 500,
  code?:      string
): void {
  const body: ApiError = { success: false, message, code };
  res.status(statusCode).json(body);
}