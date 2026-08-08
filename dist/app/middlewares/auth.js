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
exports.requirePermission = exports.optionalAuth = void 0;
const http_status_1 = __importDefault(require("http-status"));
const config_1 = __importDefault(require("../../config"));
const user_1 = require("../../enums/user");
const ApiError_1 = __importDefault(require("../../errors/ApiError"));
const jwtHelpers_1 = require("../../helpers/jwtHelpers");
const auth = (...requiredRoles) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        //get authorization token
        const token = req.headers.authorization;
        // req.cookies.refreshToken ||
        // req.cookies.accessToken;
        // console.log({ token });
        if (!token) {
            throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'You are not authorized');
        }
        // verify token
        let verifiedUser = null;
        verifiedUser = jwtHelpers_1.jwtHelpers.verifyToken(token, config_1.default.jwt.secret);
        req.user = verifiedUser; // role  , userid
        // console.log({ verifiedUser });
        // Super Admin is implicitly privileged everywhere — so existing
        // auth(ADMIN) routes admit a super_admin without listing the role.
        if (verifiedUser.role === user_1.ENUM_USER_ROLE.SUPER_ADMIN) {
            return next();
        }
        // role diye guard korar jnno
        if (requiredRoles.length && !requiredRoles.includes(verifiedUser.role)) {
            throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Forbidden');
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
/**
 * SCRUM-99: optional auth. Populates req.user when a valid token is present but
 * never rejects when it is absent/invalid — used on endpoints that are public but
 * whose RESPONSE must be tailored to the requester (e.g. gating a caregiver's
 * sensitive GCHEXS on the otherwise-public profile view).
 */
const optionalAuth = () => (req, _res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const token = req.headers.authorization;
        if (token) {
            req.user = jwtHelpers_1.jwtHelpers.verifyToken(token, config_1.default.jwt.secret);
        }
    }
    catch (_a) {
        // invalid token => treat as anonymous, do not block the request
    }
    next();
});
exports.optionalAuth = optionalAuth;
/**
 * Granular permission guard. Run AFTER `auth(...)` (which sets req.user).
 * Allows the request when:
 *  - the user is a super_admin (implicit all-access), OR
 *  - the user is an admin with an empty/missing `permissions` array
 *    (legacy full admin — backward compatible), OR
 *  - every required permission key is present in req.user.permissions.
 */
const requirePermission = (...requiredPermissions) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user) {
            throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'You are not authorized');
        }
        if (user.role === user_1.ENUM_USER_ROLE.SUPER_ADMIN) {
            return next();
        }
        const perms = Array.isArray(user.permissions)
            ? user.permissions
            : [];
        // Legacy admins (no permissions set) keep full access.
        const isLegacyFullAdmin = user.role === user_1.ENUM_USER_ROLE.ADMIN && perms.length === 0;
        const hasAll = requiredPermissions.every((p) => perms.includes(p));
        if (isLegacyFullAdmin || hasAll) {
            return next();
        }
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'You do not have permission to perform this action');
    }
    catch (error) {
        next(error);
    }
});
exports.requirePermission = requirePermission;
exports.default = auth;
