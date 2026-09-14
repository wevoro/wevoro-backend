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
   * SCRUM-99: has the agency submitted the short "Complete your agency account"
   * form? completionPercentage cannot answer this — it scores nine fields from
   * the older, longer agency profile (image, phone, bio, dateOfBirth, industry…)
   * that this form never asks for, so a fully-submitted agency still lands at
   * 44% and was sent back to the form on every single login.
   */
  agencyProfileComplete?: boolean;
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
