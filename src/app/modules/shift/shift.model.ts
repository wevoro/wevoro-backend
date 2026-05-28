/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const ShiftSchema = new Schema<any>(
  {
    partner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    numberOfCaregivers: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    positions: [
      {
        type: String,
        required: true,
        enum: ['CNA', 'PCA'],
      },
    ],
    startingDate: {
      type: Date,
      required: true,
    },
    shiftDays: [
      {
        type: String,
        required: true,
        enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      },
    ],
    startingTime: {
      type: String,
      required: true,
    },
    endingTime: {
      type: String,
      required: true,
    },
    shiftLength: {
      type: Number,
    },
    shiftType: {
      type: String,
      enum: ['Day Shift', 'Night Shift'],
    },
    hourRate: {
      type: Number,
      required: true,
      min: 0,
    },
    isNegotiable: {
      type: Boolean,
      default: false,
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true },
    },
    documentsNeeded: [
      {
        title: { type: String, required: true },
        isPreset: { type: Boolean, default: false },
        isSelected: { type: Boolean, default: false },
      },
    ],
    notes: {
      type: String,
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['pending', 'upcoming', 'active', 'completed', 'removed'],
      default: 'pending',
    },
    assignedCaregivers: [
      {
        caregiver: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'declined'],
          default: 'pending',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const Shift = model<any>('Shift', ShiftSchema);
