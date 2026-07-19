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
exports.User = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const bcrypt_1 = __importDefault(require("bcrypt"));
const mongoose_1 = require("mongoose");
const config_1 = __importDefault(require("../../../config"));
const UserSchema = new mongoose_1.Schema({
    role: {
        type: String,
        enum: ['pro', 'partner', 'admin', 'super_admin'],
        required: true,
    },
    // Super Admin panel: granular per-admin permission keys. Empty/missing on an
    // existing admin => full legacy access (see user.constant.ts).
    permissions: {
        type: [String],
        default: [],
    },
    // Super Admin panel: the role this account had before being promoted to
    // admin, so "remove admin access" restores it (caregiver vs agency).
    previousRole: {
        type: String,
    },
    password: {
        type: String,
        required: function () {
            return !this.isGoogleUser;
        },
        select: 0,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    coverImage: {
        type: String,
        required: false,
    },
    status: {
        type: String,
        enum: ['approved', 'pending', 'rejected', 'blocked', 'in-review'],
        default: 'pending',
    },
    /**
     * The status the user held immediately before being blocked, so unblocking
     * can put them back exactly where they were. Without it, unblocking would
     * have to guess — either wrongly promoting someone who was never verified,
     * or demoting a verified caregiver back to pending review.
     */
    previousStatus: {
        type: String,
        enum: ['approved', 'pending', 'rejected', 'in-review'],
    },
    isGoogleUser: {
        type: Boolean,
        default: false,
    },
    otp: {
        type: String,
        required: false,
    },
    otpExpiry: {
        type: Date,
        required: false,
    },
    canResetPassword: {
        type: Boolean,
        default: false,
    },
    lastLoginAt: {
        type: Date,
        default: null,
    },
    backgroundCheckStatus: {
        type: String,
        enum: ['verified', 'failed', 'not_verified'],
        default: 'not_verified',
    },
    shareId: {
        type: String,
        unique: true,
        sparse: true,
    },
    sourceCaregiverId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});
UserSchema.statics.isUserExist = function (email) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({ email, isGoogleUser: false }, { email: 1, password: 1, role: 1, _id: 1, status: 1, permissions: 1 });
    });
};
UserSchema.statics.isGoogleUser = function (email) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield exports.User.findOne({ email, isGoogleUser: true }, { email: 1, role: 1, _id: 1, status: 1 });
    });
};
UserSchema.statics.isPasswordMatched = function (givenPassword, savedPassword) {
    return __awaiter(this, void 0, void 0, function* () {
        if (savedPassword && givenPassword) {
            return yield bcrypt_1.default.compare(givenPassword, savedPassword);
        }
        return false;
    });
};
// User.create() / user.save()
UserSchema.pre('save', function (next) {
    return __awaiter(this, void 0, void 0, function* () {
        // hashing user password
        const user = this;
        if (user.password) {
            user.password = yield bcrypt_1.default.hash(user.password, Number(config_1.default.bycrypt_salt_rounds));
        }
        next();
    });
});
exports.User = (0, mongoose_1.model)('User', UserSchema);
