import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken }               from '../utils/jwt';
import { AuthRequest }                     from '../types';
import { Errors }                          from '../utils/appError';

// ─────────────────────────────────────────────
// requireAuth
//
// Reads the access token from:
//   1. httpOnly cookie  (browser clients)
//   2. Authorization header  (Bearer <token>)
//      — needed when the chatbot is embedded
//        in another site that passes tokens
//        in headers instead of cookies
//
// Attaches req.user = { userId, role, ageGroup }
// for use in all downstream controllers.
// ─────────────────────────────────────────────

export function requireAuth(
  req:  Request,
  res:  Response,
  next: NextFunction
): void {
  try {
    // 1. Cookie (primary — standalone app)
    let token: string | undefined = req.cookies?.access_token;

    // 2. Bearer header (fallback — embedded mode)
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) throw Errors.unauthorized('No access token provided');

    const payload = verifyAccessToken(token);

    // Attach decoded payload to request
    (req as AuthRequest).user = {
      userId:   payload.userId,
      role:     payload.role,
      ageGroup: payload.ageGroup,
    };

    next();
  } catch (err: any) {
    // jwt.verify throws TokenExpiredError, JsonWebTokenError etc.
    if (err.name === 'TokenExpiredError') {
      next(Errors.unauthorized('Access token expired'));
    } else if (err.name === 'JsonWebTokenError') {
      next(Errors.unauthorized('Invalid access token'));
    } else {
      next(err);
    }
  }
}

// ─────────────────────────────────────────────
// optionalAuth
//
// Same as requireAuth but does NOT fail if no
// token is present — used on chat endpoints that
// allow anonymous (guest) sessions.
// req.user will be undefined if no token given.
// ─────────────────────────────────────────────

export function optionalAuth(
  req:  Request,
  res:  Response,
  next: NextFunction
): void {
  try {
    let token: string | undefined = req.cookies?.access_token;

    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) return next(); // anonymous — just continue

    const payload = verifyAccessToken(token);
    (req as AuthRequest).user = {
      userId:   payload.userId,
      role:     payload.role,
      ageGroup: payload.ageGroup,
    };

    next();
  } catch {
    // Bad token on an optional route — treat as anonymous
    next();
  }
}

// ─────────────────────────────────────────────
// requireRole
//
// Use AFTER requireAuth.
// Restricts an endpoint to specific roles.
//
// Usage:
//   router.get('/flagged', requireAuth, requireRole('facilitator'), ...)
// ─────────────────────────────────────────────

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;
    if (!user) return next(Errors.unauthorized());
    if (!roles.includes(user.role)) {
      return next(Errors.forbidden('You do not have permission to access this resource'));
    }
    next();
  };
}