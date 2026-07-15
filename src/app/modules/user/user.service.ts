import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import fs from 'fs';
import { IUser } from './user.interface';
import { User } from './user.model';

import cloudinary from 'cloudinary';
import mongoose from 'mongoose';
import config from '../../../config';
import { ENUM_USER_ROLE } from '../../../enums/user';
import { calculatePartnerPercentage } from '../../../helpers/calculatePartnerPercentage';
import { calculateProCompletion } from '../../../helpers/calculateProCompletion';
import { sendEmail } from '../auth/sendMail';
import { Documents } from '../document/documents.model';
import { Notification } from './notification.model';

import { PersonalInfo } from './personal-info.model';
import { Pro } from './pro.model';
import { ProfessionalInfo } from './professional-info.model';
import { Waitlist } from './waitlist.model';
import { uploadFile } from '../../../helpers/bunny-upload';
import { extractText, extractImages, getDocumentProxy } from 'unpdf';
import sharp from 'sharp';
import { Offer } from '../offer/offer.model';
import { PartnerVerification } from '../partner-verification/partner-verification.model';
import { CredentialingService } from '../credentialing/credentialing.service';
import { GRANTABLE_PERMISSIONS } from './user.constant';
import crypto from 'crypto';
cloudinary.v2.config({
  cloud_name: config.cloudinary.cloud_name,
  api_key: config.cloudinary.api_key,
  api_secret: config.cloudinary.api_secret,
});

const joinWaitlist = async (email: string) => {
  const existingUser = await Waitlist.findOne({ email });
  if (existingUser) {
    throw new ApiError(500, 'You are already in the waitlist!');
  }

  const newUser = await Waitlist.create({ email });
  await sendEmail(
    'alfonza@joinhorizzon.com',
    'Waitlist Update',
    `
      <div>
        <p>New user has joined the waitlist: <strong>${email}</strong></p>
        <p>Thank you</p>
      </div>
    `
  );
  return newUser;
};

const createUser = async (user: Partial<IUser>): Promise<IUser | null> => {
  // Prevent privilege escalation: public signup may only create pro/partner
  // accounts. Admin / super_admin are created only via the guarded super-admin
  // flows (never through this mass-assignment path).
  if (
    user.role !== ENUM_USER_ROLE.PRO &&
    user.role !== ENUM_USER_ROLE.PARTNER
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid role');
  }
  delete (user as any).permissions;

  const existingUser = await User.isUserExist(user.email as string);
  if (existingUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User already exists');
  }

  const existingGoogleUser = await User.isGoogleUser(user.email as string);
  if (existingGoogleUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'User already exists with google!'
    );
  }

  if (user.role === ENUM_USER_ROLE.PARTNER) {
    delete user.professionalInformation;
    delete user.documents;
  }

  // Generate shareId for pro users
  if (user.role === ENUM_USER_ROLE.PRO) {
    (user as any).shareId = crypto.randomUUID();
  }

  // SCRUM-87/88: capture share-link attribution durably at signup. The agency
  // arrived via a caregiver's share link (/p/[shareId]); resolve and persist the
  // source caregiver so the engagement can be recorded once onboarding completes.
  const sourceShareId = (user as any).sourceShareId;
  delete (user as any).sourceShareId;
  if (user.role === ENUM_USER_ROLE.PARTNER && sourceShareId) {
    let sourceCaregiver = await User.findOne({
      shareId: sourceShareId,
    }).select('_id role');
    // Legacy caregivers (created before shareId existed) share links built from
    // their _id — mirror getUserByShareId's fallback so attribution still lands.
    if (!sourceCaregiver && mongoose.Types.ObjectId.isValid(sourceShareId)) {
      sourceCaregiver = (await User.findById(sourceShareId).select(
        '_id role'
      )) as any;
    }
    if (sourceCaregiver && sourceCaregiver.role === ENUM_USER_ROLE.PRO) {
      (user as any).sourceCaregiverId = sourceCaregiver._id;
    }
  }

  const newUser = await User.create(user);

  if (!newUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to create user');
  }

  return newUser;
};

const updateAllUsers = async (): Promise<any> => {
  const result = await User.updateMany(
    { role: 'pro' },
    { $set: { status: 'pending' } }
  );
  return result;
};

