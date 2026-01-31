import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { PartnerVerificationService } from './partner-verification.service';

const verifyPartner = catchAsync(async (req: Request, res: Response) => {
  const file = req.file;
  const userId = req.user?._id;
  const { licenseNumber, ein } = req.body;

  const result = await PartnerVerificationService.verifyPartner(file, {
    licenseNumber,
    ein,
    user: userId as string,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Partner verification submitted successfully!',
    data: result,
  });
});

const getPartnerVerification = catchAsync(
  async (req: Request, res: Response) => {
    const userId = req.user?._id || req.query.userId;

    const result = await PartnerVerificationService.getPartnerVerification(
      userId as string
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Verification status retrieved successfully!',
      data: result,
    });
  }
);

export const PartnerVerificationController = {
  verifyPartner,
  getPartnerVerification,
};
