import multer from 'multer';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import express from 'express';
import { OfferController } from './offer.controller';
const router = express.Router();
const storage = multer.diskStorage({});

const upload = multer({ storage });
router.post(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  OfferController.createOrUpdateOffer
);
router.post(
  '/upload/:id',
  auth(ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  upload.array(`documents`),
  OfferController.uploadOfferDocuments
);
router.get(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  OfferController.getOffers
);
router.delete(
  '/:id',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  OfferController.deleteOffer
);
router.patch(
  '/update/:id',
  auth(ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  OfferController.updateOffer
);

router.patch(
  '/notes/:id',
  auth(ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  OfferController.updateOfferNotes
);

router.patch(
  '/document-status',
  auth(ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  OfferController.updateDocumentStatus
);

// Pro responds to offer - unified endpoint for file uploads + status updates
router.post(
  '/pro-respond/:id',
  auth(ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  upload.array('documents'),
  OfferController.proRespondToOffer
);

export const OfferRoutes = router;