const deleteAccount = async (user: Partial<IUser>) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userId = user._id;
    const userRole = user.role;

    await User.findByIdAndDelete(userId, { session });

    console.log('inside delete account');

    // Delete user from Documents, PersonalInformation, ProfessionalInformation collections
    if (userRole === ENUM_USER_ROLE.PRO) {
      await Promise.all([
        Documents.deleteMany({ user: userId }, { session }),
        PersonalInfo.deleteMany({ user: userId }, { session }),
        ProfessionalInfo.deleteMany({ user: userId }, { session }),
        Pro.deleteMany({ pro: userId }, { session }),
        Notification.deleteMany({ user: userId }),
      ]);
    } else if (userRole === ENUM_USER_ROLE.PARTNER) {
      await Promise.all([
        PersonalInfo.deleteMany({ user: userId }, { session }),
        Pro.deleteMany({ partner: userId }, { session }),
        Offer.deleteMany({ partner: userId }, { session }),
        Notification.deleteMany({ user: userId }),
        PartnerVerification.deleteMany({ partner: userId }, { session }),
      ]);
    }

    await session.commitTransaction();
    session.endSession();
    return 'Account deleted successfully';
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete account'
    );
  }
};

const updateUser = async (
  payload: Partial<IUser> | any,
  id: string
  // file: any
): Promise<IUser | null> => {
  console.log({ payload });
  // Security: role & permissions can ONLY be changed through the dedicated
  // super-admin-guarded endpoints (updateUserRole / setAdminPermissions), never
  // through this generic admin update. Strip them so a plain admin cannot
  // escalate anyone (including themselves) via PATCH /user/update/:id.
  delete payload.role;
  delete payload.permissions;

  if (payload.status === 'removed') {
    const user = await User.findById(id);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    await deleteAccount(user);
  }

  const result = await User.findByIdAndUpdate(id, payload, {
    new: true,
  });

  if (payload.alertType) {
    const { note, alertType } = payload;
    const messageMap: any = {
      block: note
        ? `<p style="font-size: 16px; color: red;">You have been <strong>blocked</strong> from the platform. <br/> <br/> <strong>Note:</strong> ${note}</p>`
        : `<p style="font-size: 16px; color: red;">You have been <strong>blocked</strong> from the platform.</p>`,
      remove: note
        ? `<p style="font-size: 16px; color: red;">You have been <strong>removed</strong> from the platform. <br/> <br/> <strong>Note:</strong> ${note}</p>`
        : `<p style="font-size: 16px; color: red;">You have been <strong>removed</strong> from the platform.</p>`,
      approve: note
        ? `<p style="font-size: 16px; color: green;">Your application has been <strong>approved</strong>. <br/> <br/> <strong>Note:</strong> ${note}</p>`
        : `<p style="font-size: 16px; color: green;">Your application has been <strong>approved</strong>.</p>`,
      reject: note
        ? `<p style="font-size: 16px; color: red;">Your application has been <strong>rejected</strong>. <br/> <br/> <strong>Note:</strong> ${note}</p>`
        : `<p style="font-size: 16px; color: red;">Your application has been <strong>rejected</strong>.</p>`,
    };

    const message = messageMap[alertType];

    if (message) {
      let email = payload.email;
      if (!email && result) {
        email = result.email;
      }

      await Notification.create({
        user: id,
        message,
      });

      await sendEmail(
        email,
        'Notification',
        `
        <div>
          ${message}
          <p>Thank you</p>
        </div>
        `
      );
    }
  }

  return result;
};

const updateOrCreateUserPersonalInformation = async (
  payload: Partial<IUser>,
  id: string,
  file: any
): Promise<IUser | null> => {
  const isPersonalInformationExist = await PersonalInfo.findOne({
    user: id,
  });

  console.log({ file, payload });

  if (file?.path) {
    const cloudRes = await cloudinary.v2.uploader.upload(file.path, {
      upload_preset: 'wevoro',
    });
    payload.image = cloudRes.secure_url;
  }

  let result: any;

  if (!isPersonalInformationExist) {
    result = await PersonalInfo.create({ user: id, ...payload });
  }

  result = await PersonalInfo.findOneAndUpdate(
    { user: id },
    { $set: payload },
    { new: true }
  );

  // SCRUM-87/88: when an agency completes onboarding via a caregiver's share
  // link, record the (caregiver, agency) engagement and fire the one-time
  // "Agency Onboarded" notification. Idempotent and best-effort — attribution
  // must never break the personal-information save.
  try {
    const account = await User.findById(id).select('role sourceCaregiverId');
    if (
      account?.role === ENUM_USER_ROLE.PARTNER &&
      (account as any)?.sourceCaregiverId
    ) {
      await CredentialingService.recordEngagement(
        (account as any).sourceCaregiverId.toString(),
        (id as string).toString()
      );
    }
  } catch (err) {
    console.error('Failed to record credentialing engagement:', err);
  }

  return result;
};

