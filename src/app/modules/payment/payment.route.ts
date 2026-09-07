import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import * as PaymentController from './payment.controller';

const router = express.Router();

// --- SCRUM-115 ---
// NOTE: the webhook is NOT mounted here. It needs the raw request body for
// signature verification, and this router sits behind the global
// express.json() in app.ts. It is mounted directly in app.ts, above that
// parser, at /api/v1/payment/webhook.

router.get(
  '/packet/:caregiverId',
  auth(ENUM_USER_ROLE.PARTNER),
  PaymentController.packetStatus
);

router.post(
  '/checkout/:caregiverId',
  auth(ENUM_USER_ROLE.PARTNER),
  PaymentController.checkout
);

router.get('/my-transactions', auth(ENUM_USER_ROLE.PARTNER), PaymentController.myTransactions);

// QA only. The service refuses this outright once Stripe is configured.
router.post(
  '/simulate/:transactionId',
  auth(ENUM_USER_ROLE.PARTNER),
  PaymentController.simulate
);

export const PaymentRoutes = router;
