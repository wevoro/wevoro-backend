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
    // SCRUM-66: GCHEXS Background Check Self-Report
    gchexsStatus: {
      type: String,
      enum: ['yes', 'no', 'not_set'],
      default: 'not_set',
    },
    gchexsDocumentUrl: { type: String },
    gchexsDocumentFileId: { type: String },
    gchexsUpdatedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export const ProfessionalInfo = model<any>(
  'ProfessionalInformation',
  ProfessionalInfoSchema
);
