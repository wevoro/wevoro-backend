/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const FeedbackSchema = new Schema<any>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    message: {
      type: String,
    },
    feedbackType: {
      type: String,
      enum: ['Feature request', 'Report a bug to fix', 'Others'],
      default: 'Others',
    },
    selections: {
      type: [String],
      default: [],
    },
    isReadByAdmin: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['New', 'Pending', 'Solved'],
      default: 'New',
    },
  },
  {
    timestamps: true,
  }
);

export const Feedback = model<any>('Feedback', FeedbackSchema);
