import mongoose from 'mongoose';
import { IUser } from '../user/user.interface';
import { Offer } from './offer.model';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';
import { uploadFile } from '../../../helpers/bunny-upload';
import { Documents } from '../document/documents.model';
import { Notification } from '../user/notification.model';
import { User } from '../user/user.model';
import { PersonalInfo } from '../user/personal-info.model';
import { sendEmail } from '../auth/sendMail';

const createOrUpdateOffer = async (
  payload: any,
  user: Partial<IUser>
): Promise<any> => {
  // Ensure the payload has the partner ID
  payload.partner = user._id;
  console.log('🚀 ~ createOrUpdateOffer ~ payload:', payload);

  const isUpdate = !!payload?.offer;
  let result;

  // Check if `payload.offer` exists to differentiate between update and create
  if (isUpdate) {
    // Try updating the document
    result = await Offer.findByIdAndUpdate(payload.offer, payload, {
      new: true, // Return the updated document
      upsert: true, // Create a new document if it doesn't exist
      setDefaultsOnInsert: true, // Ensure default values are set
    });
  } else {
    // If no `offer` ID is provided, create a new document explicitly
    const newOffer = new Offer(payload);
    result = await newOffer.save();
  }

  // Send notification to the Pro user
  try {
    // Get partner's company name
    const partnerInfo = await PersonalInfo.findOne({ user: user._id });
    const companyName = partnerInfo?.companyName || 'A partner';

    // Get pro user's email
    const proUser = await User.findById(payload.pro);
    const proEmail = proUser?.email;

    // Create notification message
    const message = isUpdate
      ? `<p><span style="font-weight: 600; color: #008000;">${companyName}</span> has made some updates to their offer requirements. Please review the changes at your earliest convenience.</p>`
      : `<p>Great news! You have received a new offer from <span style="font-weight: 600; color: #008000;">${companyName}</span>. Check it out and respond promptly.</p>`;

    // Create notification in database
    const notification = await Notification.create({
      user: payload.pro,
      message,
    });
    console.log(
      '🚀 ~ createOrUpdateOffer ~ notification:',
      notification,
      proEmail
    );

    // Send email notification
    if (proEmail) {
      await sendEmail(
        proEmail,
        isUpdate ? 'Offer Updated' : 'New Offer Received',
        `<div>${message}<p>Thank you</p></div>`
      );
    }
  } catch (error) {
    // Log error but don't fail the request
    console.error('Failed to send notification:', error);
  }

  return result;
};

const getOffers = async (user: Partial<IUser>): Promise<any> => {
  const result = await Offer.aggregate([
    {
      $match: {
        [user.role as string]: new mongoose.Types.ObjectId(user._id),
        ...(user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {}),
      },
    },
    // Lookup pro user with their info
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
            },
          },
        ],
      },
    },
    // Lookup partner user with their info
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
    // Sort by newest first
    { $sort: { createdAt: -1 } },
    // Final projection
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

  // Post-process: Populate document references in documentsNeeded
  // OPTIMIZED: Single batch query for all documents across all offers

  // Step 1: Collect ALL document IDs from ALL offers
  const allDocumentIds: string[] = [];
  for (const offer of result) {
    if (offer.documentsNeeded && offer.documentsNeeded.length > 0) {
      for (const doc of offer.documentsNeeded) {
        if (doc.document) {
          allDocumentIds.push(doc.document.toString());
        }
      }
    }
  }

  // Step 2: Fetch ALL documents in ONE query
  let documentMap = new Map<string, any>();
  if (allDocumentIds.length > 0) {
    const uniqueIds = [...new Set(allDocumentIds)]; // Remove duplicates
    const documents = await Documents.find({
      _id: { $in: uniqueIds },
    }).lean();

    documentMap = new Map(
      documents.map((doc: any) => [doc._id.toString(), doc])
    );
  }

  // Step 3: Map populated documents back to each offer
  for (const offer of result) {
    if (offer.documentsNeeded && offer.documentsNeeded.length > 0) {
      offer.documentsNeeded = offer.documentsNeeded.map((docNeeded: any) => {
        const populatedDoc = docNeeded.document
          ? documentMap.get(docNeeded.document.toString())
          : null;

        return {
          _id: docNeeded._id,
          // Use populated data first (current), fallback to stored data (may be stale)
          title: populatedDoc?.title || docNeeded.title,
          category: populatedDoc?.category || docNeeded.category,
          privacy: populatedDoc?.privacy || docNeeded.privacy,
          documentType:
            populatedDoc?.documentType || docNeeded.documentType || null,
          url: populatedDoc?.url || docNeeded.url || null,
          // Status is specific to the offer request, not the document
          status: docNeeded.status,
          // Full populated document for reference
          document: populatedDoc || null,
        };
      });
    }
  }

  return result;
};

const deleteOffer = async (id: string): Promise<any> => {
  const result = await Offer.findByIdAndDelete(id);
  return result;
};

