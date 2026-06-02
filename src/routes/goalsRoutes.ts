import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { validate }    from '../middlewares/validation';
import {
  createGoal,
  getGoals,
  getGoal,
  updateGoal,
  updateStep,
  deleteGoal,
} from '../controllers/goalsController';
import { createGoalSchema, updateGoalSchema, updateStepSchema } from '../middlewares/validation';

const router = Router();

router.use(requireAuth);

router.post(  '/',                    validate(createGoalSchema), createGoal);
router.get(   '/',                                                getGoals);
router.get(   '/:id',                                            getGoal);
router.patch( '/:id',                 validate(updateGoalSchema), updateGoal);
router.patch( '/:id/steps/:stepId',   validate(updateStepSchema), updateStep);
router.delete('/:id',                                             deleteGoal);

export default router;
