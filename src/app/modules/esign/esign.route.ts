import express from 'express';
import multer from 'multer';
import auth from '../../middlewares/auth';
import { ENUM_USER_ROLE } from '../../../enums/user';
import * as EsignController from './esign.controller';

const router = express.Router();
const upload = multer({ storage: multer.diskStorage({}) });

// --- SCRUM-117: agency signing library ---
router.get('/documents', auth(ENUM_USER_ROLE.PARTNER), EsignController.getLibrary);
router.post(
  '/documents',
  auth(ENUM_USER_ROLE.PARTNER),
  upload.array('files', 10),
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
