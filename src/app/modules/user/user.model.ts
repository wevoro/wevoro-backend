/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from 'bcrypt';
import { Schema, model } from 'mongoose';
import config from '../../../config';
import { IUser, UserModel } from './user.interface';

const UserSchema = new Schema<IUser, UserModel>(
  {
    role: {
      type: String,
      enum: ['pro', 'partner'],
      required: true,
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
  },
  {
    timestamps: true,
  }
);

UserSchema.statics.isUserExist = async function (
  email: string
): Promise<IUser | null> {
  return await User.findOne(
    { email, isGoogleUser: false },
    { email: 1, password: 1, role: 1, _id: 1, status: 1 }
  );
};

UserSchema.statics.isGoogleUser = async function (
  email: string
): Promise<IUser | null> {
  return await User.findOne(
    { email, isGoogleUser: true },
    { email: 1, role: 1, _id: 1, status: 1 }
  );
};

UserSchema.statics.isPasswordMatched = async function (
  givenPassword: string,
  savedPassword: string
): Promise<boolean> {
  if (savedPassword && givenPassword) {
    return await bcrypt.compare(givenPassword, savedPassword);
  }
  return false;
};

// User.create() / user.save()
UserSchema.pre('save', async function (next) {
  // hashing user password
  const user = this;
  if (user.password) {
    user.password = await bcrypt.hash(
      user.password,
      Number(config.bycrypt_salt_rounds)
    );
  }

  next();
});

export const User = model<IUser, UserModel>('User', UserSchema);
