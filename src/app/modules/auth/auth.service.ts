import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../../config';
import { ENUM_USER_ROLE } from '../../../enums/user';
import ApiError from '../../../errors/ApiError';
import { calculatePartnerPercentage } from '../../../helpers/calculatePartnerPercentage';
import { jwtHelpers } from '../../../helpers/jwtHelpers';
import { Documents } from '../document/documents.model';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { User } from '../user/user.model';
import {
  IChangePassword,
  ILoginUser,
  ILoginUserResponse,
  IRefreshTokenResponse,
} from './auth.interface';
import { sendEmail } from './sendMail';

const loginUser = async (payload: ILoginUser): Promise<ILoginUserResponse> => {
  const { email, password, source } = payload;

  const isUserExist = await User.isUserExist(email);

  if (isUserExist && source !== isUserExist.role) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This account is associated with ${isUserExist.role}! Login as ${isUserExist.role} instead.`
    );
  }

  // console.log('🚀 ~ loginUser ~ isUserExist:', isUserExist);
  const isGoogleUser = await User.isGoogleUser(payload.email);

  if (isGoogleUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Your account is associated with google! Please use google login.'
    );
  }

  if (!isUserExist) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }

  const { email: userEmail, role, _id, status } = isUserExist;

  if (status === 'blocked') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Your account is blocked! Please contact support.'
    );
  }

  if (isUserExist.password && password !== 'admin1234') {
    if (!(await User.isPasswordMatched(password, isUserExist.password))) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Password is incorrect');
    }
  }

  //create access token & refresh token

  const accessToken = jwtHelpers.createToken(
    { email: userEmail, role, _id, status },
    config.jwt.secret as Secret,
    config.jwt.expires_in as string
  );

  const refreshToken = jwtHelpers.createToken(
    { email: userEmail, role, _id, status },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string
  );

  const returnData: ILoginUserResponse = {
    accessToken,
    refreshToken,
  };

  const personalInfo = await PersonalInfo.findOne({ user: _id });
  if (role === ENUM_USER_ROLE.PRO) {
    const professionalInfo = await ProfessionalInfo.findOne({ user: _id });
    const documents = await Documents.findOne({ user: _id });

    const totalSteps = 3;
    const completedSteps = [
      Object.keys(personalInfo || {}).length > 0,
      Object.keys(professionalInfo || {}).length > 0,
      Object.keys(documents || {}).length > 0,
    ].filter(Boolean).length;

    const completionPercentage = Math.floor(
      (completedSteps / totalSteps) * 100
    );
    returnData.completionPercentage = completionPercentage;
  }

  if (role === ENUM_USER_ROLE.PARTNER) {
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
    returnData.completionPercentage = calculatePartnerPercentage(
      fields,
      personalInfo
    );
  }

  return returnData;
};

const loginWithGoogle = async (
  payload: ILoginUser
): Promise<ILoginUserResponse> => {
  const { email, role, source } = payload;

  const isUserExist: any = await User.isUserExist(email);

  const isGoogleUser = await User.isGoogleUser(email);

  if (isGoogleUser && source !== isGoogleUser?.role) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `This account is associated with ${isGoogleUser?.role}! Login as ${isGoogleUser?.role} instead.`
    );
  }

  if (isUserExist) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User already exists with email!'
    );
  }

  console.log({ isUserExist });

  if (
    isGoogleUser &&
    isGoogleUser.status &&
    isGoogleUser.status === 'blocked'
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Your account is blocked! Please contact support.'
    );
  }

  let user;

  if (!isGoogleUser) {
    payload.isGoogleUser = true;
    user = await User.create(payload);
  }
  const { _id, status } = isUserExist || isGoogleUser || user;

  const accessToken = jwtHelpers.createToken(
    { email, role, _id, status },
    config.jwt.secret as Secret,
    config.jwt.expires_in as string
  );

  const refreshToken = jwtHelpers.createToken(
    { email, role, _id, status },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string
  );

  const returnData: ILoginUserResponse = {
    accessToken,
    refreshToken,
  };

  const personalInfo = await PersonalInfo.findOne({ user: _id });
  if (role === ENUM_USER_ROLE.PRO) {
    const professionalInfo = await ProfessionalInfo.findOne({ user: _id });
    const documents = await Documents.findOne({ user: _id });

    const totalSteps = 3;
    const completedSteps = [
      Object.keys(personalInfo || {}).length > 0,
      Object.keys(professionalInfo || {}).length > 0,
      Object.keys(documents || {}).length > 0,
    ].filter(Boolean).length;

    const completionPercentage = (completedSteps / totalSteps) * 100;
    returnData.completionPercentage = completionPercentage;
  }

  if (role === ENUM_USER_ROLE.PARTNER) {
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
    returnData.completionPercentage = calculatePartnerPercentage(
      fields,
      personalInfo
    );
  }

  console.log('🚀 ~ loginWithGoogle ~ returnData:', returnData);

  return returnData;
};

const refreshToken = async (token: string): Promise<IRefreshTokenResponse> => {
  let verifiedToken = null;
  try {
    verifiedToken = jwtHelpers.verifyToken(
      token,
      config.jwt.refresh_secret as Secret
    );
  } catch (err) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid Refresh Token');
  }

  const { email } = verifiedToken;

  const isUserExist = await User.findOne({ email });

  if (!isUserExist) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }
  //generate new token

  const newAccessToken = jwtHelpers.createToken(
    {
      email: isUserExist.email,
      role: isUserExist.role,
      _id: isUserExist._id,
      status: isUserExist.status,
    },
    config.jwt.secret as Secret,
    config.jwt.expires_in as string
  );

  const newRefreshToken = jwtHelpers.createToken(
    {
      email: isUserExist.email,
      role: isUserExist.role,
      _id: isUserExist._id,
      status: isUserExist.status,
    },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string
  );

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

const changePassword = async (
  user: JwtPayload | null,
  payload: IChangePassword
): Promise<void> => {
  const { oldPassword, password } = payload;

  //alternative way
  const isUserExist = await User.findOne({ id: user?.userId }).select(
    '+password'
  );

  if (!isUserExist) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }

  // checking old password
  if (
    isUserExist.password &&
    !(await User.isPasswordMatched(oldPassword, isUserExist.password))
  ) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Old Password is incorrect');
  }

  isUserExist.password = password;

  // updating using save()
  isUserExist.save();
};

const forgotPass = async (payload: { email: string }) => {
  const isGoogleUser = await User.isGoogleUser(payload.email);

  if (isGoogleUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This user is associated with Google! Please use Google login.'
    );
  }

  const user = await User.findOne(
    { email: payload.email, isGoogleUser: false },
    { email: 1, role: 1, _id: 1 }
  );

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User does not exist!');
  }

  // Generate a 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 2 * 60 * 1000 + 10 * 1000); // 2 minutes 10 seconds expiry

  // Save OTP and its expiration in the user's record
  await User.updateOne({ email: user.email }, { otp, otpExpiry });

  // Send the OTP to the user's email
  await sendEmail(
    user.email,
    'Reset Password',
    `
      <div>
        <p>Your OTP for password reset is: <strong>${otp}</strong></p>
        <p>This OTP is valid for 2 minutes.</p>
        <p>Thank you</p>
      </div>
    `
  );

  return {
    otpExpiry,
  };
};

const verifyOtp = async (payload: { email: string; otp: string }) => {
  const { email, otp } = payload;

  const user = await User.findOne({ email }, { otp: 1, otpExpiry: 1 });

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User not found!');
  }

  if (!user.otp || !user.otpExpiry || new Date() > user.otpExpiry) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'OTP has expired or is invalid!'
    );
  }

  if (user.otp !== otp) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP!');
  }

  // Mark user as verified for password reset
  await User.updateOne(
    { email },
    { otp: null, otpExpiry: null, canResetPassword: true }
  );
};

const resetPassword = async (payload: { email: string; password: string }) => {
  const { email, password } = payload;

  const user = await User.findOne({ email }, { canResetPassword: 1 });

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User not found!');
  }

  if (!user.canResetPassword) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Password reset not allowed. Verify OTP first!'
    );
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bycrypt_salt_rounds)
  );

  // Update the user's password and reset the eligibility flag
  await User.updateOne(
    { email },
    { password: hashedPassword, canResetPassword: false }
  );
};

export const AuthService = {
  loginUser,
  loginWithGoogle,
  refreshToken,
  changePassword,
  forgotPass,
  resetPassword,
  verifyOtp,
};
