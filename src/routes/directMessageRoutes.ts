import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { getMyThread, sendMessage } from '../controllers/directMessageController';

const router = Router();
router.use(requireAuth, requireRole('girl', 'facilitator'));

router.get('/',    getMyThread);
router.post('/',   sendMessage);

export default router;
