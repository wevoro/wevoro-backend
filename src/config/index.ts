/* eslint-disable no-undef */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  bycrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt: {
    secret: process.env.JWT_SECRET,
    refresh_secret: process.env.JWT_REFRESH_SECRET,
    expires_in: process.env.JWT_EXPIRES_IN,
    refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
  },
  resetlink: process.env.RESET_PASS_UI_LINK,
  // Gmail SMTP. Accepts common env var names so existing setups work.
  // NOTE: Gmail needs an APP PASSWORD (16 chars, 2FA required), not the normal
  // account password.
  email: process.env.EMAIL || process.env.EMAIL_USER,
  appPass:
    process.env.APP_PASS ||
    process.env.EMAIL_PASS ||
    process.env.EMAIL_APP_PASSWORD,
  email_host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  email_port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
  // SCRUM-99: transactional email over HTTP (Resend). Raw SMTP is unreliable on
  // Vercel serverless — set RESEND_API_KEY to route mail through Resend's HTTP
  // API instead. EMAIL_FROM is the verified sender (falls back to Resend's shared
  // onboarding sender for quick testing).
  resend_api_key: process.env.RESEND_API_KEY,
  email_from: process.env.EMAIL_FROM,
  default_admin_pass: process.env.DEFAULT_ADMIN_PASS,
  // Super Admin panel. Optional boot-seeded super admin (only when BOTH env vars
  // are set — no hardcoded default account), and the shared secret that gates the
  // self-serve super-admin setup link (/super-setup).
  super_admin: {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
    setup_key: process.env.SUPER_ADMIN_SETUP_KEY || 'wevoro-super-2026',
  },

  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  bunny: {
    storage_zone: process.env.BUNNY_STORAGE_ZONE,
    api_key: process.env.BUNNY_API_KEY,
    cdn_url: process.env.BUNNY_CDN_URL,
  },
  frontend_url: {
    local: process.env.FRONTEND_URL_LOCAL,
    prod: process.env.FRONTEND_URL_PROD,
  },
  // SCRUM-108: public base URL used by credential alert emails for the CTA
  // link and image assets. Kept separate from frontend_url, whose value is a
  // leftover pointing at a different product.
  app_public_url: process.env.APP_PUBLIC_URL,
  openai_api_key: process.env.OPENAI_API_KEY,
  // SCRUM-87/88: platform-wide credentialing-only beta flag. Defaults ON unless
  // explicitly set to 'false', so the beta stays safe if the env var is missing.
  credentialing_mode: process.env.CREDENTIALING_MODE !== 'false',
};
