/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const PartnerVerificationSchema = new Schema<any>(
  {
    licenseNumber: {
      type: String,
      required: true,
    },
    ein: {
      type: String,
      required: true,
    },
    licenseFile: {
      type: String,
      required: true,
    },
    partner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const PartnerVerification = model<any>(
  'PartnerVerification',
  PartnerVerificationSchema
);
