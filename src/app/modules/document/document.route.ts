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

// Admin: AI reads the credential and pre-fills the confirmation form.
router.post(
  '/:documentId/ai-extract',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.aiExtractCredential
);

// Admin: how much of the review the AI is allowed to do. Declared before any
// '/:param' route so "ai-settings" is never read as a document id.
router.get(
  '/ai-settings',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.getCredentialAiSettings
);
router.patch(
  '/ai-settings',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.updateCredentialAiSettings
);

// Admin "Run AI check": read and decide every credential of one caregiver.
router.post(
  '/ai-review/user/:userId',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.aiReviewUser
);

// SCRUM-130: viewing a credential is free. Streams the file inline through the
// server so the agency never receives the unsigned CDN url that the paid
// download sells. Declared before any '/:param' GET so it cannot be shadowed.
router.get(
  '/view/:documentId',
  auth(
    ENUM_USER_ROLE.PARTNER,
    ENUM_USER_ROLE.PRO,
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.SUPER_ADMIN
  ),
  DocumentController.viewDocument
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

// SCRUM-67 Scenario 2: the package as one zip. The per-file loop it replaces
// only ever delivered the first document.
router.get(
  '/download-package-zip/:caregiverUserId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.getDownloadPackageZip
);

// SCRUM-119 (A10): one signed document from a paid packet.
router.get(
  '/download-signed/:caregiverUserId/:itemId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.downloadSignedDocument
);

// SCRUM-119: locked/unlocked file list for the documents modal. Free to view —
// urls are withheld until the packet is paid for.
router.get(
  '/packet-manifest/:caregiverUserId',
  auth(ENUM_USER_ROLE.PARTNER),
  DocumentController.getPacketManifest
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
