import jwt from "jsonwebtoken";
import { JwtPayload, JwtRefreshPayload } from "../types";
import { AgeGroupUser, UserRole } from "../models/User";

// ─────────────────────────────────────────────
// Config — pulled from env, validated at startup
// ─────────────────────────────────────────────

const ACCESS_SECRET = process.env.JWT_SECRET as string;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRE || "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRE || "7d";

// ─────────────────────────────────────────────
// Sign tokens
// ─────────────────────────────────────────────

export function signAccessToken(
  userId: string,
  role: UserRole,
  ageGroup: AgeGroupUser,
): string {
  const payload: JwtPayload = { userId, role, ageGroup };
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(userId: string): string {
  const payload: JwtRefreshPayload = { userId };
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES as jwt.SignOptions["expiresIn"],
  });
}

// ─────────────────────────────────────────────
// Verify tokens
// ─────────────────────────────────────────────

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtRefreshPayload;
}

// ─────────────────────────────────────────────
// Cookie options
// Reused in authController for both set and clear
// ─────────────────────────────────────────────

export const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 15 * 60 * 1000, // 15 minutes in ms
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: "/api/v1/auth/refresh", // restrict refresh token to refresh endpoint only
};
