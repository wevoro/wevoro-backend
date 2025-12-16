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
  email: process.env.EMAIL,
  appPass: process.env.APP_PASS,
  default_admin_pass: process.env.DEFAULT_ADMIN_PASS,

  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  frontend_url: {
    local: process.env.FRONTEND_URL_LOCAL,
    prod: process.env.FRONTEND_URL_PROD,
  },
  openai_api_key: process.env.OPENAI_API_KEY,
};
