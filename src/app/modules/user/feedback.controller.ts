import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { FeedbackService } from './feedback.service';

const createFeedback = catchAsync(async (req: Request, res: Response) => {
  const result = await FeedbackService.createFeedback(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback created successfully',
    data: result,
  });
});
const sendReply = catchAsync(async (req: Request, res: Response) => {
  const result = await FeedbackService.sendReply(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback created successfully',
    data: result,
  });
});

const updateFeedback = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await FeedbackService.updateFeedback(id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback updated successfully',
    data: result,
  });
});

const deleteFeedback = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await FeedbackService.deleteFeedback(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback deleted successfully',
    data: result,
  });
});

const getAllFeedback = catchAsync(async (req: Request, res: Response) => {
  const result = await FeedbackService.getAllFeedback();
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback retrieved successfully',
    data: result,
  });
});

const getFeedbackById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await FeedbackService.getFeedbackById(id);
  
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Feedback retrieved successfully',
    data: result,
  });
});

export const FeedbackController = {
  createFeedback,
  updateFeedback,
  deleteFeedback,
  getAllFeedback,
  getFeedbackById,
  sendReply
};