const updateOrCreateUserProfessionalInformation = async (
  payload: any,
  id: string,
  files: any
): Promise<any> => {
  const { certifications }: any = payload;

  // Upload files to Cloudinary and create a map indexed by certification position
  // Files are named as: certification_0, certification_1, etc.
  const fileMap: Record<number, string> = {};

  if (files && files.length > 0) {
    for (const file of files) {
      // Extract index from filename (e.g., "certification_0" -> 0)
      const match = file.originalname.match(/certification_(\d+)/);
      if (match) {
        const index = parseInt(match[1], 10);
        // const cloudRes = await cloudinary.v2.uploader.upload(file.path, {
        //   upload_preset: 'Wevoro',
        // });
        const bunnyRes = await uploadFile(file);
        console.log(
          '🚀 ~ updateOrCreateUserProfessionalInformation ~ bunnyRes:',
          bunnyRes
        );
        fileMap[index] = bunnyRes;
      }
    }
  }

  // Update certifications with uploaded file URLs
  if (certifications && certifications.length > 0) {
    payload.certifications = certifications.map((cert: any, index: number) => {
      // If we have a newly uploaded file for this index, use it
      if (fileMap[index]) {
        return {
          ...cert,
          certificateFile: fileMap[index],
        };
      }
      // Otherwise, keep existing certificateFile (if any)
      return cert;
    });
  }

  const isProfessionalInformationExist = await ProfessionalInfo.findOne({
    user: id,
  });

  let result: any;

  if (!isProfessionalInformationExist) {
    result = await ProfessionalInfo.create({ user: id, ...payload });
  }

  result = await ProfessionalInfo.findOneAndUpdate(
    { user: id },
    { $set: payload },
    { new: true }
  );

  return result;
};

const handleCalculatePartnerPercentage = async (_id: string) => {
  const offersSent = await Offer.countDocuments({ partner: _id });
  const acceptedOffers = await Offer.countDocuments({
    partner: _id,
    status: 'accepted',
  });
  const jobConversion = (acceptedOffers / offersSent) * 100 || 0;
  const jobConversionPercentage = Number(jobConversion.toFixed(2));

  return { offersSent, jobConversionPercentage };
};

