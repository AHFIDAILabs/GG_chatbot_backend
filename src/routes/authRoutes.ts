import { Router } from 'express';
import * as auth   from '../controllers/authController';
import { requireAuth }             from '../middlewares/auth';
import { validate, registerSchema, loginSchema } from '../middlewares/validation';

const authRouter = Router();

// ─────────────────────────────────────────────
// Public
// ─────────────────────────────────────────────

// POST /api/auth/register
authRouter.post('/register', validate(registerSchema), auth.register);

// POST /api/auth/login
authRouter.post('/login', validate(loginSchema), auth.login);

// POST /api/auth/refresh  — uses httpOnly refresh token cookie
authRouter.post('/refresh', auth.refresh);

// ─────────────────────────────────────────────
// Private
// ─────────────────────────────────────────────

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, auth.logout);

// GET  /api/auth/me
authRouter.get('/me', requireAuth, auth.me);

// PATCH /api/auth/me
authRouter.patch('/me', requireAuth, auth.updateMe);

// PATCH /api/auth/change-password
authRouter.patch('/change-password', requireAuth, auth.changePassword);

export default authRouter;