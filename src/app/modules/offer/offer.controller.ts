import { Request, RequestHandler, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { OfferService } from './offer.service';
import { IUser } from '../user/user.interface';

const createOrUpdateOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await OfferService.createOrUpdateOffer(
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
    const result = await OfferService.uploadOfferDocuments(
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
    const result = await OfferService.getOffers(req.user as Partial<IUser>);

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer created successfully!',
      data: result,
    });
  }
);

const updateOfferNotes: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await OfferService.updateOfferNotes(
      req.params.id,
      req.body,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer notes updated successfully!',
      data: result,
    });
  }
);

const deleteOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result = await OfferService.deleteOffer(req.params.id);

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
    const result = await OfferService.updateOffer(
      req.params.id,
      req.body,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Offer updated successfully!',
      data: result,
    });
  }
);

const updateDocumentStatus: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const { offerId, documentId, status } = req.body;
    const result = await OfferService.updateDocumentStatus(
      offerId,
      documentId,
      status,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Document ${
        status === 'granted' ? 'access granted' : 'access denied'
      } successfully!`,
      data: result,
    });
  }
);

const proRespondToOffer: RequestHandler = catchAsync(
  async (req: Request, res: Response) => {
    const offerId = req.params.id;
    const files = req.files as { originalname: string; path: string }[];
    // Status updates are passed as JSON string in form data
    const statusUpdates = req.body.statusUpdates
      ? JSON.parse(req.body.statusUpdates)
      : [];

    const result = await OfferService.proRespondToOffer(
      offerId,
      files || [],
      statusUpdates,
      req.user as Partial<IUser>
    );

    sendResponse<IUser>(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response submitted successfully!',
      data: result,
    });
  }
);

export const OfferController = {
  createOrUpdateOffer,
  uploadOfferDocuments,
  getOffers,
  deleteOffer,
  updateOffer,
  updateOfferNotes,
  updateDocumentStatus,
  proRespondToOffer,
};