const getUserProfile = async (user: Partial<IUser>): Promise<IUser | null> => {
  const { _id, role } = user;

  const existingUser = await User.findById(_id);

  if (!existingUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const personalInfo = await PersonalInfo.findOne({ user: _id });

  const sharableLink = `${config.frontend_url.prod}/pro/${_id}`;

  let completionPercentage = 0;
  let offersSentData = 0;
  let jobConversionPData = 0;

  if (role === ENUM_USER_ROLE.PRO) {
    const professionalInfo = await ProfessionalInfo.findOne({ user: _id });
    // SCRUM-93: score every required credential, not just driver_license/tb_tests.
    const documents = await Documents.find({ user: _id });

    completionPercentage = calculateProCompletion(
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
    completionPercentage = calculatePartnerPercentage(fields, personalInfo);
    const { offersSent, jobConversionPercentage } =
      await handleCalculatePartnerPercentage(_id as string);
    offersSentData = offersSent;
    jobConversionPData = jobConversionPercentage;
  }

  const result = await User.aggregate([
    {
      $match: {
        email: user.email,
        _id: new mongoose.Types.ObjectId(user._id),
      },
    },
    {
      $lookup: {
        from: 'personalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'personalInfo',
      },
    },
    {
      $lookup: {
        from: 'professionalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'professionalInfo',
      },
    },
    {
      $lookup: {
        from: 'partnerverifications',
        localField: '_id',
        foreignField: 'partner',
        as: 'partnerVerification',
      },
    },

    {
      $project: {
        email: 1,
        role: 1,
        status: 1,
        // phone: 1,
        coverImage: 1,
        createdAt: 1,
        updatedAt: 1,
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
        partnerVerification: { $arrayElemAt: ['$partnerVerification', 0] },
        isRecentlyActive: {
          $cond: {
            if: { $ifNull: ['$lastLoginAt', false] },
            then: {
              $lt: [
                {
                  $subtract: ['$$NOW', '$lastLoginAt'],
                },
                7 * 24 * 60 * 60 * 1000,
              ],
            },
            else: false,
          },
        },
        completionPercentage: {
          $cond: {
            if: {
              $or: [
                { $eq: [role, ENUM_USER_ROLE.PRO] },
                { $eq: [role, ENUM_USER_ROLE.PARTNER] },
              ],
            },
            then: completionPercentage,
            else: 0,
          },
        },
        sharableLink: sharableLink,
        shareId: '$shareId',
        offersSent: {
          $cond: {
            if: { $eq: [role, ENUM_USER_ROLE.PARTNER] },
            then: offersSentData,
            else: 0,
          },
        },
        jobConversionPercentage: {
          $cond: {
            if: { $eq: [role, ENUM_USER_ROLE.PARTNER] },
            then: jobConversionPData,
            else: 0,
          },
        },
      },
    },
  ]);

  return result.length > 0 ? result[0] : null;
};

const getUserById = async (id: string): Promise<IUser | null> => {
  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User id is required');
  }
  const sharableLink = `${config.frontend_url.prod}/pro/${id}`;

  const result = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
      },
    },

    {
      $lookup: {
        from: 'personalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'personalInfo',
      },
    },
    {
      $lookup: {
        from: 'professionalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'professionalInfo',
      },
    },

    {
      $project: {
        email: 1,
        name: 1,
        role: 1,
        // phone: 1,
        coverImage: 1,
        createdAt: 1,
        updatedAt: 1,
        status: 1,
        lastLoginAt: 1,
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
        isRecentlyActive: {
          $cond: {
            if: { $ifNull: ['$lastLoginAt', false] },
            then: {
              $lt: [
                {
                  $subtract: ['$$NOW', '$lastLoginAt'],
                },
                7 * 24 * 60 * 60 * 1000,
              ],
            },
            else: false,
          },
        },
        sharableLink: sharableLink,
        shareId: '$shareId',
        backgroundCheckStatus: 1,
        // offersSent: offersSentData,
        // jobConversionPercentage: jobConversionPData,
      },
    },
  ]);

  return result.length > 0 ? result[0] : null;
};

const getUserByShareId = async (shareId: string): Promise<any> => {
  if (!shareId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Share ID is required');
  }

  // Try shareId first, then fall back to _id for existing users without a shareId
  let user = await User.findOne({ shareId });
  if (!user) {
    // Check if it's a valid MongoDB ObjectId and try _id lookup
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(shareId)) {
      user = await User.findById(shareId);
    }
  }
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profile not found');
  }
  const personalInfo = await PersonalInfo.findOne({ user: user._id });
  const profInfo = await ProfessionalInfo.findOne({ user: user._id });
  const documents = await Documents.find({ user: user._id });
  const verifiedCount = documents.filter((d: any) => d.reviewStatus === 'approved').length;

  return {
    _id: user._id,
    role: user.role,
    status: user.status,
    shareId: user.shareId,
    personalInfo: personalInfo ? {
      firstName: personalInfo.firstName,
      lastName: personalInfo.lastName ? personalInfo.lastName.charAt(0) + '.' : '',
      image: personalInfo.image,
      address: personalInfo.address ? {
        city: personalInfo.address.city,
        state: personalInfo.address.state,
      } : null,
    } : null,
    professionalInfo: profInfo ? {
      role: profInfo.role,
    } : null,
    credentialsSummary: {
      verified: verifiedCount,
      total: 5,
    },
  };
};

const getUsers = async (): Promise<IUser[]> => {
  const result = await User.aggregate([
    {
      $lookup: {
        from: 'personalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'personalInfo',
      },
    },
    {
      $lookup: {
        from: 'professionalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'professionalInfo',
      },
    },

    {
      $lookup: {
        from: 'partnerverifications',
        localField: '_id',
        foreignField: 'partner',
        as: 'partnerVerification',
      },
    },
    // {
    //   $sort: { createdAt: -1 },
    // },

    {
      $project: {
        email: 1,
        name: 1,
        role: 1,
        // phone: 1,
        coverImage: 1,
        createdAt: 1,
        updatedAt: 1,
        status: 1,
        lastLoginAt: 1,
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
        isRecentlyActive: {
          $cond: {
            if: { $ifNull: ['$lastLoginAt', false] },
            then: {
              $lt: [
                {
                  $subtract: ['$$NOW', '$lastLoginAt'],
                },
                7 * 24 * 60 * 60 * 1000,
              ],
            },
            else: false,
          },
        },
        partnerVerification: { $arrayElemAt: ['$partnerVerification', 0] },
      },
    },
  ]);

  return result;
};

