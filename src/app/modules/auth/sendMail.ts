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
 * RESEND_API_KEY is provisioned in Vercel (preview + production) on the client's
 * Resend account, so on the deployed backend email is sent via Resend.
 */
/**
 * SCRUM-118: attachments are needed to deliver the signed-document ZIP to the
 * agency. Resend takes base64 content directly; the Gmail SMTP fallback takes a
 * Buffer, so the caller passes a Buffer and each transport adapts it.
 */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  attachments?: MailAttachment[]
) {
  const resendKey = config.resend_api_key;

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
        body: JSON.stringify({
          from,
          to,
          subject,
          html,
          ...(attachments?.length
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content.toString('base64'),
                })),
              }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error('Error sending email (Resend):', res.status, body);
        // Surface the provider's own message. This used to throw a bare
        // "Failed to send email", which hid genuinely actionable errors such as
        // Resend's 403 "you can only send testing emails to your own address".
        let detail = body;
        try {
          detail = JSON.parse(body)?.message || body;
        } catch {
          /* keep raw body */
        }
        throw new Error(`Failed to send email (Resend ${res.status}): ${detail}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Error sending email (Resend):', error);
      throw new Error('Failed to send email');
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
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              contentType: a.contentType,
            })),
          }
        : {}),
      subject,
      html,
    });
    return result;
  } catch (error) {
    console.error('Error sending email (SMTP):', error);
    throw new Error('Failed to send email');
  }
}
