"use strict";
/* eslint-disable no-console */
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
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = __importDefault(require("./app"));
const index_1 = __importDefault(require("./config/index"));
const credential_notification_service_1 = require("./app/modules/notification/credential-notification.service");
const user_service_1 = require("./app/modules/user/user.service");
process.on('uncaughtException', error => {
    console.error(error);
    process.exit(1);
});
let server;
// MongoDB connection options for stability
const mongoOptions = {
    serverSelectionTimeoutMS: 30000, // 30s to find a server
    socketTimeoutMS: 45000, // 45s socket timeout
    maxPoolSize: 10, // connection pool
    minPoolSize: 2, // keep minimum connections alive
    maxIdleTimeMS: 60000, // close idle connections after 60s
    heartbeatFrequencyMS: 10000, // check server health every 10s
    retryWrites: true,
    retryReads: true,
    bufferCommands: true, // buffer commands when disconnected
};
function connectWithRetry() {
    return __awaiter(this, arguments, void 0, function* (maxRetries = 5, delay = 5000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                yield mongoose_1.default.connect(index_1.default.database_url, mongoOptions);
                console.log(`🛢   Database is connected successfully`);
                return;
            }
            catch (err) {
                console.error(`⚠️  DB connection attempt ${attempt}/${maxRetries} failed:`, err.message);
                if (attempt < maxRetries) {
                    console.log(`   Retrying in ${delay / 1000}s...`);
                    yield new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        console.error('❌  All DB connection attempts failed. Server running without DB.');
    });
}
function bootstrap() {
    return __awaiter(this, void 0, void 0, function* () {
        // Start the server first so it's accessible even if DB is down
        server = app_1.default.listen(index_1.default.port, () => {
            console.log(`Application  listening on port ${index_1.default.port}`);
        });
        // MongoDB connection event handlers
        mongoose_1.default.connection.on('connected', () => {
            console.log('✅  MongoDB connected');
        });
        mongoose_1.default.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected — mongoose will auto-reconnect');
        });
        mongoose_1.default.connection.on('error', (err) => {
            console.error('❌  MongoDB connection error:', err.message);
        });
        // Connect with retry
        yield connectWithRetry();
        // SCRUM-65: Start credential expiration notification cron
        if (mongoose_1.default.connection.readyState === 1) {
            (0, credential_notification_service_1.startCredentialNotificationCron)();
            // Super Admin panel: guarantee the fixed super admin exists.
            yield user_service_1.UserService.ensureSuperAdmin();
        }
        process.on('unhandledRejection', error => {
            if (server) {
                server.close(() => {
                    console.error(error);
                    process.exit(1);
                });
            }
            else {
                process.exit(1);
            }
        });
    });
}
bootstrap();