const updateCoverImage = async (
  id: string,
  file: any
): Promise<IUser | null> => {
  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User id is required');
  }

  if (!file?.path) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'File is required');
  }

  const cloudRes = await cloudinary.v2.uploader.upload(file.path, {
    upload_preset: 'wevoro',
  });
  const result = await User.findByIdAndUpdate(
    id,
    { coverImage: cloudRes.secure_url },
    { new: true }
  );
  return result;
};

const storePro = async (payload: any, user: Partial<IUser>): Promise<any> => {
  const { pro } = payload;

  const existingPro = await Pro.findOne({ partner: user._id, pro });
  if (existingPro) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pro already exists');
  }

  const result = await Pro.create({ partner: user._id, pro });
  return result;
};

const getPros = async (user: Partial<IUser>): Promise<IUser[]> => {
  const result = await Pro.aggregate([
    {
      $match: {
        partner: new mongoose.Types.ObjectId(user._id),
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'pro',
        foreignField: '_id',
        as: 'pro',
        pipeline: [
          {
            $lookup: {
              from: 'personalinformations',
              localField: '_id',
              foreignField: 'user',
              as: 'personalInfo',
            },
          },
          {
            $lookup: {
              from: 'professionalinformations',
              localField: '_id',
              foreignField: 'user',
              as: 'professionalInfo',
            },
          },

          {
            $addFields: {
              personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
              professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
            },
          },
          {
            $match:
              user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {},
          },
          {
            $project: {
              password: 0,
              isGoogleUser: 0,
              canResetPassword: 0,
              __v: 0,
            },
          },
          {
            $addFields: {
              isRecentlyActive: {
                $cond: {
                  if: { $ifNull: ['$lastLoginAt', false] },
                  then: {
                    $lt: [
                      {
                        $subtract: ['$$NOW', '$lastLoginAt'],
                      },
                      7 * 24 * 60 * 60 * 1000,
                    ],
                  },
                  else: false,
                },
              },
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 0,
        pro: 1,
      },
    },
    {
      $unwind: '$pro',
    },
  ]);

  return result.map(item => item.pro).reverse();
};

// Browse all available caregivers for partner (approved pros with full profile info)
const getAllAvailablePros = async (): Promise<IUser[]> => {
  const result = await User.aggregate([
    {
      $match: {
        role: 'pro',
        status: 'approved',
      },
    },
    {
      $lookup: {
        from: 'personalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'personalInfo',
      },
    },
    {
      $lookup: {
        from: 'professionalinformations',
        localField: '_id',
        foreignField: 'user',
        as: 'professionalInfo',
      },
    },
    {
      $lookup: {
        from: 'documents',
        localField: '_id',
        foreignField: 'user',
        as: 'documents',
      },
    },
    {
      $addFields: {
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
        isRecentlyActive: {
          $cond: {
            if: { $ifNull: ['$lastLoginAt', false] },
            then: {
              $lt: [{ $subtract: ['$$NOW', '$lastLoginAt'] }, 7 * 24 * 60 * 60 * 1000],
            },
            else: false,
          },
        },
        credentialSummary: {
          total: { $size: '$documents' },
          verified: {
            $size: {
              $filter: {
                input: '$documents',
                as: 'doc',
                cond: { $eq: ['$$doc.reviewStatus', 'approved'] },
              },
            },
          },
          pending: {
            $size: {
              $filter: {
                input: '$documents',
                as: 'doc',
                cond: { $eq: ['$$doc.reviewStatus', 'pending'] },
              },
            },
          },
          rejected: {
            $size: {
              $filter: {
                input: '$documents',
                as: 'doc',
                cond: { $eq: ['$$doc.reviewStatus', 'rejected'] },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        password: 0,
        isGoogleUser: 0,
        canResetPassword: 0,
        documents: 0,
        __v: 0,
      },
    },
    { $sort: { createdAt: -1 } },
  ]);
  return result;
};

const createNotification = async (payload: any): Promise<any> => {
  const user = await User.findById(payload.user);
  const email = (user?.email as string) || payload.email;

  console.log(email, user, payload);

  await sendEmail(
    email,
    'Notification',
    `
    <div>
    <p>New notification: <strong>${payload.message}</strong></p>

    <p>Thank you</p>
    </div>
    `
  );

  const result = await Notification.create(payload);

  return result;
};

const getNotifications = async (user: Partial<IUser>): Promise<any> => {
  const result = await Notification.find({ user: user._id }).sort({
    createdAt: -1,
  });
  return result;
};

const deleteNotification = async (id: string): Promise<any> => {
  const result = await Notification.findByIdAndDelete(id);
  return result;
};

const markAllNotificationsAsRead = async (
  user: Partial<IUser>
): Promise<any> => {
  const result = await Notification.updateMany(
    { user: user._id },
    { $set: { isRead: true } }
  );
  return result;
};

const autoFillAI = async (user: Partial<IUser>, file: any): Promise<any> => {
  if (!file?.path) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Resume file is required');
  }

  // Use unpdf for serverless-compatible PDF text extraction
  const fileBuffer = fs.readFileSync(file.path);

  let profileImgUrl = null;
  let pdfDoc;
  try {
    // Create a copy of the array buffer since pdf.js web workers can detach buffers via structuredClone
    const uint8ArrayCopy = new Uint8Array(fileBuffer).slice();
    pdfDoc = await getDocumentProxy(uint8ArrayCopy);
    const imagesData = await extractImages(pdfDoc, 1);

    // Sort by largest area first
    const sortedImages = imagesData.sort(
      (a, b) => b.width * b.height - a.width * a.height
    );

    if (sortedImages.length > 0) {
      const largestImg = sortedImages[0];
      // Only process if it's reasonably sized, to avoid grabbing a tiny icon
      if (largestImg.width >= 50 && largestImg.height >= 50) {
        const pngBuffer = await sharp(
          Buffer.from(
            largestImg.data.buffer,
            largestImg.data.byteOffset,
            largestImg.data.byteLength
          ),
          {
            raw: {
              width: largestImg.width,
              height: largestImg.height,
              channels: largestImg.channels,
            },
          }
        )
          .png()
          .toBuffer();

        const uploadRes = await new Promise((resolve, reject) => {
          const stream = cloudinary.v2.uploader.upload_stream(
            { upload_preset: 'wevoro' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          stream.end(pngBuffer);
        });

        profileImgUrl = (uploadRes as any).secure_url;
      }
    }
  } catch (imgError) {
    console.error('Failed to extract/upload profile image from PDF:', imgError);
  }

  let resumeText = '';
  try {
    if (!pdfDoc) {
      const uint8ArrayCopy2 = new Uint8Array(fileBuffer).slice();
      pdfDoc = await getDocumentProxy(uint8ArrayCopy2);
    }
    const extractResult = await extractText(pdfDoc, {
      mergePages: true,
    });
    resumeText = extractResult.text;
  } catch (textError) {
    console.error('Failed to extract text from PDF:', textError);
  }
  console.log('🚀 ~ autoFillAI ~ resumeText:', resumeText);

  if (!resumeText || resumeText.trim().length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'The uploaded file appears to be empty. Please upload a valid CV.'
    );
  }

  // Define the expected JSON schema for OpenAI
  const systemPrompt = `You are a resume parser AI. Extract information from the provided resume text and return a clean JSON object with the following structure:

{
  "isValidResume": true or false,
  "personalInformation": {
    "firstName": "string or null",
    "lastName": "string or null",
    "phone": "string or null",
    "bio": "string or null (short professional summary)",
    "dateOfBirth": "ISO date string or null",
    "gender": "Male, Female, Other, or null",
    "address": {
      "street": "string or null",
      "city": "string or null",
      "state": "string or null",
      "zipCode": "string or null",
      "country": "string or null"
    }
  },
  "professionalInformation": {
    "education": [
      {
        "degree": "string",
        "institution": "string",
        "yearOfGraduation": number or null,
        "fieldOfStudy": "string or null",
        "grade": "string or null (GPA or grade)"
      }
    ],
    "experience": [
      {
        "jobTitle": "string",
        "companyName": "string",
        "duration": "string (e.g., 'Jan 2020 - Dec 2022' or '3 years')",
        "responsibilities": "string (brief description of role)"
      }
    ],
    "certifications": [
      {
        "title": "string",
        "institution": "string or null",
        "issueDate": "ISO date string or null",
        "expireDate": "ISO date string or null",
        "credentialId": "string or null",
        "credentialUrl": "string or null"
      }
    ],
    "skills": ["string array of skills"]
  }
}

Rules:
1. Return ONLY the JSON object, no additional text, markdown, or explanation.
2. Use null for fields that cannot be determined from the resume.
3. For arrays (education, experience, certifications, skills), return an empty array [] if no items found.
4. Ensure dates are in ISO format (YYYY-MM-DD) where possible.
5. Extract a professional bio/summary if available, otherwise use null.
6. Parse the full name into firstName and lastName.
7. If the text does not appear to be a valid resume or CV (e.g. a random paragraph), set "isValidResume" to false. Otherwise, set it to true.`;

  // Call OpenAI API
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai_api_key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Parse this resume and extract the information:\n\n${resumeText}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error('OpenAI API error:', errorData);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process resume with AI'
    );
  }

  const openaiResponse = await response.json();
  const content = openaiResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'No response from AI');
  }

  let cleanedContent = content.trim();
  if (cleanedContent.startsWith('```json')) {
    cleanedContent = cleanedContent.slice(7);
  } else if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.slice(3);
  }
  if (cleanedContent.endsWith('```')) {
    cleanedContent = cleanedContent.slice(0, -3);
  }
  cleanedContent = cleanedContent.trim();

  const parsedData = JSON.parse(cleanedContent);

  if (!parsedData.isValidResume) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "We couldn't detect a valid CV format. Please upload a proper resume."
    );
  }

  if (profileImgUrl && parsedData.personalInformation) {
    parsedData.personalInformation.image = profileImgUrl;
  }
  return parsedData;
};

