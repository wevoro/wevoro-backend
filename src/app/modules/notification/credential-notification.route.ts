import express from 'express';
import { runExpirationCheck } from './credential-notification.controller';

const router = express.Router();

// SCRUM-102: Vercel Cron issues GET requests, so this is a GET. Pinged daily
// (see vercel.json "crons"). Protected by CRON_SECRET inside the controller.
router.get('/run-expiration-check', runExpirationCheck);

export const CredentialNotificationRoutes = router;
