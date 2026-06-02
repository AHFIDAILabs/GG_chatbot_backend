import { Router }       from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate }     from '../middlewares/validation';
import { generateInviteSchema, seedAdminSchema } from '../middlewares/validation';
import {
  requireAdminSecret,
  seedAdmin,
  generateInvite,
  listInvites,
  revokeInvite,
  listFacilitators,
  getStats,
  getUnassignedGirls,
  assignGirl,
} from '../controllers/adminController';

const router = Router();

// One-time bootstrap — protected by ADMIN_SECRET header only (no JWT needed)
router.post('/seed', requireAdminSecret, validate(seedAdminSchema), seedAdmin);

// All other admin routes require a logged-in admin
router.use(requireAuth, requireRole('admin'));

router.get( '/stats',           getStats);
router.get( '/invites',         listInvites);
router.post('/invites',         validate(generateInviteSchema), generateInvite);
router.delete('/invites/:id',   revokeInvite);
router.get( '/facilitators',        listFacilitators);
router.get( '/girls/unassigned',    getUnassignedGirls);
router.patch('/girls/:id/assign',   assignGirl);

export default router;
