import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { CredentialingService } from './credentialing.service';

/**
 * SCRUM-87: caregiver's repurposed Offers tab — Submitted/Received agency
 * engagements for the authenticated caregiver.
 */
const getCaregiverEngagements = catchAsync(
  async (req: Request, res: Response) => {
    const caregiverId = req.user?._id as string;
    const result = await CredentialingService.getCaregiverEngagements(
      caregiverId
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Caregiver engagements retrieved successfully!',
      data: result,
    });
  }
);

/**
 * SCRUM-88: agency's repurposed Offers tab — Submitted/Received caregiver
 * engagements for the authenticated agency.
 */
const getAgencyEngagements = catchAsync(async (req: Request, res: Response) => {
  const agencyId = req.user?._id as string;
  const result = await CredentialingService.getAgencyEngagements(agencyId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Agency engagements retrieved successfully!',
    data: result,
  });
});

export const CredentialingController = {
  getCaregiverEngagements,
  getAgencyEngagements,
};
