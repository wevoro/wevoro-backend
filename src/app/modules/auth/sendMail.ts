import nodemailer from 'nodemailer';
import config from '../../../config';

/**
 * Sends an email.
 *
 * SCRUM-99: on Vercel serverless, raw SMTP (Gmail:587) is unreliable and
 * frequently times out — which is why the OTP / login-code emails were failing
 * ("Failed to send email"). When RESEND_API_KEY is set we send over Resend's
 * HTTP API instead, which is serverless-friendly; otherwise we fall back to
 * Gmail SMTP for local development.
 *
 * RESEND_API_KEY is now provisioned in Vercel (preview + production), so on the
 * deployed backend email is sent via Resend.
 */
export async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = config.resend_api_key;
  // TEMP DIAGNOSTIC (SCRUM-99): surface what the runtime actually sees.
  const diag = `RK_env=${process.env.RESEND_API_KEY ? 'set(' + String(process.env.RESEND_API_KEY).length + ')' : 'MISSING'} cfg=${resendKey ? 'yes' : 'no'} from=${config.email_from || 'default'}`;

  // Preferred path: Resend HTTP API (works reliably on serverless).
  if (resendKey) {
    const from = config.email_from || 'WeVoro <onboarding@resend.dev>';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error('Error sending email (Resend):', res.status, body);
        throw new Error(`Failed to send email [${diag} Resend ${res.status} ${body.slice(0, 200)}]`);
      }
      return await res.json();
    } catch (error: any) {
      console.error('Error sending email (Resend):', error);
      throw new Error(`Failed to send email [${diag} Resend-exc ${error?.message || error}]`);
    }
  }

  // Fallback: Gmail SMTP (works locally; can be flaky on serverless).
  try {
    const port = config.email_port || 587;
    const transporter = nodemailer.createTransport({
      host: config.email_host || 'smtp.gmail.com',
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: {
        user: config.email,
        pass: config.appPass,
      },
    });

    const result = await transporter.sendMail({
      from: config.email,
      to,
      subject,
      html,
    });
    return result;
  } catch (error: any) {
    console.error('Error sending email (SMTP):', error);
    throw new Error(`Failed to send email [${diag} SMTP ${error?.message || error}]`);
  }
}
