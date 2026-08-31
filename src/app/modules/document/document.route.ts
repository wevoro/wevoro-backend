import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { DocumentController } from './document.controller';
import multer from 'multer';

const router = express.Router();
const storage = multer.diskStorage({});

const upload = multer({ storage });

// Upload a new document
router.post(
  '/upload',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  DocumentController.uploadDocument
);

// Get all documents for the authenticated user
router.get(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  DocumentController.getUserDocuments
);

// Delete a specific document
router.delete(
  '/:documentId',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  DocumentController.deleteDocument
);

// Admin: review (approve/reject) a document
router.patch(
  '/:documentId/review',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.reviewDocument
);

// Get credential status for a user.
// SECURITY (SCRUM-109): this was previously unauthenticated ("public for agency
// view"). It bypasses filterVisibleDocuments, so anyone who knew a userId could
// read that caregiver's TB test and GCHEXS metadata — the exact two credentials
// the SCRUM-99 tier gate is meant to protect. The frontend does not use this
// route (it reads the gated GET /document?userId=), so requiring auth here is
// safe. Do not remove the auth() call.
router.get(
  '/credentials/:userId',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN),
  DocumentController.getCredentialStatus
);

// Remove a credential (pro only)
router.delete(
  '/:documentId/remove-credential',
  auth(ENUM_USER_ROLE.PRO),
  DocumentController.removeCredential
);

// SCRUM-67: Download a single document (partner auth)
router.get(
  '/download/:documentId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.downloadDocument
);

// SCRUM-67: Get bulk download package (partner auth)
router.get(
  '/download-package/:caregiverUserId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.getDownloadPackage
);

// SCRUM-67: Request private document access (partner auth)
router.post(
  '/request-private-access/:caregiverUserId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.requestPrivateAccess
);

// SCRUM-67: Grant or revoke private access (pro auth)
router.patch(
  '/private-access/:accessId',
  auth(ENUM_USER_ROLE.PRO),
  DocumentController.updatePrivateAccess
);

// SCRUM-67: Get access requests for caregiver (pro auth)
router.get(
  '/access-requests',
  auth(ENUM_USER_ROLE.PRO),
  DocumentController.getAccessRequests
);

// SCRUM-67: Get download audit log (admin auth)
router.get(
  '/download-audit/:caregiverUserId',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.getDownloadAuditLog
);

export const DocumentRoutes = router;
