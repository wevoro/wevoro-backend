import { Request, Response } from 'express';
import { RequestHandler } from 'express-serve-static-core';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { IUser } from './user.interface';
import { UserService } from './user.service';

const joinWaitlist: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.joinWaitlist(req.body.email);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'You have been added to the waitlist!',
      data: result,
    });
  }
);
const createUser: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.createUser(req.body);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Signup successful! Please login to continue.',
      data: result,
    });
  }
);

const updateUser: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id;

    const result = await UserService.updateUser(req.body, id);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User profile updated successfully!',
      data: result,
    });
  }
);
const updateAllUsers: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.updateAllUsers();

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User profile updated successfully!',
      data: result,
    });
  }
);

const updateOrCreateUserPersonalInformation = catchAsync(
  async (req: Request, res: Response) => {
    const data = JSON.parse(req.body.data || '{}');
    console.log('🚀 ~ data:', data)
    const queryId = req.query.id;

    const id = queryId ? queryId : req.user?._id;

    const result = await UserService.updateOrCreateUserPersonalInformation(
      data,
      id as string,
      req.file
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User personal information updated successfully!',
      data: result,
    });
  }
);

const updateOrCreateUserProfessionalInformation = catchAsync(
  async (req: Request, res: Response) => {
    const data = JSON.parse(req.body.data || '{}');
    console.log('🚀 ~ data:', data)
    const files = req.files;
    const queryId = req.query.id;

    const id = queryId ? queryId : req.user?._id;

    const result = await UserService.updateOrCreateUserProfessionalInformation(
      data,
      id as string,
      files
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User professional information updated successfully!',
      data: result,
    });
  }
);
const updateOrCreateUserDocuments = catchAsync(
  async (req: Request, res: Response) => {
    const files = req.files;
    const payload = JSON.parse(req.body.data || '{}');

    const queryId = req.query.id;

    const id = queryId ? queryId : req.user?._id;
    const result = await UserService.updateOrCreateUserDocuments(
      id as string,
      files,
      payload
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User documents updated successfully!',
      data: result,
    });
  }
);

const getUserProfile: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getUserProfile(req.user as Partial<IUser>);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User profile retrieved successfully!',
      data: result,
    });
  }
);
const getUsers: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getUsers();

    sendResponse<IUser[]>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User profile retrieved successfully!',
      data: result,
    });
  }
);

const getPros: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getPros(req.user as Partial<IUser>);

    sendResponse<IUser[]>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Pros retrieved successfully!',
      data: result,
    });
  }
);

const getUserById: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getUserById(req.params.id);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User profile retrieved successfully!',
      data: result,
    });
  }
);
const updateCoverImage: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;
    const result = await UserService.updateCoverImage(user?._id, req.file);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'User cover image updated successfully!',
      data: result,
    });
  }
);

const createOrUpdateOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.createOrUpdateOffer(
      req.body,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer created successfully!',
      data: result,
    });
  }
);
const uploadOfferDocuments: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.uploadOfferDocuments(
      req.files,
      req.params.id
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer documents uploaded successfully!',
      data: result,
    });
  }
);
const getOffers: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getOffers(req.user as Partial<IUser>);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer created successfully!',
      data: result,
    });
  }
);
const deleteOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.deleteOffer(req.params.id);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer deleted successfully!',
      data: result,
    });
  }
);
const updateOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.updateOffer(req.params.id, req.body);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer updated successfully!',
      data: result,
    });
  }
);
const updateOfferNotes: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.updateOfferNotes(req.params.id, req.body);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer notes updated successfully!',
      data: result,
    });
  }
);

const storePro: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.storePro(
      req.body,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Pro stored successfully!',
      data: result,
    });
  }
);

const createNotification: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.createNotification(req.body);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Notification created successfully!',
      data: result,
    });
  }
);

const getNotifications: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.getNotifications(
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Notifications retrieved successfully!',
      data: result,
    });
  }
);
const deleteNotification: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.deleteNotification(req.params.id);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Notification deleted successfully!',
      data: result,
    });
  }
);
const markAllNotificationsAsRead: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.markAllNotificationsAsRead(
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'All notifications marked as read!',
      data: result,
    });
  }
);

const deleteAccount: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await UserService.deleteAccount(req.user as Partial<IUser>);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Account deleted successfully!',
      data: result,
    });
  }
);

export const UserController = {
  createUser,
  updateUser,
  getUserProfile,
  updateOrCreateUserPersonalInformation,
  updateOrCreateUserProfessionalInformation,
  updateOrCreateUserDocuments,
  getUserById,
  updateCoverImage,
  getPros,
  joinWaitlist,
  createOrUpdateOffer,
  getOffers,
  deleteOffer,
  uploadOfferDocuments,
  storePro,
  updateOffer,
  updateOfferNotes,
  createNotification,
  getNotifications,
  deleteNotification,
  markAllNotificationsAsRead,
  deleteAccount,
  getUsers,
  updateAllUsers,
};
