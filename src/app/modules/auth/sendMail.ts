import nodemailer from 'nodemailer';
import config from '../../../config';

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: config.email,
        pass: config.appPass,
      },
    });

    const result = await transporter.sendMail({
      from: config.email,
      to,
      subject,
      html, // html body
    });
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
}