const updateOffer = async (
  id: string,
  payload: any,
  user: Partial<IUser>
): Promise<any> => {
  const result = await Offer.findByIdAndUpdate(id, payload, { new: true });

  if (!result) return result;

  // Send notifications based on status change
  try {
    const userInfo = await PersonalInfo.findOne({ user: user._id });
    const userName = userInfo
      ? `${userInfo.firstName} ${userInfo.lastName}`
      : userInfo?.companyName || 'Someone';

    // Pro accepting/rejecting offer - notify Partner
    if (payload.status === 'accepted' || payload.status === 'rejected') {
      const partner = await User.findById(result.partner);
      const partnerEmail = partner?.email;

      // Include notes if provided
      const notesText =
        payload.notes?.length > 0
          ? `<p><strong>Pro's note:</strong> ${
              payload.notes[payload.notes.length - 1]?.note || ''
            }</p>`
          : '';

      const message = `<p>Your offer has been <strong>${
        payload.status
      }</strong> by <span style="font-weight: 600; color: ${
        payload.status === 'accepted' ? '#008000' : '#dc2626'
      };">${userName}</span>.</p>${notesText}`;

      await Notification.create({
        user: result.partner,
        message,
      });

      if (partnerEmail) {
        await sendEmail(
          partnerEmail,
          `Offer ${payload.status === 'accepted' ? 'Accepted' : 'Rejected'}`,
          `<div>${message}<p>Thank you</p></div>`
        );
      }
    }

    // Partner confirming onboarding - notify Pro
    if (payload.status === 'onboarded') {
      const companyName = userInfo?.companyName || 'The partner';
      const proUser = await User.findById(result.pro);
      const proEmail = proUser?.email;

      const message = `<p>Your response has been onboarded by <span style="font-weight: 600; color: #008000;">${companyName}</span></p>`;

      await Notification.create({
        user: result.pro,
        message,
      });

      if (proEmail) {
        await sendEmail(
          proEmail,
          'Offer Confirmed',
          `<div>${message}<p>Thank you</p></div>`
        );
      }
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }

  return result;
};

const updateOfferNotes = async (
  id: string,
  payload: any,
  user: Partial<IUser>
): Promise<any> => {
  const result = await Offer.findByIdAndUpdate(
    id,
    { $push: { notes: payload } },
    { new: true }
  );

  if (!result) return result;

  // Send notification to the other party
  try {
    const userInfo = await PersonalInfo.findOne({ user: user._id });
    const isPartner = user.role === 'partner';

    // Determine recipient and message
    const recipientId = isPartner ? result.pro : result.partner;
    const senderName = isPartner
      ? userInfo?.companyName || 'A partner'
      : `${userInfo?.firstName || ''} ${userInfo?.lastName || ''}`.trim() ||
        'A pro';

    const message = `<p><span style="font-weight: 600; color: #008000;">${senderName}</span> has added a note to your offer.</p>`;

    // Get recipient email
    const recipient = await User.findById(recipientId);
    const recipientEmail = recipient?.email;

    // Create notification
    await Notification.create({
      user: recipientId,
      message,
    });

    // Send email
    if (recipientEmail) {
      await sendEmail(
        recipientEmail,
        'New Note on Your Offer',
        `<div>${message}<p>Thank you</p></div>`
      );
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }

  return result;
};

const uploadOfferDocuments = async (files: any, id: string): Promise<any> => {
  const fileMap: any = {};
  if (files.length > 0) {
    for (const file of files) {
      const bunnyUrl = await uploadFile(file);
      fileMap[file.originalname] = bunnyUrl;
    }
  }

  const offer = await Offer.findById(id);
  if (!offer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offer not found');
  }

  const documentsNeeded = offer.documentsNeeded;

  const documents = documentsNeeded.map((document: any) => {
    if (fileMap[document._id]) {
      return { ...document, url: fileMap[document._id], status: 'granted' };
    }
    return document;
  });

  offer.documentsNeeded = documents;
  offer.status = 'responded';
  await offer.save();
  return offer;
};

// Update status of a specific document in an offer (grant/deny access)
const updateDocumentStatus = async (
  offerId: string,
  documentId: string,
  status: 'granted' | 'denied',
  user: Partial<IUser>
): Promise<any> => {
  const offer = await Offer.findById(offerId);
  if (!offer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offer not found');
  }

  // Find the document in documentsNeeded array and update its status
  const docIndex = offer.documentsNeeded.findIndex(
    (doc: any) => doc._id.toString() === documentId
  );

  if (docIndex === -1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Document not found in offer');
  }

  // Update the document status
  offer.documentsNeeded[docIndex].status = status;

  // Set status to 'responded' immediately when pro takes any action
  if (offer.status === 'pending') {
    offer.status = 'responded';
  }

  await offer.save();

  // Send notification to partner
  try {
    const proInfo = await PersonalInfo.findOne({ user: user._id });
    const proName = proInfo
      ? `${proInfo.firstName} ${proInfo.lastName}`
      : 'The pro';

    const docTitle = offer.documentsNeeded[docIndex].title;
    const partner = await User.findById(offer.partner);

    const message =
      status === 'granted'
        ? `<p><span style="font-weight: 600; color: #008000;">${proName}</span> has granted access to "${docTitle}".</p>`
        : `<p><span style="font-weight: 600; color: #dc2626;">${proName}</span> has denied access to "${docTitle}".</p>`;

    await Notification.create({
      user: offer.partner,
      message,
    });

    if (partner?.email) {
      await sendEmail(
        partner.email,
        status === 'granted'
          ? 'Document Access Granted'
          : 'Document Access Denied',
        `<div>${message}<p>Thank you</p></div>`
      );
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }

  return offer;
};

export const OfferService = {
  createOrUpdateOffer,
  getOffers,
  deleteOffer,
  updateOffer,
  updateOfferNotes,
  uploadOfferDocuments,
  updateDocumentStatus,
};
