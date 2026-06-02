import { Router } from 'express';
import * as auth   from '../controllers/authController';
import { requireAuth }             from '../middlewares/auth';
import { validate, registerSchema, loginSchema, topicIdSchema } from '../middlewares/validation';

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

// PATCH /api/auth/me/facilitator — girl links herself to a facilitator via group code
authRouter.patch('/me/facilitator', requireAuth, auth.setFacilitator);

// PATCH /api/auth/change-password
authRouter.patch('/change-password', requireAuth, auth.changePassword);

// ─────────────────────────────────────────────
// Bookmarks + Learning Progress
// ─────────────────────────────────────────────

authRouter.post(  '/bookmarks',             requireAuth, validate(topicIdSchema), auth.addBookmark);
authRouter.delete('/bookmarks/:topicId',    requireAuth,                          auth.removeBookmark);
authRouter.get(   '/bookmarks',             requireAuth,                          auth.getBookmarks);
authRouter.post(  '/resources/visited',     requireAuth, validate(topicIdSchema), auth.markVisited);
authRouter.get(   '/resources/visited',     requireAuth,                          auth.getProgress);

export default authRouter;