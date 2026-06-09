import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { DocumentService } from './document.service';
import { DownloadService } from './download.service';

const uploadDocument = catchAsync(async (req: Request, res: Response) => {
  const file = req.file;
  const userId = req.user?._id;
  const { category, documentType, title, isPublic, consent, documentId } =
    req.body;

  const result = await DocumentService.uploadDocument(
    file,
    {
      category,
      documentType,
      title,
      isPublic: isPublic === 'true' || isPublic === true,
      consent: consent === 'true' || consent === true,
      user: userId as string,
    },
    documentId as string,
    userId as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document uploaded successfully!',
    data: result,
  });
});

const getUserDocuments = catchAsync(async (req: Request, res: Response) => {
  const queryUserId = req.query.userId;
  const userId = queryUserId ? queryUserId : req.user?._id;

  const result = await DocumentService.getUserDocuments(userId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documents retrieved successfully!',
    data: result,
  });
});

const deleteDocument = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { documentId } = req.params;

  const result = await DocumentService.deleteDocument(
    userId as string,
    documentId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document deleted successfully!',
    data: result,
  });
});

const reviewDocument = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason } = req.body;

  const result = await DocumentService.reviewDocument(documentId, {
    reviewStatus,
    credentialIdNumber,
    credentialIssueDate,
    credentialExpirationDate,
    issuingOrganization,
    rejectionReason,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Document ${reviewStatus} successfully!`,
    data: result,
  });
});

const getCredentialStatus = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const result = await DocumentService.getCredentialStatus(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Credential status retrieved successfully!',
    data: result,
  });
});

const removeCredential = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const result = await DocumentService.removeCredential(documentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Credential removed successfully!',
    data: result,
  });
});

// SCRUM-67: Download a single document
const downloadDocument = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.downloadDocument(documentId, agencyId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document download URL retrieved!',
    data: result,
  });
});

// SCRUM-67: Get bulk download package info
const getDownloadPackage = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.getDownloadPackage(caregiverUserId, agencyId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Download package retrieved!',
    data: result,
  });
});

// SCRUM-67: Request private document access
const requestPrivateAccess = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.requestPrivateAccess(agencyId as string, caregiverUserId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Private access requested!',
    data: result,
  });
});

// SCRUM-67: Grant or revoke private access (caregiver action)
const updatePrivateAccess = catchAsync(async (req: Request, res: Response) => {
  const { accessId } = req.params;
  const { action } = req.body; // 'grant' or 'revoke'
  const caregiverId = req.user?._id;

  const result = await DownloadService.updatePrivateAccess(accessId, caregiverId as string, action);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Private access ${action}ed successfully!`,
    data: result,
  });
});

// SCRUM-67: Get access requests for a caregiver
const getAccessRequests = catchAsync(async (req: Request, res: Response) => {
  const caregiverId = req.user?._id;

  const result = await DownloadService.getAccessRequests(caregiverId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Access requests retrieved!',
    data: result,
  });
});

// SCRUM-67: Get download audit log (admin)
const getDownloadAuditLog = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;

  const result = await DownloadService.getDownloadAuditLog(caregiverUserId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Download audit log retrieved!',
    data: result,
  });
});

export const DocumentController = {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
  reviewDocument,
  getCredentialStatus,
  removeCredential,
  downloadDocument,
  getDownloadPackage,
  requestPrivateAccess,
  updatePrivateAccess,
  getAccessRequests,
  getDownloadAuditLog,
};
