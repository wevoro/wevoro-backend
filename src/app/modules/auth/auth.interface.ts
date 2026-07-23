import { ENUM_USER_ROLE } from '../../../enums/user';

export type ILoginUser = {
  email: string;
  password: string;
  role?: ENUM_USER_ROLE;
  isGoogleUser?: boolean;
  source?: ENUM_USER_ROLE;
};

export type ILoginUserResponse = {
  accessToken: string;
  refreshToken?: string;
  completionPercentage?: number;
  /**
   * Google sign-in creates the account on first use, so the client cannot tell
   * a signup from a login. Set only on the Google path, so the frontend can
   * fire agency_account_created exactly once per real account.
   */
  isNewUser?: boolean;
};

export type IRefreshTokenResponse = {
  accessToken: string;
  refreshToken: string;
};

export type IVerifiedLoginUser = {
  userId: string;
  role: ENUM_USER_ROLE;
};

export type IChangePassword = {
  oldPassword: string;
  password: string;
};
