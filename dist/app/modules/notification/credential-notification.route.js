"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialNotificationRoutes = void 0;
const express_1 = __importDefault(require("express"));
const credential_notification_controller_1 = require("./credential-notification.controller");
const router = express_1.default.Router();
// SCRUM-102: Vercel Cron issues GET requests, so this is a GET. Pinged daily
// (see vercel.json "crons"). Protected by CRON_SECRET inside the controller.
router.get('/run-expiration-check', credential_notification_controller_1.runExpirationCheck);
exports.CredentialNotificationRoutes = router;
