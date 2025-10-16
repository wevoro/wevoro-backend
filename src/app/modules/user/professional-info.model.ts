/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const ProfessionalInfoSchema = new Schema<any>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    education: [
      {
        degree: String,
        institution: String,
        yearOfGraduation: Number,
        fieldOfStudy: String,
        grade: String,
      },
    ],
    experience: [
      {
        jobTitle: String,
        companyName: String,
        duration: String,
        responsibilities: String,
      },
    ],
    certifications: [
      {
        fileId: { type: String },
        title: { type: String },
        institution: { type: String },
        issueDate: { type: Date },
        expireDate: { type: Date },
        credentialId: { type: String },
        credentialUrl: { type: String },
        certificateFile: { type: String },
      },
    ],
    skills: [String],
  },
  {
    timestamps: true,
  }
);

export const ProfessionalInfo = model<any>(
  'ProfessionalInformation',
  ProfessionalInfoSchema
);
