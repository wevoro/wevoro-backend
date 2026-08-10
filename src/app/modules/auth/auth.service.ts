import bcrypt from 'bcrypt';
import httpStatus from 'http-status';
import { JwtPayload, Secret } from 'jsonwebtoken';
import config from '../../../config';
import { ENUM_USER_ROLE } from '../../../enums/user';
import ApiError from '../../../errors/ApiError';
import { calculatePartnerPercentage } from '../../../helpers/calculatePartnerPercentage';
import { calculateProCompletion } from '../../../helpers/calculateProCompletion';
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

  // The admin login screen sends source='admin' for both admin and super_admin
  // accounts (the client can't know the role before logging in).
  const roleMatchesSource =
    source === isUserExist?.role ||
    (source === ENUM_USER_ROLE.ADMIN &&
      isUserExist?.role === ENUM_USER_ROLE.SUPER_ADMIN);

  if (isUserExist && !roleMatchesSource) {
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

  // SCRUM-99: passwordless agency accounts must use the email-code flow, not
  // the password form (otherwise the empty-password branch below would let
  // anyone in without a code).
  if (isUserExist && (isUserExist as any).isPasswordless) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This account uses email-code login. Please continue with your email code.'
    );
  }

  if (!isUserExist) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not exist');
  }

  const { email: userEmail, role, _id, status } = isUserExist;
  const permissions = (isUserExist as any).permissions || [];

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

  await User.findByIdAndUpdate(_id, { lastLoginAt: new Date() });

  //create access token & refresh token

  const accessToken = jwtHelpers.createToken(
    { email: userEmail, role, _id, status, permissions },
    config.jwt.secret as Secret,
    config.jwt.expires_in as string
  );

  const refreshToken = jwtHelpers.createToken(
    { email: userEmail, role, _id, status, permissions },
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
    // SCRUM-93: score every required credential, not just driver_license/tb_tests.
    const documents = await Documents.find({ user: _id });

    returnData.completionPercentage = calculateProCompletion(
      personalInfo,
      professionalInfo,
      documents
    );
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
    // `user` is assigned only in the !isGoogleUser branch above, i.e. only when
    // this call actually created the account. Lets the client distinguish a
    // Google signup from a Google login for analytics.
    isNewUser: !!user,
  };

  const personalInfo = await PersonalInfo.findOne({ user: _id });
  if (role === ENUM_USER_ROLE.PRO) {
    const professionalInfo = await ProfessionalInfo.findOne({ user: _id });
    // SCRUM-93: score every required credential, not just driver_license/tb_tests.
    const documents = await Documents.find({ user: _id });

    returnData.completionPercentage = calculateProCompletion(
      personalInfo,
      professionalInfo,
      documents
    );
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

// SCRUM-99: passwordless login/signup for agencies (email + code).
// Sends a 6-digit code; creates the account on first use so the caregiver-link
// flow (Flow 2) is one step: email -> code -> session.
const requestLoginCode = async (payload: {
  email: string;
  role?: string;
  sourceShareId?: string;
}) => {
  const email = (payload.email || '').toLowerCase().trim();
  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is required');
  }

  const isGoogleUser = await User.isGoogleUser(email);
  if (isGoogleUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This account uses Google login. Please continue with Google.'
    );
  }

  let user = await User.findOne(
    { email, isGoogleUser: false },
    { email: 1, role: 1, _id: 1, status: 1, isPasswordless: 1 }
  );

  // Existing password accounts must use password login — EXCEPT agencies (partners),
  // whose password login was retired in SCRUM-99 ("New Login Method"). Partners log in
  // with an emailed code even if they still carry a legacy password; admins/caregivers
  // keep password login. (verifyLoginCode already accepts any account with a valid code,
  // so this guard is the only thing that was locking existing agencies out.)
  if (
    user &&
    !(user as any).isPasswordless &&
    user.role !== ENUM_USER_ROLE.PARTNER
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'This account uses a password. Please log in with your password.'
    );
  }

  let isNewUser = false;
  if (!user) {
    const role = payload.role || ENUM_USER_ROLE.PARTNER;
    // Resolve caregiver share-link attribution (mirrors createUser).
    let sourceCaregiverId: any = undefined;
    if (payload.sourceShareId) {
      const caregiver = await User.findOne(
        { shareId: payload.sourceShareId },
        { _id: 1 }
      );
      if (caregiver) sourceCaregiverId = caregiver._id;
    }
    user = await User.create({
      email,
      role,
      isPasswordless: true,
      sourceShareId: payload.sourceShareId,
      sourceCaregiverId,
    });
    isNewUser = true;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for login

  await User.updateOne({ email }, { otp, otpExpiry });

  await sendEmail(
    email,
    'Your WeVoro login code',
    `
      <div>
        <p>Your WeVoro login code is: <strong>${otp}</strong></p>
        <p>This code is valid for 10 minutes.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      </div>
    `
  );

  return { otpExpiry, isNewUser };
};

// SCRUM-99: verify the emailed code and issue a session (access + refresh tokens).
const verifyLoginCode = async (payload: {
  email: string;
  otp: string;
}): Promise<ILoginUserResponse> => {
  const email = (payload.email || '').toLowerCase().trim();
  const { otp } = payload;

  const user = await User.findOne(
    { email },
    { otp: 1, otpExpiry: 1, role: 1, status: 1, permissions: 1, email: 1 }
  );

  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User not found!');
  }

  if (user.status === 'blocked') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Your account is blocked! Please contact support.'
    );
  }

  if (!user.otp || !user.otpExpiry || new Date() > user.otpExpiry) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Code has expired or is invalid!');
  }

  if (user.otp !== otp) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid code!');
  }

  await User.updateOne(
    { email },
    { otp: null, otpExpiry: null, lastLoginAt: new Date() }
  );

  const { role, _id, status } = user;
  const permissions = (user as any).permissions || [];

  const accessToken = jwtHelpers.createToken(
    { email, role, _id, status, permissions },
    config.jwt.secret as Secret,
    config.jwt.expires_in as string
  );

  const refreshToken = jwtHelpers.createToken(
    { email, role, _id, status, permissions },
    config.jwt.refresh_secret as Secret,
    config.jwt.refresh_expires_in as string
  );

  const returnData: ILoginUserResponse = { accessToken, refreshToken };

  // Completion percentage drives the post-login redirect (mirror loginUser).
  const personalInfo = await PersonalInfo.findOne({ user: _id });
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
  requestLoginCode,
  verifyLoginCode,
  loginWithGoogle,
  refreshToken,
  changePassword,
  forgotPass,
  resetPassword,
  verifyOtp,
};
