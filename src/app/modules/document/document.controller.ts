import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { DocumentService } from './document.service';

const uploadDocument = catchAsync(async (req: Request, res: Response) => {
  const file = req.file;
  const userId = req.user?._id;
  const { category, documentType, title, isProtected, consent, documentId } =
    req.body;

  const result = await DocumentService.uploadDocument(
    file,
    {
      category,
      documentType,
      title,
      isProtected: isProtected === 'true' || isProtected === true,
      consent: consent === 'true' || consent === true,
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
  const userId = req.user?._id;

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

export const DocumentController = {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
};
