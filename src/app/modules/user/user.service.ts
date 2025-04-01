import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';

import { IUser } from './user.interface';
import { User } from './user.model';

import cloudinary from 'cloudinary';
import mongoose from 'mongoose';
import config from '../../../config';
import { ENUM_USER_ROLE } from '../../../enums/user';
import { calculatePartnerPercentage } from '../../../helpers/calculatePartnerPercentage';
import { sendEmail } from '../auth/sendMail';
import { Documents } from './documents.model';
import { Notification } from './notification.model';
import { Offer } from './offer.model';
import { PersonalInfo } from './personal-info.model';
import { Pro } from './pro.model';
import { ProfessionalInfo } from './professional-info.model';
import { Waitlist } from './waitlist.model';
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

    // Delete user from User collection
    await User.findByIdAndDelete(userId, { session });

    console.log('inside delete account');

    // Delete user from Documents, PersonalInformation, ProfessionalInformation collections
    if (userRole === ENUM_USER_ROLE.PRO) {
      await Promise.all([
        Documents.deleteMany({ user: userId }, { session }),
        PersonalInfo.deleteMany({ user: userId }, { session }),
        ProfessionalInfo.deleteMany({ user: userId }, { session }),
        Pro.deleteMany({ pro: userId }, { session }),
      ]);
    } else if (userRole === ENUM_USER_ROLE.PARTNER) {
      await Promise.all([
        PersonalInfo.deleteMany({ user: userId }, { session }),
        Pro.deleteMany({ partner: userId }, { session }),
        Offer.deleteMany({ partner: userId }, { session }),
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
  payload: Partial<IUser>,
  id: string
  // file: any
): Promise<IUser | null> => {
  console.log({ payload });
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

  // console.log({ file, payload });

  if (file?.path) {
    const cloudRes = await cloudinary.v2.uploader.upload(file.path);
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

  return result;
};
const updateOrCreateUserProfessionalInformation = async (
  payload: any,
  id: string,
  files: any
): Promise<any> => {
  const { certifications }: any = payload;

  const fileMap: any = {};

  if (files.length > 0) {
    for (const file of files) {
      const cloudRes = await cloudinary.v2.uploader.upload(file.path);

      fileMap[file.originalname] = cloudRes.secure_url;
    }
  }

  // console.log('fileMap', fileMap, certifications);

  if (
    certifications &&
    certifications.length > 0 &&
    Object.keys(fileMap).length > 0
  ) {
    const processedCertifications = certifications.map((cert: any) => {
      if (fileMap[cert.fileId]) {
        return {
          ...cert,
          certificateFile: fileMap[cert.fileId],
        };
      }
      return cert;
    });

    payload.certifications = processedCertifications;
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
const updateOrCreateUserDocuments = async (
  id: string,
  files: any,
  payload: any
): Promise<any> => {
  let fileMap: any = {};

  if (files?.certificate?.[0]?.path) {
    fileMap.certificate = files.certificate[0].path;
  }
  if (files?.resume?.[0]?.path) {
    fileMap.resume = files.resume[0].path;
  }
  if (files?.governmentId?.[0]?.path) {
    fileMap.governmentId = files.governmentId[0].path;
  }

  if (Object.keys(fileMap).length > 0) {
    for (const file of Object.keys(fileMap)) {
      const cloudRes = await cloudinary.v2.uploader.upload(fileMap[file]);
      // console.log('cloudRes', cloudRes);
      fileMap[file] = cloudRes.secure_url;
    }
  }

  const isDocumentsExist = await Documents.findOne({ user: id });

  let result: any;

  if (!isDocumentsExist) {
    result = await Documents.create({ user: id, ...fileMap });
  }

  if (Object.keys(payload).length > 0) {
    fileMap = payload;
  }

  // console.log('query', fileMap);

  result = await Documents.findOneAndUpdate(
    { user: id },
    { $set: fileMap },
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
    const documents = await Documents.findOne({ user: _id });

    const totalSteps = 3;
    const completedSteps = [
      Object.keys(personalInfo || {}).length > 0,
      Object.keys(professionalInfo || {}).length > 0,
      Object.keys(documents || {}).length > 0,
    ].filter(Boolean).length;

    completionPercentage = Math.floor((completedSteps / totalSteps) * 100);
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
        from: 'documents',
        localField: '_id',
        foreignField: 'user',
        as: 'documents',
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

        documents: { $arrayElemAt: ['$documents', 0] },
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
      $lookup: {
        from: 'documents',
        localField: '_id',
        foreignField: 'user',
        as: 'documents',
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
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },

        documents: { $arrayElemAt: ['$documents', 0] },
        sharableLink: sharableLink,
        // offersSent: offersSentData,
        // jobConversionPercentage: jobConversionPData,
      },
    },
  ]);

  return result.length > 0 ? result[0] : null;
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
        from: 'documents',
        localField: '_id',
        foreignField: 'user',
        as: 'documents',
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
        personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
        professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
        documents: { $arrayElemAt: ['$documents', 0] },
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

  const cloudRes = await cloudinary.v2.uploader.upload(file.path);
  const result = await User.findByIdAndUpdate(
    id,
    { coverImage: cloudRes.secure_url },
    { new: true }
  );
  return result;
};

const createOrUpdateOffer = async (
  payload: any,
  user: Partial<IUser>
): Promise<any> => {
  // Ensure the payload has the partner ID
  payload.partner = user._id;

  // Check if `payload.offer` exists to differentiate between update and create
  if (payload?.offer) {
    // Try updating the document
    const result = await Offer.findByIdAndUpdate(payload.offer, payload, {
      new: true, // Return the updated document
      upsert: true, // Create a new document if it doesn't exist
      setDefaultsOnInsert: true, // Ensure default values are set
    });

    return result;
  } else {
    // If no `offer` ID is provided, create a new document explicitly
    const newOffer = new Offer(payload);
    const savedOffer = await newOffer.save();
    return savedOffer;
  }
};

const getOffers = async (user: Partial<IUser>): Promise<any> => {
  const result = await Offer.aggregate([
    {
      $match: {
        [user.role as string]: new mongoose.Types.ObjectId(user._id),
        ...(user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {}),
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
              documents: { $arrayElemAt: ['$documents', 0] },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'partner',
        foreignField: '_id',
        as: 'partner',
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
            $addFields: {
              personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
            },
          },
        ],
      },
    },
    {
      $sort: { createdAt: -1 }, // Sort by createdAt in descending order
    },
    {
      $project: {
        pro: { $arrayElemAt: ['$pro', 0] },
        partner: { $arrayElemAt: ['$partner', 0] },
        notes: 1,
        documentsNeeded: 1,
        status: 1,
        jobLink: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  return result;
};

const deleteOffer = async (id: string): Promise<any> => {
  const result = await Offer.findByIdAndDelete(id);
  return result;
};

const updateOffer = async (id: string, payload: any): Promise<any> => {
  const result = await Offer.findByIdAndUpdate(id, payload, { new: true });

  return result;
};

const updateOfferNotes = async (id: string, payload: any): Promise<any> => {
  const result = await Offer.findByIdAndUpdate(
    id,
    { $push: { notes: payload } },
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
              documents: { $arrayElemAt: ['$documents', 0] },
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

const uploadOfferDocuments = async (files: any, id: string): Promise<any> => {
  const fileMap: any = {};
  if (files.length > 0) {
    for (const file of files) {
      const cloudRes = await cloudinary.v2.uploader.upload(file.path);
      fileMap[file.originalname] = cloudRes.secure_url;
    }
  }

  const offer = await Offer.findById(id);
  if (!offer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offer not found');
  }

  const documentsNeeded = offer.documentsNeeded;

  const documents = documentsNeeded.map((document: any) => {
    if (fileMap[document._id]) {
      return { ...document, url: fileMap[document._id], status: 'uploaded' };
    }
    return document;
  });

  offer.documentsNeeded = documents;
  offer.status = 'responded';
  await offer.save();
  return offer;
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

export const UserService = {
  createUser,
  updateUser,
  getUserProfile,
  updateOrCreateUserPersonalInformation,
  updateOrCreateUserProfessionalInformation,
  updateOrCreateUserDocuments,
  getUserById,
  updateCoverImage,
  getPros,
  joinWaitlist,
  createOrUpdateOffer,
  getOffers,
  deleteOffer,
  storePro,
  uploadOfferDocuments,
  updateOffer,
  updateOfferNotes,
  createNotification,
  getNotifications,
  deleteNotification,
  markAllNotificationsAsRead,
  deleteAccount,
  getUsers,
  updateAllUsers,
};
