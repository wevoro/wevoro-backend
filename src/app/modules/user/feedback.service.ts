import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { Feedback } from './feedback.model';

const createFeedback = async (payload: any) => {
  const feedback = await Feedback.create(payload);
  return feedback;
};

const updateFeedback = async (id: string, payload: any) => {
  const feedback = await Feedback.findByIdAndUpdate(id, payload, { new: true });
  if (!feedback) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Feedback not found');
  }
  return feedback;
};

const deleteFeedback = async (id: string) => {
  const feedback = await Feedback.findByIdAndDelete(id);
  if (!feedback) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Feedback not found');
  }
  return feedback;
};

export const FeedbackService = {
  createFeedback,
  updateFeedback,
  deleteFeedback,
};
