/* eslint-disable no-unused-vars */
import { Model } from 'mongoose';

export type IUser = {
  _id: import('mongoose').Types.ObjectId | string;
  role: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  image: string;
  isGoogleUser: boolean;
  status: string;
  otp: string;
  coverImage: string;
  otpExpiry: Date;
  lastLoginAt: Date;
  canResetPassword: boolean;
  personalInformation: {
    bio: string;
    dateOfBirth: Date;
    gender: string;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };
  professionalInformation: {
    education: [
      {
        degree: string;
        institution: string;
        yearOfGraduation: Date;
        fieldOfStudy: string;
        grade: string;
      }
    ];
    experience: [
      {
        jobTitle: string;
        companyName: string;
        duration: string;
        responsibilities: string;
      }
    ];
    certifications: [
      {
        title: string;
        institution: string;
        issueDate: Date;
        expireDate: Date;
        credentialId: string;
        credentialUrl: string;
        certificateFile: string;
      }
    ];
    skills: string[];
  };
  documents: {
    certificate: string;
    resume: string;
    governmentId: string;
  };
};

export type UserModel = {
  isUserExist(
    email: string
  ): Promise<
    Pick<
      IUser,
      'email' | 'password' | 'role' | 'isGoogleUser' | '_id' | 'status'
    >
  >;
  isGoogleUser(
    email: string
  ): Promise<Pick<IUser, 'email' | 'role' | 'isGoogleUser' | '_id' | 'status'>>;
  isPasswordMatched(
    givenPassword: string,
    savedPassword: string
  ): Promise<boolean>;
} & Model<IUser>;
