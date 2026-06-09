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
/* eslint-disable no-console */
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const app_1 = __importDefault(require("./app"));
const index_1 = __importDefault(require("./config/index"));
// Use public DNS servers for SRV lookups (works around ISP DNS refusing SRV queries)
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const credential_notification_service_1 = require("./app/modules/notification/credential-notification.service");
process.on('uncaughtException', error => {
    console.error(error);
    process.exit(1);
});
let server;
function bootstrap() {
    return __awaiter(this, void 0, void 0, function* () {
        // Start the server first so it's accessible even if DB is down
        server = app_1.default.listen(index_1.default.port, () => {
            console.log(`Application  listening on port ${index_1.default.port}`);
        });
        try {
            yield mongoose_1.default.connect(index_1.default.database_url);
            console.log(`🛢   Database is connected successfully`);
            // SCRUM-65: Start credential expiration notification cron
            (0, credential_notification_service_1.startCredentialNotificationCron)();
        }
        catch (err) {
            console.error('⚠️  Failed to connect to database (server still running):', err);
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
// process.on('SIGTERM', () => {
//   logger.info('SIGTERM is received');
//   if (server) {
//     server.close();
//   }
// });
