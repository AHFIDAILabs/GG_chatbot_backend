import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate }    from '../middlewares/validation';
import {
  logPeriod,
  getPeriodLogs,
  getPrediction,
  updatePeriodLog,
  deletePeriodLog,
} from '../controllers/trackerController';
import { logPeriodSchema, updatePeriodSchema } from '../middlewares/validation';

const router = Router();

router.use(requireAuth);

router.post(  '/',             validate(logPeriodSchema),    logPeriod);
router.get(   '/',                                           getPeriodLogs);
router.get(   '/prediction',                                 getPrediction);
router.patch( '/:id',          validate(updatePeriodSchema), updatePeriodLog);
router.delete('/:id',                                        deletePeriodLog);

export default router;
