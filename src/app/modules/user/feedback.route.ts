import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { FeedbackController } from './feedback.controller';

const router = express.Router();

router.get('/',  FeedbackController.getAllFeedback);
router.get('/:id', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.getFeedbackById);
router.post('/',  FeedbackController.createFeedback);
router.patch('/:id', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.updateFeedback);
router.delete('/:id', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.deleteFeedback);
router.post('/reply', auth(ENUM_USER_ROLE.ADMIN), FeedbackController.sendReply);


export const FeedbackRoutes = router; 