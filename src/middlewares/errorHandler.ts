import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError";
import { sendError } from "../utils/apiResponse";

// ─────────────────────────────────────────────
// Global Error Handler
//
// Must be registered LAST in server.ts after all
// routes:  app.use(errorHandler)
//
// Handles:
//  - AppError (operational — thrown by our code)
//  - Mongoose ValidationError
//  - Mongoose CastError (bad ObjectId)
//  - JWT errors (caught in auth middleware but
//    included here as a safety net)
//  - Unhandled errors (500)
// ─────────────────────────────────────────────

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  // ── Our own operational errors ──────────────
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.code);
    return;
  }

  // ── Mongoose: duplicate key (e.g. email) ────
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue ?? {})[0] ?? "field";
    sendError(res, `${field} already exists`, 409, "CONFLICT");
    return;
  }

  // ── Mongoose: validation error ──────────────
  if (err.name === "ValidationError") {
    const message = Object.values((err as any).errors)
      .map((e: any) => e.message)
      .join(", ");
    sendError(res, message, 400, "VALIDATION_ERROR");
    return;
  }

  // ── Mongoose: bad ObjectId ───────────────────
  if (err.name === "CastError") {
    sendError(res, "Invalid ID format", 400, "BAD_REQUEST");
    return;
  }

  // ── JWT errors (safety net) ──────────────────
  if (err.name === "TokenExpiredError") {
    sendError(res, "Token expired", 401, "UNAUTHORIZED");
    return;
  }
  if (err.name === "JsonWebTokenError") {
    sendError(res, "Invalid token", 401, "UNAUTHORIZED");
    return;
  }

  // ── Unknown / programming errors ─────────────
  // Log the full error in development, hide details in production
  if (process.env.NODE_ENV === "development") {
    console.error("💥 Unhandled error:", err);
    sendError(res, err.message, 500, "INTERNAL_ERROR");
  } else {
    console.error("💥 Unhandled error:", err.message);
    sendError(
      res,
      "Something went wrong. Please try again.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
