import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { FeedbackController } from './feedback.controller';

const router = express.Router();

router.post('/', auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN), FeedbackController.createFeedback);
router.patch('/:id', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.updateFeedback);
router.delete('/:id', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.deleteFeedback);

export const FeedbackRoutes = router; 