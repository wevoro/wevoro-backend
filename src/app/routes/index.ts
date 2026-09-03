import express from 'express';
import { AuthRoutes } from '../modules/auth/auth.route';

import { FeedbackRoutes } from '../modules/user/feedback.route';
import { UserRoutes } from '../modules/user/user.route';
import { DocumentRoutes } from '../modules/document/document.route';
import { OfferRoutes } from '../modules/offer/offer.route';
import { PartnerVerificationRoutes } from '../modules/partner-verification/partner-verification.route';
import { ShiftRoutes } from '../modules/shift/shift.route';
import { CredentialingRoutes } from '../modules/credentialing/credentialing.route';
import { CredentialNotificationRoutes } from '../modules/notification/credential-notification.route';
import { EsignRoutes } from '../modules/esign/esign.route';

const router = express.Router();

const moduleRoutes = [
  {
    path: '/user',
    route: UserRoutes,
  },
  {
    path: '/document',
    route: DocumentRoutes,
  },
  {
    path: '/offer',
    route: OfferRoutes,
  },
  {
    path: '/partner-verification',
    route: PartnerVerificationRoutes,
  },
  {
    path: '/auth',
    route: AuthRoutes,
  },
  {
    path: '/feedback',
    route: FeedbackRoutes,
  },
  {
    path: '/shift',
    route: ShiftRoutes,
  },
  {
    path: '/credentialing',
    route: CredentialingRoutes,
  },
  {
    path: '/notification',
    route: CredentialNotificationRoutes,
  },
  {
    // SCRUM-117/118: e-signature (agency library + caregiver signing)
    path: '/esign',
    route: EsignRoutes,
  },
];

moduleRoutes.forEach(route => router.use(route.path, route.route));
export default router;
