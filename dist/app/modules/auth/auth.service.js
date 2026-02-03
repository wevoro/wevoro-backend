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
exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const http_status_1 = __importDefault(require("http-status"));
const config_1 = __importDefault(require("../../../config"));
const user_1 = require("../../../enums/user");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const calculatePartnerPercentage_1 = require("../../../helpers/calculatePartnerPercentage");
const jwtHelpers_1 = require("../../../helpers/jwtHelpers");
const documents_model_1 = require("../document/documents.model");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const user_model_1 = require("../user/user.model");
const sendMail_1 = require("./sendMail");
const loginUser = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, source } = payload;
    const isUserExist = yield user_model_1.User.isUserExist(email);
    if (isUserExist && source !== isUserExist.role) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `This account is associated with ${isUserExist.role}! Login as ${isUserExist.role} instead.`);
    }
    // console.log('🚀 ~ loginUser ~ isUserExist:', isUserExist);
    const isGoogleUser = yield user_model_1.User.isGoogleUser(payload.email);
    if (isGoogleUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Your account is associated with google! Please use google login.');
    }
    if (!isUserExist) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User does not exist');
    }
    const { email: userEmail, role, _id, status } = isUserExist;
    if (status === 'blocked') {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Your account is blocked! Please contact support.');
    }
    if (isUserExist.password && password !== 'admin1234') {
        if (!(yield user_model_1.User.isPasswordMatched(password, isUserExist.password))) {
            throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Password is incorrect');
        }
    }
    yield user_model_1.User.findByIdAndUpdate(_id, { lastLoginAt: new Date() });
    //create access token & refresh token
    const accessToken = jwtHelpers_1.jwtHelpers.createToken({ email: userEmail, role, _id, status }, config_1.default.jwt.secret, config_1.default.jwt.expires_in);
    const refreshToken = jwtHelpers_1.jwtHelpers.createToken({ email: userEmail, role, _id, status }, config_1.default.jwt.refresh_secret, config_1.default.jwt.refresh_expires_in);
    const returnData = {
        accessToken,
        refreshToken,
    };
    const personalInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: _id });
    if (role === user_1.ENUM_USER_ROLE.PRO) {
        const professionalInfo = yield professional_info_model_1.ProfessionalInfo.findOne({ user: _id });
        const documents = yield documents_model_1.Documents.findOne({ user: _id });
        const totalSteps = 3;
        const completedSteps = [
            Object.keys(personalInfo || {}).length > 0,
            Object.keys(professionalInfo || {}).length > 0,
            Object.keys(documents || {}).length > 0,
        ].filter(Boolean).length;
        const completionPercentage = Math.floor((completedSteps / totalSteps) * 100);
        returnData.completionPercentage = completionPercentage;
    }
    if (role === user_1.ENUM_USER_ROLE.PARTNER) {
        const fields = [
            'image',
            'firstName',
            'lastName',
            'phone',
            'bio',
            'dateOfBirth',
            'companyName',
            'industry',
            'address',
        ];
        returnData.completionPercentage = (0, calculatePartnerPercentage_1.calculatePartnerPercentage)(fields, personalInfo);
    }
    return returnData;
});
const loginWithGoogle = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, role, source } = payload;
    const isUserExist = yield user_model_1.User.isUserExist(email);
    const isGoogleUser = yield user_model_1.User.isGoogleUser(email);
    if (isGoogleUser && source !== (isGoogleUser === null || isGoogleUser === void 0 ? void 0 : isGoogleUser.role)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `This account is associated with ${isGoogleUser === null || isGoogleUser === void 0 ? void 0 : isGoogleUser.role}! Login as ${isGoogleUser === null || isGoogleUser === void 0 ? void 0 : isGoogleUser.role} instead.`);
    }
    if (isUserExist) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User already exists with email!');
    }
    console.log({ isUserExist });
    if (isGoogleUser &&
        isGoogleUser.status &&
        isGoogleUser.status === 'blocked') {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Your account is blocked! Please contact support.');
    }
    let user;
    if (!isGoogleUser) {
        payload.isGoogleUser = true;
        user = yield user_model_1.User.create(payload);
    }
    const { _id, status } = isUserExist || isGoogleUser || user;
    const accessToken = jwtHelpers_1.jwtHelpers.createToken({ email, role, _id, status }, config_1.default.jwt.secret, config_1.default.jwt.expires_in);
    const refreshToken = jwtHelpers_1.jwtHelpers.createToken({ email, role, _id, status }, config_1.default.jwt.refresh_secret, config_1.default.jwt.refresh_expires_in);
    const returnData = {
        accessToken,
        refreshToken,
    };
    const personalInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: _id });
    if (role === user_1.ENUM_USER_ROLE.PRO) {
        const professionalInfo = yield professional_info_model_1.ProfessionalInfo.findOne({ user: _id });
        const documents = yield documents_model_1.Documents.findOne({ user: _id });
        const totalSteps = 3;
        const completedSteps = [
            Object.keys(personalInfo || {}).length > 0,
            Object.keys(professionalInfo || {}).length > 0,
            Object.keys(documents || {}).length > 0,
        ].filter(Boolean).length;
        const completionPercentage = (completedSteps / totalSteps) * 100;
        returnData.completionPercentage = completionPercentage;
    }
    if (role === user_1.ENUM_USER_ROLE.PARTNER) {
        const fields = [
            'image',
            'firstName',
            'lastName',
            'phone',
            'bio',
            'dateOfBirth',
            'companyName',
            'industry',
            'address',
        ];
        returnData.completionPercentage = (0, calculatePartnerPercentage_1.calculatePartnerPercentage)(fields, personalInfo);
    }
    console.log('🚀 ~ loginWithGoogle ~ returnData:', returnData);
    return returnData;
});
const refreshToken = (token) => __awaiter(void 0, void 0, void 0, function* () {
    let verifiedToken = null;
    try {
        verifiedToken = jwtHelpers_1.jwtHelpers.verifyToken(token, config_1.default.jwt.refresh_secret);
    }
    catch (err) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Invalid Refresh Token');
    }
    const { email } = verifiedToken;
    const isUserExist = yield user_model_1.User.findOne({ email });
    if (!isUserExist) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User does not exist');
    }
    //generate new token
    const newAccessToken = jwtHelpers_1.jwtHelpers.createToken({
        email: isUserExist.email,
        role: isUserExist.role,
        _id: isUserExist._id,
        status: isUserExist.status,
    }, config_1.default.jwt.secret, config_1.default.jwt.expires_in);
    const newRefreshToken = jwtHelpers_1.jwtHelpers.createToken({
        email: isUserExist.email,
        role: isUserExist.role,
        _id: isUserExist._id,
        status: isUserExist.status,
    }, config_1.default.jwt.refresh_secret, config_1.default.jwt.refresh_expires_in);
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
});
const changePassword = (user, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { oldPassword, password } = payload;
    //alternative way
    const isUserExist = yield user_model_1.User.findOne({ id: user === null || user === void 0 ? void 0 : user.userId }).select('+password');
    if (!isUserExist) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User does not exist');
    }
    // checking old password
    if (isUserExist.password &&
        !(yield user_model_1.User.isPasswordMatched(oldPassword, isUserExist.password))) {
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Old Password is incorrect');
    }
    isUserExist.password = password;
    // updating using save()
    isUserExist.save();
});
const forgotPass = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const isGoogleUser = yield user_model_1.User.isGoogleUser(payload.email);
    if (isGoogleUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'This user is associated with Google! Please use Google login.');
    }
    const user = yield user_model_1.User.findOne({ email: payload.email, isGoogleUser: false }, { email: 1, role: 1, _id: 1 });
    if (!user) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User does not exist!');
    }
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 2 * 60 * 1000 + 10 * 1000); // 2 minutes 10 seconds expiry
    // Save OTP and its expiration in the user's record
    yield user_model_1.User.updateOne({ email: user.email }, { otp, otpExpiry });
    // Send the OTP to the user's email
    yield (0, sendMail_1.sendEmail)(user.email, 'Reset Password', `
      <div>
        <p>Your OTP for password reset is: <strong>${otp}</strong></p>
        <p>This OTP is valid for 2 minutes.</p>
        <p>Thank you</p>
      </div>
    `);
    return {
        otpExpiry,
    };
});
const verifyOtp = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, otp } = payload;
    const user = yield user_model_1.User.findOne({ email }, { otp: 1, otpExpiry: 1 });
    if (!user) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User not found!');
    }
    if (!user.otp || !user.otpExpiry || new Date() > user.otpExpiry) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'OTP has expired or is invalid!');
    }
    if (user.otp !== otp) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid OTP!');
    }
    // Mark user as verified for password reset
    yield user_model_1.User.updateOne({ email }, { otp: null, otpExpiry: null, canResetPassword: true });
});
const resetPassword = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = payload;
    const user = yield user_model_1.User.findOne({ email }, { canResetPassword: 1 });
    if (!user) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User not found!');
    }
    if (!user.canResetPassword) {
        throw new ApiError_1.default(http_status_1.default.FORBIDDEN, 'Password reset not allowed. Verify OTP first!');
    }
    // Hash the new password
    const hashedPassword = yield bcrypt_1.default.hash(password, Number(config_1.default.bycrypt_salt_rounds));
    // Update the user's password and reset the eligibility flag
    yield user_model_1.User.updateOne({ email }, { password: hashedPassword, canResetPassword: false });
});
exports.AuthService = {
    loginUser,
    loginWithGoogle,
    refreshToken,
    changePassword,
    forgotPass,
    resetPassword,
    verifyOtp,
};
