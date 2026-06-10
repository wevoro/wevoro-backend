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
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_status_1 = __importDefault(require("http-status"));
const globalErrorHandler_1 = __importDefault(require("./app/middlewares/globalErrorHandler"));
const routes_1 = __importDefault(require("./app/routes"));
const compression_1 = __importDefault(require("compression"));
const mongoose_1 = __importDefault(require("mongoose"));
const dns_1 = __importDefault(require("dns"));
// Use public DNS for SRV lookups on Vercel
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const app = (0, express_1.default)();
// Serverless MongoDB connection middleware — ensures DB is connected before handling requests
let isConnected = false;
app.use((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!isConnected && mongoose_1.default.connection.readyState !== 1) {
        try {
            const dbUrl = process.env.DATABASE_URL || '';
            yield mongoose_1.default.connect(dbUrl, {
                serverSelectionTimeoutMS: 8000,
                socketTimeoutMS: 10000,
            });
            isConnected = true;
            console.log('🛢  Database connected (serverless)');
        }
        catch (err) {
            console.error('⚠️  DB connection failed:', err);
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }
    }
    next();
}));
app.use((0, compression_1.default)());
app.use((0, cors_1.default)({
    origin: [
        'http://localhost:3000',
        'http://localhost:3003',
        'https://wevoro-frontend.vercel.app',
        'https://wevoro-frontend-riad009s-projects.vercel.app',
        process.env.FRONTEND_URL_PROD || '',
    ].filter(Boolean),
    credentials: true,
}));
app.use((0, cookie_parser_1.default)());
//parser
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: false }));
app.use(body_parser_1.default.urlencoded({ extended: false }));
app.use('/api/v1', routes_1.default);
//global error handler
app.use(globalErrorHandler_1.default);
app.get('/', (req, res) => {
    res.send('Welcome to Wevoro API');
});
app.use((req, res, next) => {
    res.status(http_status_1.default.NOT_FOUND).json({
        success: false,
        message: 'Not Found',
        errorMessages: [
            {
                method: req.method,
                path: req.originalUrl,
                message: 'API Not Found',
            },
        ],
    });
    next();
});
exports.default = app;
