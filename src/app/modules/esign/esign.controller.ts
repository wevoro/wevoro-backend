import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { Offer } from '../offer/offer.model';
import ApiError from '../../../errors/ApiError';
import * as EsignService from './esign.service';
import { EsignRole } from './esign.model';

/**
 * The JWT signed at login carries { email, role, _id, status, permissions } —
 * there is no `userId` claim, so reading req.user.userId silently yields
 * undefined and every scoped query comes back empty. `userId` is kept only as a
 * fallback for any token minted by an older code path.
 */
const currentUserId = (req: Request): string =>
  String((req.user as any)?._id || (req.user as any)?.userId);

/** SCRUM-117: the agency Documents page — both groups + counts. */
export const getLibrary = catchAsync(async (req: Request, res: Response) => {
  const result = await EsignService.getLibrary(currentUserId(req));
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

/** SCRUM-117: multi-file upload into one role group. */
export const addDocuments = catchAsync(async (req: Request, res: Response) => {
  const files = ((req.files as Express.Multer.File[]) || []) as any[];
  if (files.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'No files uploaded');
  const result = await EsignService.addDocuments(
    currentUserId(req),
    req.body.role as EsignRole,
    files
  );
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

export const pendingCopies = catchAsync(async (req: Request, res: Response) => {
  const result = await EsignService.pendingCopiesCount(currentUserId(req), req.params.id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

export const replaceDocument = catchAsync(async (req: Request, res: Response) => {
  const file = req.file as any;
  if (!file) throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  const result = await EsignService.replaceDocument(
    currentUserId(req),
    req.params.id,
    file
  );
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

export const removeDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await EsignService.removeDocument(currentUserId(req), req.params.id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

export const restoreDocument = catchAsync(async (req: Request, res: Response) => {
  const result = await EsignService.restoreDocument(currentUserId(req), req.params.id);
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

/** SCRUM-118: documents + packet for one offer, caregiver side. */
export const offerContext = catchAsync(async (req: Request, res: Response) => {
  const caregiverId = currentUserId(req);
  const offer = await Offer.findOne({ _id: req.params.offerId, pro: caregiverId }).select(
    'partner'
  );
  if (!offer) throw new ApiError(httpStatus.NOT_FOUND, 'Offer not found');
  const result = await EsignService.getOfferContext({
    offerId: String(offer._id),
    agencyId: String(offer.partner),
    caregiverId,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

/** SCRUM-118: Step 1 done — snapshot the packet (null when nothing to sign). */
export const startPacket = catchAsync(async (req: Request, res: Response) => {
  const caregiverId = currentUserId(req);
  const offer = await Offer.findOne({ _id: req.params.offerId, pro: caregiverId }).select(
    'partner'
  );
  if (!offer) throw new ApiError(httpStatus.NOT_FOUND, 'Offer not found');
  const result = await EsignService.startPacket({
    offerId: String(offer._id),
    agencyId: String(offer.partner),
    caregiverId,
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

/** SCRUM-118: sign one document; completes the packet on the last one. */
export const signItem = catchAsync(async (req: Request, res: Response) => {
  const result = await EsignService.signItem({
    packetId: req.params.packetId,
    itemId: req.params.itemId,
    caregiverId: currentUserId(req),
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
    userAgent: req.headers['user-agent'],
  });
  sendResponse(res, { statusCode: httpStatus.OK, success: true, data: result });
});

/**
 * SCRUM-118: reminder cron trigger. Same shape as the SCRUM-102 expiration
 * endpoint: Vercel Cron GETs it daily-or-hourly with Authorization: Bearer
 * CRON_SECRET; when the secret is unset (local dev) the check is skipped.
 */
export const runReminders = async (req: Request, res: Response): Promise<void> => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${secret}`) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
  }
  try {
    await EsignService.runSigningReminders();
    res.status(200).json({ success: true, message: 'Signing reminder scan completed' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
};
