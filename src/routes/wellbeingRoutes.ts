import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate }    from '../middlewares/validation';
import {
  checkIn,
  getToday,
  getHistory,
  deleteCheckIn,
} from '../controllers/wellbeingController';
import { checkInSchema } from '../middlewares/validation';

const router = Router();

router.use(requireAuth);

router.post(  '/',       validate(checkInSchema), checkIn);
router.get(   '/today',                           getToday);
router.get(   '/',                                getHistory);
router.delete('/:id',                             deleteCheckIn);

export default router;