// SCRUM-66: Update GCHEXS background check self-report status
const updateGchexsStatus = async (
  userId: string,
  gchexsStatus: 'yes' | 'no',
  gchexsDocumentUrl?: string,
  gchexsDocumentFileId?: string,
): Promise<any> => {
  const updateData: Record<string, any> = {
    gchexsStatus,
    gchexsUpdatedAt: new Date(),
  };

  if (gchexsStatus === 'yes' && gchexsDocumentUrl) {
    updateData.gchexsDocumentUrl = gchexsDocumentUrl;
    updateData.gchexsDocumentFileId = gchexsDocumentFileId;
  }

  // If changing to 'no', don't delete the document (retained per SCRUM-66 spec)
  // Just update the status

  const result = await ProfessionalInfo.findOneAndUpdate(
    { user: userId },
    { $set: updateData },
    { new: true, upsert: true }
  );

  return result;
};

// ============================================================================
// Super Admin panel — admin management (all callers are super_admin-guarded at
// the route layer). Role & permission mutations live here ONLY, never in the
// generic updateUser.
// ============================================================================

/** List every admin / super_admin with their permissions. */
const getAdmins = async (): Promise<any[]> => {
  const admins = await User.find({
    role: { $in: [ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.SUPER_ADMIN] },
  })
    .select('email role permissions previousRole status createdAt lastLoginAt')
    .lean();

  const withNames = await Promise.all(
    admins.map(async (a: any) => {
      const info = await PersonalInfo.findOne({ user: a._id })
        .select('firstName lastName image companyName')
        .lean();
      const name = info
        ? `${(info as any).firstName || ''} ${(info as any).lastName || ''}`.trim()
        : '';
      return {
        ...a,
        name: name || (info as any)?.companyName || a.email,
        image: (info as any)?.image || null,
      };
    })
  );
  return withNames;
};

