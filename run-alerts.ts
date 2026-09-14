/**
 * SCRUM-108 manual trigger — runs the credential expiry scan immediately
 * instead of waiting for the daily cron. Fires the in-app notification AND the
 * email for each alert.
 *
 *   bun run-alerts.ts
 *
 * Email sends via Resend from the domain-verified WeVoro sender
 * (EMAIL_FROM=WeVoro <noreply@wevoro.com>), the same path production uses.
 */
import mongoose from 'mongoose';
import config from './src/config';
import { evaluateCredentialExpirations } from './src/app/modules/notification/credential-notification.service';

(async () => {
  await mongoose.connect(config.database_url as string);
  await evaluateCredentialExpirations();
  await mongoose.disconnect();
  console.log('done — check your inbox');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
