import cloudinary from 'cloudinary';
import httpStatus from 'http-status';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { sendEmail } from '../auth/sendMail';
import { IFeedback } from './feedback.interface';
import { Feedback } from './feedback.model';

cloudinary.v2.config({
  cloud_name: config.cloudinary.cloud_name,
  api_key: config.cloudinary.api_key,
  api_secret: config.cloudinary.api_secret,
});

/**
 * SCRUM-201: the screenshot arrives as a data URI in the JSON body, the way
 * the feedback widget already sends everything else, so nothing about the
 * public /feedback route changes shape.
 *
 * This route takes no token — anyone on the internet can post to it — so the
 * picture is checked here before it goes anywhere: an image only, and small
 * enough that a 50mb body cannot be used to fill the Cloudinary account. The
 * widget already shrinks what it sends to about 1600px wide, so a real
 * screenshot lands far under this.
 */
const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;
const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const storeScreenshot = async (dataUri: string): Promise<string> => {
  if (!IMAGE_DATA_URI.test(dataUri)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'The screenshot must be a PNG, JPEG, WebP or GIF image.');
  }
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  if (Buffer.byteLength(base64, 'base64') > MAX_SCREENSHOT_BYTES) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'That screenshot is too large. Please send one under 6 MB.');
  }
  const cloudRes = await cloudinary.v2.uploader.upload(dataUri, {
    upload_preset: 'wevoro',
    resource_type: 'image',
  });
  return cloudRes.secure_url;
};

const createFeedback = async (payload: any) => {
  const { screenshot, ...rest } = payload || {};
  const body: any = { ...rest };
  if (typeof screenshot === 'string' && screenshot.trim()) {
    body.screenshot = await storeScreenshot(screenshot.trim());
  }
  const feedback = await Feedback.create(body);
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