/**
 * Promote a normal user to admin, or demote an admin back to a normal role.
 * Only role — nothing else — is touched. Super admins can never be created or
 * demoted here (that path is the guarded super-setup / seed only).
 */
const updateUserRole = async (
  id: string,
  role: string,
  actorId: string
): Promise<IUser | null> => {
  const allowedTargets = [
    ENUM_USER_ROLE.ADMIN,
    ENUM_USER_ROLE.PRO,
    ENUM_USER_ROLE.PARTNER,
  ] as string[];
  if (!allowedTargets.includes(role)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid target role');
  }

  const target = await User.findById(id).select('role previousRole email');
  if (!target) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // A super admin can only be changed via the guarded super-admin flow.
  if (target.role === ENUM_USER_ROLE.SUPER_ADMIN) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'A super admin cannot be modified here'
    );
  }

  // Never let a super admin lock themselves out.
  if (actorId && actorId.toString() === id.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot change your own role');
  }

  const update: any = { role };
  if (role === ENUM_USER_ROLE.ADMIN) {
    // Promoting: remember where they came from so demote is lossless.
    if (
      target.role === ENUM_USER_ROLE.PRO ||
      target.role === ENUM_USER_ROLE.PARTNER
    ) {
      update.previousRole = target.role;
    }
  } else {
    // Demoting an admin back to a normal user: restore their original role if we
    // remembered it, and clear any granted permissions.
    update.role =
      (target as any).previousRole === ENUM_USER_ROLE.PARTNER ||
      (target as any).previousRole === ENUM_USER_ROLE.PRO
        ? (target as any).previousRole
        : role;
    update.permissions = [];
    update.previousRole = null;
  }

  const result = await User.findByIdAndUpdate(id, update, { new: true });
  return result;
};

