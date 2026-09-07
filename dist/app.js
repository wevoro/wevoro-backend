"use strict";
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
const app = (0, express_1.default)();
app.use((0, compression_1.default)());
app.use((0, cors_1.default)());
app.use((0, cors_1.default)());
app.use((0, cookie_parser_1.default)());
// SCRUM-115: the Stripe webhook must be mounted BEFORE the JSON parser below.
// Signature verification hashes the exact bytes Stripe sent, and once
// express.json() has parsed and discarded the raw body there is nothing left to
// verify against. This is scoped to the single webhook path, so every other
// route still gets the parsed body it expects.
app.post('/api/v1/payment/webhook', express_1.default.raw({ type: 'application/json' }), (req, res) => {
    // Imported lazily so this file does not pull the Stripe SDK into every
    // route's cold start.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { webhook } = require('./app/modules/payment/payment.controller');
    return webhook(req, res);
});
//parser
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: false }));
app.use(body_parser_1.default.urlencoded({ extended: false }));
app.use('/api/v1', routes_1.default);
//global error handler
app.use(globalErrorHandler_1.default);
app.get('/', (req, res) => {
    res.send('Welcome to Wevoro API v3');
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
