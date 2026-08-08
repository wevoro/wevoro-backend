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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = __importDefault(require("../../../config"));
/**
 * Sends an email.
 *
 * SCRUM-99: on Vercel serverless, raw SMTP (Gmail:587) is unreliable and
 * frequently times out — which is why the OTP / login-code emails were failing
 * ("Failed to send email"). When RESEND_API_KEY is set we send over Resend's
 * HTTP API instead, which is serverless-friendly; otherwise we fall back to
 * Gmail SMTP for local development.
 */
function sendEmail(to, subject, html) {
    return __awaiter(this, void 0, void 0, function* () {
        const resendKey = config_1.default.resend_api_key;
        // Preferred path: Resend HTTP API (works reliably on serverless).
        if (resendKey) {
            const from = config_1.default.email_from || 'WeVoro <onboarding@resend.dev>';
            try {
                const res = yield fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${resendKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ from, to, subject, html }),
                });
                if (!res.ok) {
                    const body = yield res.text();
                    console.error('Error sending email (Resend):', res.status, body);
                    throw new Error('Failed to send email');
                }
                return yield res.json();
            }
            catch (error) {
                console.error('Error sending email (Resend):', error);
                throw new Error('Failed to send email');
            }
        }
        // Fallback: Gmail SMTP (works locally; can be flaky on serverless).
        try {
            const port = config_1.default.email_port || 587;
            const transporter = nodemailer_1.default.createTransport({
                host: config_1.default.email_host || 'smtp.gmail.com',
                port,
                secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
                auth: {
                    user: config_1.default.email,
                    pass: config_1.default.appPass,
                },
            });
            const result = yield transporter.sendMail({
                from: config_1.default.email,
                to,
                subject,
                html,
            });
            return result;
        }
        catch (error) {
            console.error('Error sending email (SMTP):', error);
            throw new Error('Failed to send email');
        }
    });
}
