/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const DocumentsSchema = new Schema<any>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    category: {
      type: String,
    },
    documentType: {
      type: String,
    },
    title: {
      type: String,
    },
    privacy: {
      type: String,
      enum: ['protected', 'private'],
      default: 'private',
    },
    url: {
      type: String,
    },
    consent: {
      type: Boolean,
    },
  },
  {
    timestamps: true,
  }
);

export const Documents = model<any>('Documents', DocumentsSchema);
