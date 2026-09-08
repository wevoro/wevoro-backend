import { Request, Response } from 'express';
import { evaluateCredentialExpirations } from './credential-notification.service';

/**
 * SCRUM-102: HTTP trigger for the daily credential-expiration scan.
 *
 * Why this exists: the backend runs on Vercel serverless (@vercel/node), where
 * the process is frozen/reclaimed between requests. The in-process setInterval
 * in startCredentialNotificationCron() therefore never reaches its 24h tick in
 * production, so the yellow/red/expired notifications effectively never fired.
 * A Vercel Cron (see vercel.json "crons") pings this endpoint once a day, which
 * runs the scan on a live request thread — the reliable driver on serverless.
 *
 * Auth: when CRON_SECRET is set in the environment, Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` on its cron requests. We require that
 * header to match so the endpoint can't be triggered by anyone. If CRON_SECRET
 * is unset (e.g. local dev), the check is skipped.
 */
export const runExpirationCheck = async (
  req: Request,
  res: Response
): Promise<void> => {
  // Fail CLOSED. This used to skip the check whenever CRON_SECRET was unset,
  // which meant one missing env var silently turned a mail-sending scan into a
  // public endpoint anyone could trigger in a loop. Only local dev may run it
  // unauthenticated.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      res
        .status(503)
        .json({ success: false, message: 'Cron is not configured' });
      return;
    }
  } else {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
  }

  try {
    await evaluateCredentialExpirations();
    res.status(200).json({
      success: true,
      message: 'Credential expiration check completed',
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: (err as Error).message });
  }
};
