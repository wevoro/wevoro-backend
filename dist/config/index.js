"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-undef */
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env') });
exports.default = {
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
    bunny: {
        storage_zone: process.env.BUNNY_STORAGE_ZONE,
        api_key: process.env.BUNNY_API_KEY,
        cdn_url: process.env.BUNNY_CDN_URL,
    },
    frontend_url: {
        local: process.env.FRONTEND_URL_LOCAL,
        prod: process.env.FRONTEND_URL_PROD,
    },
    openai_api_key: process.env.OPENAI_API_KEY,
};
