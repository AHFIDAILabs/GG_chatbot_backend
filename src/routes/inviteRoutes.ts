import { Router }                            from 'express';
import { requireAdminSecret, generateInvite, validateInvite, listInvites } from '../controllers/inviteController';

const router = Router();

// Admin: generate a new facilitator invite link
// POST /api/v1/invite/generate
// Header: X-Admin-Secret: <secret>
router.post('/generate', requireAdminSecret, generateInvite);

// Admin: list active (unused) invites
// GET /api/v1/invite
// Header: X-Admin-Secret: <secret>
router.get('/', requireAdminSecret, listInvites);

// Public: check if a token is still valid
// GET /api/v1/invite/:token
router.get('/:token', validateInvite);

export default router;
