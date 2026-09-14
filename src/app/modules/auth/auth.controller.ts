import { Request, Response } from 'express';
import config from '../../../config';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { ILoginUserResponse, IRefreshTokenResponse } from './auth.interface';
import { AuthService } from './auth.service';

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const { ...loginData } = req.body;
  const result = await AuthService.loginUser(loginData);
  const { refreshToken } = result;
  // set refresh token into cookie
  const cookieOptions = {
    secure: config.env === 'production',
    httpOnly: true,
    //  sameSite: 'strict',
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  sendResponse<ILoginUserResponse>(res, {
    statusCode: 200,
    success: true,
    message: 'User logged in successfully !',
    data: result,
  });
});

const loginWithGoogle = catchAsync(async (req: Request, res: Response) => {
  const { ...loginData } = req.body;
  const result = await AuthService.loginWithGoogle(loginData);
  const { refreshToken } = result;
  // set refresh token into cookie
  const cookieOptions = {
    secure: config.env === 'production',
    httpOnly: true,
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  sendResponse<ILoginUserResponse>(res, {
    statusCode: 200,
    success: true,
    message: 'User logged in with google successfully !',
    data: result,
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.cookies;
  const bodyRefreshToken = req.body.refreshToken;

  const result = await AuthService.refreshToken(
    refreshToken || bodyRefreshToken
  );

  // set refresh token into cookie
  const cookieOptions = {
    secure: config.env === 'production',
    httpOnly: true,
  };

  res.cookie('refreshToken', refreshToken || bodyRefreshToken, cookieOptions);

  sendResponse<IRefreshTokenResponse>(res, {
    statusCode: 200,
    success: true,
    message: 'Token refreshed successfully!',
    data: result,
  });
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  const { ...passwordData } = req.body;

  await AuthService.changePassword(user, passwordData);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password changed successfully !',
  });
});

const forgotPass = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.forgotPass(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Please check your email for OTP!',
    data: result,
  });
});

const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  await AuthService.verifyOtp(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'OTP verified successfully!',
  });
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthService.resetPassword(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset successfully!',
  });
});

// SCRUM-99: passwordless agency login — send the emailed code
const requestLoginCode = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.requestLoginCode(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'We sent a login code to your email.',
    data: result,
  });
});

// SCRUM-99: passwordless agency login — verify the code and start a session
const verifyLoginCode = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.verifyLoginCode(req.body);
  const { refreshToken } = result;
  const cookieOptions = {
    secure: config.env === 'production',
    httpOnly: true,
  };
  res.cookie('refreshToken', refreshToken, cookieOptions);

  sendResponse<ILoginUserResponse>(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully!',
    data: result,
  });
});

export const AuthController = {
  loginUser,
  requestLoginCode,
  verifyLoginCode,
  refreshToken,
  changePassword,
  forgotPass,
  verifyOtp,
  resetPassword,
  loginWithGoogle,
};
