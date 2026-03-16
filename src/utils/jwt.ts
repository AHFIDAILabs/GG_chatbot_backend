import jwt from 'jsonwebtoken';
import { JwtPayload, JwtRefreshPayload } from '../types';
import { AgeGroupUser, UserRole }        from '../models/User';

const ACCESS_SECRET   = process.env.JWT_SECRET          as string;
const REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET  as string;
const ACCESS_EXPIRES  = process.env.JWT_ACCESS_EXPIRES  || '7d';   // extended from 15m
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '30d';  // extended from 7d

export function signAccessToken(
  userId:   string,
  role:     UserRole,
  ageGroup: AgeGroupUser
): string {
  const payload: JwtPayload = { userId, role, ageGroup };
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string): string {
  const payload: JwtRefreshPayload = { userId };
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtRefreshPayload;
}

const isProd = process.env.NODE_ENV === 'production';

export const accessCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,   // 7 days
};

export const refreshCookieOptions = {
  httpOnly: true,
  secure:   isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge:   30 * 24 * 60 * 60 * 1000,  // 30 days
  path:     '/api/v1/auth/refresh',
};