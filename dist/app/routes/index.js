"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_route_1 = require("../modules/auth/auth.route");
const feedback_route_1 = require("../modules/user/feedback.route");
const user_route_1 = require("../modules/user/user.route");
const document_route_1 = require("../modules/document/document.route");
const offer_route_1 = require("../modules/offer/offer.route");
const router = express_1.default.Router();
const moduleRoutes = [
    {
        path: '/user',
        route: user_route_1.UserRoutes,
    },
    {
        path: '/document',
        route: document_route_1.DocumentRoutes,
    },
    {
        path: '/offer',
        route: offer_route_1.OfferRoutes,
    },
    {
        path: '/auth',
        route: auth_route_1.AuthRoutes,
    },
    {
        path: '/feedback',
        route: feedback_route_1.FeedbackRoutes,
    },
];
moduleRoutes.forEach(route => router.use(route.path, route.route));
exports.default = router;
