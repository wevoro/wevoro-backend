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
import { sendEmail } from '../auth/sendMail';
import { Documents } from '../document/documents.model';
import { Notification } from './notification.model';

import { PersonalInfo } from './personal-info.model';
import { Pro } from './pro.model';
import { ProfessionalInfo } from './professional-info.model';
import { Waitlist } from './waitlist.model';
import { uploadFile } from '../../../helpers/bunny-upload';
import { extractText } from 'unpdf';
import { Offer } from '../offer/offer.model';
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
  const uint8Array = new Uint8Array(fileBuffer);

  const { text: resumeText } = await extractText(uint8Array, {
    mergePages: true,
  });
  console.log('🚀 ~ autoFillAI ~ resumeText:', resumeText);

  if (!resumeText || resumeText.trim().length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Could not extract text from the PDF'
    );
  }

  // Define the expected JSON schema for OpenAI
  const systemPrompt = `You are a resume parser AI. Extract information from the provided resume text and return a clean JSON object with the following structure:

{
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
6. Parse the full name into firstName and lastName.`;

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
  return parsedData;
};

export const UserService = {
  createUser,
  updateUser,
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
};
