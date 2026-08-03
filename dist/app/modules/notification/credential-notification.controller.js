"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExpirationCheck = void 0;
const credential_notification_service_1 = require("./credential-notification.service");
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
const runExpirationCheck = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${secret}`) {
            res.status(401).json({ success: false, message: 'Unauthorized' });
            return;
        }
    }
    try {
        yield (0, credential_notification_service_1.evaluateCredentialExpirations)();
        res.status(200).json({
            success: true,
            message: 'Credential expiration check completed',
        });
    }
    catch (err) {
        res
            .status(500)
            .json({ success: false, message: err.message });
    }
});
exports.runExpirationCheck = runExpirationCheck;
