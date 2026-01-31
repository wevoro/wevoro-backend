import { PartnerVerification } from './partner-verification.model';
import { User } from '../user/user.model';
import { uploadFile } from '../../../helpers/bunny-upload';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';

type VerificationPayload = {
  licenseNumber: string;
  ein: string;
  user: string;
};

const verifyPartner = async (
  file: any,
  payload: VerificationPayload
): Promise<any> => {
  // Check if a verification document already exists for this user
  const existingVerification = await PartnerVerification.findOne({
    partner: payload.user,
  });

  // File is required if creating new or if updating and no existing file (though logic implies simplified flow)
  // For this flow: always require file if no existing document. If existing, file is optional (update).
  if (!existingVerification && !file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'License file is required');
  }

  // Upload file to Bunny CDN if provided
  let fileUrl: string | undefined;
  if (file) {
    fileUrl = await uploadFile(file);
  }

  // Build the data object
  const verificationData: Record<string, any> = {
    licenseNumber: payload.licenseNumber,
    ein: payload.ein,
    partner: payload.user,
  };

  if (fileUrl) {
    verificationData.licenseFile = fileUrl;
  }

  let result;

  if (existingVerification) {
    // Update existing document
    result = await PartnerVerification.findOneAndUpdate(
      { partner: payload.user },
      verificationData,
      {
        new: true,
      }
    );
  } else {
    // Create new document
    result = await PartnerVerification.create(verificationData);
  }

  // Update user status to in-review
  await User.findByIdAndUpdate(payload.user, { status: 'in-review' });

  return result;
};

const getPartnerVerification = async (userId: string): Promise<any> => {
  const result = await PartnerVerification.findOne({ partner: userId });
  return result;
};

export const PartnerVerificationService = {
  verifyPartner,
  getPartnerVerification,
};
