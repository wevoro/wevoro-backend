import express, { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import multer from 'multer';
import auth from '../../middlewares/auth';
import ApiError from '../../../errors/ApiError';
import { ENUM_USER_ROLE } from '../../../enums/user';
import * as EsignController from './esign.controller';

const router = express.Router();
const upload = multer({ storage: multer.diskStorage({}) });

/**
 * SCRUM-204: say what is actually wrong when too many files arrive at once.
 *
 * `upload.array('files', 10)` makes multer abort on the ELEVENTH part with
 * LIMIT_UNEXPECTED_FILE, which reached the agency as a 500 "Unexpected field" —
 * a message about nothing they did, on a screen that was only trying to say
 * "that is more than ten". Worse, it fires before addDocuments runs, so the
 * service's own, friendly cap message could never be the one shown.
 *
 * The cap is now owned in one place: multer takes the batch (with a generous
 * hard stop so a runaway request is still refused), and addDocuments decides,
 * counting what the agency already has. Anything multer does refuse is turned
 * into a plain 400.
 */
const uploadDocuments = (req: Request, res: Response, next: NextFunction): void => {
  upload.array('files', 50)(req, res, (err: any) => {
    if (!err) return next();
    const tooMany =
      err?.code === 'LIMIT_UNEXPECTED_FILE' || err?.code === 'LIMIT_FILE_COUNT';
    next(
      new ApiError(
        httpStatus.BAD_REQUEST,
        tooMany
          ? 'That is more documents than one upload can carry. Send them in smaller batches.'
          : 'That upload could not be read. Please try again.'
      )
    );
  });
};

// --- SCRUM-117: agency signing library ---
router.get('/documents', auth(ENUM_USER_ROLE.PARTNER), EsignController.getLibrary);
router.post(
  '/documents',
  auth(ENUM_USER_ROLE.PARTNER),
  uploadDocuments,
  EsignController.addDocuments
);
router.get(
  '/documents/:id/pending-copies',
  auth(ENUM_USER_ROLE.PARTNER),
  EsignController.pendingCopies
);
router.patch(
  '/documents/:id/replace',
  auth(ENUM_USER_ROLE.PARTNER),
  upload.single('file'),
  EsignController.replaceDocument
);
router.delete('/documents/:id', auth(ENUM_USER_ROLE.PARTNER), EsignController.removeDocument);
router.patch(
  '/documents/:id/restore',
  auth(ENUM_USER_ROLE.PARTNER),
  EsignController.restoreDocument
);

// --- admin oversight of an agency's signing activity (read-only) ---
router.get(
  '/admin/agency/:agencyId',
  auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN),
  EsignController.adminAgencyOverview
);

// --- SCRUM-118: caregiver signing flow ---
router.get('/my-packets', auth(ENUM_USER_ROLE.PRO), EsignController.myPackets);
router.get('/offer/:offerId', auth(ENUM_USER_ROLE.PRO), EsignController.offerContext);
router.post('/offer/:offerId/start', auth(ENUM_USER_ROLE.PRO), EsignController.startPacket);
router.post(
  '/packet/:packetId/sign/:itemId',
  auth(ENUM_USER_ROLE.PRO),
  EsignController.signItem
);

// --- reminder cron (Vercel Cron GET; CRON_SECRET-protected in the controller) ---
router.get('/run-signing-reminders', EsignController.runReminders);

export const EsignRoutes = router;