/** Set the granular permission keys on an admin. Validated against the grantable list. */
const setAdminPermissions = async (
  id: string,
  permissions: string[]
): Promise<IUser | null> => {
  if (!Array.isArray(permissions)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'permissions must be an array');
  }
  const invalid = permissions.filter((p) => !GRANTABLE_PERMISSIONS.includes(p));
  if (invalid.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid permission(s): ${invalid.join(', ')}`
    );
  }

  const target = await User.findById(id).select('role');
  if (!target) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (target.role !== ENUM_USER_ROLE.ADMIN) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Permissions can only be set on an admin'
    );
  }

  const result = await User.findByIdAndUpdate(
    id,
    { permissions: Array.from(new Set(permissions)) },
    { new: true }
  );
  return result;
};

/**
 * Self-serve super-admin creation via the setup link. Gated by a shared secret
 * (config.super_admin.setup_key). Creates a new super_admin, or promotes an
 * existing account to super_admin (and resets its password if supplied).
 */
const superSetup = async (payload: {
  email: string;
  password: string;
  setupKey: string;
}): Promise<{ email: string; created: boolean }> => {
  const { email, password, setupKey } = payload || ({} as any);

  if (!setupKey || setupKey !== config.super_admin.setup_key) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid setup key');
  }
  if (!email || !password) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email and password are required');
  }
  if (String(password).length < 6) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Password must be at least 6 characters'
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail }).select(
    '_id password'
  );
  if (existing) {
    // Promote + reset password (pre-save hook re-hashes it).
    existing.role = ENUM_USER_ROLE.SUPER_ADMIN;
    existing.status = 'approved';
    (existing as any).permissions = [];
    (existing as any).password = password;
    (existing as any).isGoogleUser = false;
    await existing.save();
    return { email: normalizedEmail, created: false };
  }

  await User.create({
    email: normalizedEmail,
    password,
    role: ENUM_USER_ROLE.SUPER_ADMIN,
    status: 'approved',
    permissions: [],
  });
  return { email: normalizedEmail, created: true };
};

/**
 * Idempotent boot seed: guarantee a super admin exists — but ONLY when both
 * SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars are set. With no env
 * config this is a no-op; super admins are then created via /super-setup.
 */
const ensureSuperAdmin = async (): Promise<void> => {
  try {
    if (!config.super_admin.email || !config.super_admin.password) return;
    const email = config.super_admin.email.trim().toLowerCase();
    const existing = await User.findOne({ email }).select('_id role');
    if (!existing) {
      await User.create({
        email,
        password: config.super_admin.password,
        role: ENUM_USER_ROLE.SUPER_ADMIN,
        status: 'approved',
        permissions: [],
      });
      // eslint-disable-next-line no-console
      console.log(`Seeded fixed super admin: ${email}`);
    } else if (existing.role !== ENUM_USER_ROLE.SUPER_ADMIN) {
      await User.findByIdAndUpdate(existing._id, {
        role: ENUM_USER_ROLE.SUPER_ADMIN,
        status: 'approved',
      });
      // eslint-disable-next-line no-console
      console.log(`Promoted existing account to super admin: ${email}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('ensureSuperAdmin failed:', err);
  }
};

export const UserService = {
  createUser,
  updateUser,
  getAdmins,
  updateUserRole,
  setAdminPermissions,
  superSetup,
  ensureSuperAdmin,
  getUserProfile,
  updateOrCreateUserPersonalInformation,
  updateOrCreateUserProfessionalInformation,
  // updateOrCreateUserDocuments,
  getUserById,
  updateCoverImage,
  getPros,
  joinWaitlist,
  storePro,
  createNotification,
  getNotifications,
  deleteNotification,
  markAllNotificationsAsRead,
  deleteAccount,
  getUsers,
  updateAllUsers,
  autoFillAI,
  getUserByShareId,
  updateGchexsStatus,
  getAllAvailablePros,
};
