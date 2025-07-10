import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { sendEmail } from '../auth/sendMail';
import { IFeedback } from './feedback.interface';
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

const getAllFeedback = async (): Promise<IFeedback[]> => {
  const result = await Feedback.find().sort({ createdAt: -1 });
  return result;
};

const getFeedbackById = async (id: string): Promise<IFeedback | null> => {
  const feedback = await Feedback.findById(id);
  if (!feedback) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Feedback not found');
  }
  return feedback;
};
const sendReply = async ({message,email}: {message: string,email: string}): Promise<any> => {
  const result = await sendEmail(email, 'Reply to your feedback', message);
  return result;
};

export const FeedbackService = {
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getAllFeedback,
  getFeedbackById,
  sendReply
};