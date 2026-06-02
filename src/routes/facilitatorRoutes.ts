import { Router }     from 'express';
import { requireAuth, requireRole } from '../middlewares/auth';
import { validate }   from '../middlewares/validation';
import {
  getFlaggedConversations,
  acknowledge,
  replyToGirl,
  resolve,
  getGirls,
  getGirlProgress,
  getMessageThreads,
  getThreadWithGirl,
  sendMessageToGirl,
} from '../controllers/facilitatorController';
import { facilitatorReplySchema, facilitatorAckSchema } from '../middlewares/validation';

const router = Router();

// All facilitator routes require an authenticated facilitator
router.use(requireAuth, requireRole('facilitator'));

router.get(  '/flagged',                           getFlaggedConversations);
router.get(  '/girls',                             getGirls);
router.get(  '/girls/:girlId/progress',            getGirlProgress);

router.patch('/conversations/:id/acknowledge',
  validate(facilitatorAckSchema),   acknowledge);

router.post( '/conversations/:id/reply',
  validate(facilitatorReplySchema), replyToGirl);

router.patch('/conversations/:id/resolve',         resolve);

router.get( '/messages',               getMessageThreads);
router.get( '/messages/:girlId',       getThreadWithGirl);
router.post('/messages/:girlId',       sendMessageToGirl);

export default router;
