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
// SCRUM-117/118: e-signature — packet creation on accept + branded offer email
import { startPacket } from '../esign/esign.service';
import { SigningDocument } from '../esign/esign.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { sendOfferReceivedEmail } from '../esign/esign-email.service';
import { sendEmail } from '../auth/sendMail';

const ADMIN_ROLES = ['admin', 'super_admin'];

/**
 * SCRUM-141: what each side may write through the generic offer endpoints
 * (PATCH /offer/update/:id, POST /offer). Both used to hand the raw request
 * body to Mongo, which let an agency forge the caregiver's consent: PATCH
 * {source:'onboard'} onto a scheduling-era offer that already carried a
 * submittedAt, PATCH {submittedAt} onto its own pending Onboard offer, PATCH
 * {partner} to take over another agency's submitted offer, or POST
 * {pro, source:'onboard', submittedAt} to create a "submitted" offer in one
 * call — each one unlocking checkout and download with no Respond.
 *
 * So these lists are allow-lists, and four fields are on none of them:
 * `source` (only onboardCaregiver writes 'onboard'), `submittedAt` (only
 * markOfferSubmitted writes it), and `partner` / `pro` (who the offer is
 * between never changes after it is created).
 */
const OFFER_UPDATE_RULES: Record<string, { fields: string[]; statuses: string[] }> = {
  // The caregiver: Accept, Not interested / Remove / Withdraw, with a note.
  pro: { fields: ['status', 'notes', 'isRemovedByPro'], statuses: ['accepted', 'rejected'] },
  // The agency: Confirm (legacy "onboarded"), and editing what it asked for.
  partner: {
    fields: ['status', 'notes', 'documentsNeeded', 'jobLink'],
    statuses: ['onboarded'],
  },
};
// What the agency's offer form (offer-request-modal) sends; status is not one
// of them — a new offer always starts 'pending'.
const OFFER_FORM_FIELDS = ['jobLink', 'documentsNeeded', 'notes'];

const pickOfferFields = (payload: any, fields: string[]): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const key of fields) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined) {
      picked[key] = payload[key];
    }
  }
  return picked;
};

/**
 * Only the offer's own agency or caregiver (or an admin) may act on it. None of
 * the generic offer endpoints checked this, so any signed-in agency or
 * caregiver could change any offer by its id.
 */
const assertOfferParty = (offer: any, user: Partial<IUser>) => {
  if (ADMIN_ROLES.includes(String(user.role))) return;
  const side =
    user.role === 'partner' ? offer?.partner : user.role === 'pro' ? offer?.pro : null;
  if (!side || String(side) !== String(user._id)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This offer is not yours');
  }
};

const createOrUpdateOffer = async (
  payload: any,
  user: Partial<IUser>
): Promise<any> => {
  console.log('🚀 ~ createOrUpdateOffer ~ payload:', payload);
  // SCRUM-141: only the form's own fields are written; the partner is always
  // the caller (see OFFER_UPDATE_RULES for why source/submittedAt never are).
  const fields = pickOfferFields(payload, OFFER_FORM_FIELDS);

  const isUpdate = !!payload?.offer;
  let result;

  // Check if `payload.offer` exists to differentiate between update and create
  if (isUpdate) {
    // Editing an offer is its own agency's business. This used to upsert by id
    // with no owner check and set partner to the caller, so any agency could
    // take over another agency's offer — and the caregiver's consent on it.
    const existing = await Offer.findById(payload.offer).select('partner');
    if (existing) assertOfferParty(existing, user);
    // $setOnInsert only applies if the offer no longer exists and is recreated.
    const onInsert: any = { partner: user._id };
    if (payload.pro) onInsert.pro = payload.pro;
    const update: any = { $setOnInsert: onInsert };
    if (Object.keys(fields).length) update.$set = fields;
    result = await Offer.findByIdAndUpdate(payload.offer, update, {
      new: true, // Return the updated document
      upsert: true, // Create a new document if it doesn't exist
      setDefaultsOnInsert: true, // Ensure default values are set
    }).populate('documentsNeeded.document');
  } else {
    // If no `offer` ID is provided, create a new document explicitly
    const newOffer = new Offer({ ...fields, partner: user._id, pro: payload.pro });
    result = await newOffer.save();
    await result.populate('documentsNeeded.document');
  }

  // Send notification to the Pro user — the offer's own caregiver, not
  // whatever `pro` an update request carried.
  const proId = result?.pro ?? payload.pro;
  try {
    // Get partner's company name
    const partnerInfo = await PersonalInfo.findOne({ user: user._id });
    const companyName = partnerInfo?.companyName || 'An agency';

    // Get pro user's email
    const proUser = await User.findById(proId);
    const proEmail = proUser?.email;

    // Create notification message
    const message = isUpdate
      ? `<p><span style="font-weight: 600; color: #008000;">${companyName}</span> has made some updates to their offer requirements. Please review the changes at your earliest convenience.</p>`
      : `<p>Great news! You have received a new offer from <span style="font-weight: 600; color: #008000;">${companyName}</span>. Check it out and respond promptly.</p>`;

    // Create notification in database
    const notification = await Notification.create({
      user: proId,
      message,
    });
    console.log(
      '🚀 ~ createOrUpdateOffer ~ notification:',
      notification,
      proEmail
    );

    // SCRUM-118: branded offer email, including how many documents the
    // caregiver's role would have to sign with this agency (0 hides the line).
    if (proEmail) {
      const proRole =
        (await ProfessionalInfo.findOne({ user: proId }).select('role'))?.role || 'CNA';
      const signCount = await SigningDocument.countDocuments({
        agency: user._id,
        role: proRole,
        status: 'active',
      });
      await sendOfferReceivedEmail({
        caregiverId: String(proId),
        agencyName: companyName,
        signCount,
      });
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
        source: 1,
        submittedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ]);

  // SCRUM-141: resolve when each offer was submitted (signed, or responded with
  // nothing to sign), so the caregiver's card can show "Submitted" with its
  // time instead of an action.
  if (result.length) {
    const { SignaturePacket } = await import('../esign/esign.model');
    const { resolveSubmittedAt } = await import('./onboarding.service');
    const packets = await SignaturePacket.find({
      offer: { $in: result.map((o: any) => o._id) },
    })
      .select('offer status completedAt updatedAt items.status')
      .lean();
    const byOffer = new Map<string, any>();
    packets.forEach((p: any) => byOffer.set(String(p.offer), p));
    for (const offer of result) {
      const packet = byOffer.get(String(offer._id));
      offer.submittedAt = resolveSubmittedAt(offer, packet);
      offer.signing = packet
        ? {
            status: packet.status,
            pendingCount: ((packet.items as any[]) ?? []).filter(
              (i) => i.status === 'pending'
            ).length,
          }
        : null;
    }
  }

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
          // Strip URL for denied documents to prevent unauthorized access
          url:
            docNeeded.status === 'denied'
              ? null
              : populatedDoc?.url || docNeeded.url || null,
          // Status is specific to the offer request, not the document
          status: docNeeded.status,
          // Full populated document for reference (strip URL if denied)
          document: populatedDoc
            ? docNeeded.status === 'denied'
              ? { ...populatedDoc, url: null }
              : populatedDoc
            : null,
        };
      });
    }
  }

  return result;
};

const deleteOffer = async (id: string, user: Partial<IUser>): Promise<any> => {
  // SCRUM-141: deleting an offer deletes the consent it carries. With no owner
  // check any agency could delete another agency's submitted Onboard offer by
  // its id and wipe that agency's signature gate — the same hole
  // assertOfferParty closed on update.
  const existing = await Offer.findById(id).select('partner pro');
  if (!existing) return existing;
  assertOfferParty(existing, user);
  const result = await Offer.findByIdAndDelete(id);
  return result;
};

const updateOffer = async (
  id: string,
  rawPayload: any,
  user: Partial<IUser>
): Promise<any> => {
  const existing = await Offer.findById(id).select('partner pro');
  if (!existing) return existing;
  assertOfferParty(existing, user);

  // SCRUM-141: each side writes only its own fields and statuses, never
  // source, submittedAt, partner or pro (see OFFER_UPDATE_RULES). An admin may
  // do what either side can, and no more.
  const isAdmin = ADMIN_ROLES.includes(String(user.role));
  const rules = isAdmin
    ? {
        fields: Array.from(
          new Set([...OFFER_UPDATE_RULES.pro.fields, ...OFFER_UPDATE_RULES.partner.fields])
        ),
        statuses: [...OFFER_UPDATE_RULES.pro.statuses, ...OFFER_UPDATE_RULES.partner.statuses],
      }
    : OFFER_UPDATE_RULES[String(user.role)];
  const payload: any = pickOfferFields(rawPayload, rules.fields);
  if (payload.status !== undefined && !rules.statuses.includes(payload.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `You cannot set this offer to '${payload.status}'`);
  }

  const result = Object.keys(payload).length
    ? await Offer.findByIdAndUpdate(id, { $set: payload }, { new: true })
    : await Offer.findById(id);

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
          ? `<p><strong>Caregiver's note:</strong> ${
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
      const companyName = userInfo?.companyName || 'The agency';
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
  // Only the pair on the offer may write on it — a note emails the other side.
  const existing = await Offer.findById(id).select('partner pro');
  if (!existing) return existing;
  assertOfferParty(existing, user);

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
      ? userInfo?.companyName || 'An agency'
      : `${userInfo?.firstName || ''} ${userInfo?.lastName || ''}`.trim() ||
        'A caregiver';

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

const uploadOfferDocuments = async (
  files: any,
  id: string,
  user: Partial<IUser>
): Promise<any> => {
  // SCRUM-141: only the caregiver the offer was sent to (or an admin) may
  // answer it. Checked before any file goes to the CDN.
  const owner = await Offer.findById(id).select('partner pro');
  if (!owner) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offer not found');
  }
  assertOfferParty(owner, user);

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
  // Granting or denying access is the offer's own caregiver's call.
  assertOfferParty(offer, user);

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
      : 'The caregiver';

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

// Pro responds to offer - handles both file uploads and access status updates atomically
const proRespondToOffer = async (
  offerId: string,
  files: any[],
  statusUpdates: { documentId: string; status: 'granted' | 'denied' }[],
  user: Partial<IUser>
): Promise<any> => {
  const offer = await Offer.findById(offerId);
  if (!offer) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Offer not found');
  }
  // Only the caregiver the offer was sent to can answer it. Nothing checked
  // this, so any signed-in caregiver could respond to someone else's offer —
  // and since SCRUM-141 a response is what lets an agency buy the credentials.
  if (!['admin', 'super_admin'].includes(String(user.role)) && String(offer.pro) !== String(user._id)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This offer was not sent to you');
  }
  if (offer.status === 'rejected') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You declined this offer');
  }

  const uploadedDocs: string[] = [];
  const grantedDocs: string[] = [];
  const deniedDocs: string[] = [];

  // 1. Handle file uploads for missing documents
  if (files && files.length > 0) {
    const fileMap: Record<string, string> = {};
    for (const file of files) {
      const bunnyUrl = await uploadFile(file);
      fileMap[file.originalname] = bunnyUrl;
    }

    // Update documents with uploaded files
    offer.documentsNeeded = offer.documentsNeeded.map((doc: any) => {
      if (fileMap[doc._id.toString()]) {
        uploadedDocs.push(doc.title);
        return {
          ...doc.toObject(),
          url: fileMap[doc._id.toString()],
          status: 'granted',
        };
      }
      return doc;
    });
  }

  // 2. Handle access status updates for existing documents
  if (statusUpdates && statusUpdates.length > 0) {
    for (const { documentId, status } of statusUpdates) {
      const docIndex = offer.documentsNeeded.findIndex(
        (doc: any) => doc._id.toString() === documentId
      );

      if (docIndex !== -1) {
        offer.documentsNeeded[docIndex].status = status;
        const docTitle = offer.documentsNeeded[docIndex].title;
        if (status === 'granted') {
          grantedDocs.push(docTitle);
        } else {
          deniedDocs.push(docTitle);
        }
      }
    }
  }

  // 3. Update offer status to 'responded'
  if (offer.status === 'pending') {
    offer.status = 'responded';
  }

  // 4. Save all changes atomically
  await offer.save();

  // SCRUM-118: Step 1 of the accept flow is complete — snapshot the signature
  // packet for this caregiver's role (no-op when the agency has no signing
  // documents; idempotent when the packet already exists). Server-side so a
  // closed browser between Step 1 and Step 2 still starts the reminder clock.
  let packet: any = null;
  let packetFailed = false;
  try {
    packet = await startPacket({
      offerId: String(offer._id),
      agencyId: String(offer.partner),
      caregiverId: String(offer.pro),
    });
  } catch (e) {
    packetFailed = true;
    console.error('[esign] packet creation failed for offer', String(offer._id), e);
  }

  // SCRUM-141: with nothing to sign, responding IS submitting — mark it and
  // tell the agency. With documents to sign, that happens when the last one is
  // signed (esign.service signItem). A packet that failed to start is not a
  // response: the caregiver has to be able to sign before it counts. Only an
  // onboard offer is marked — markOfferSubmitted ignores a scheduling-era job
  // offer, which is not consent to release the package.
  if (!packetFailed && (!packet || packet.status === 'completed')) {
    const { markOfferSubmitted } = await import('./onboarding.service');
    await markOfferSubmitted({ offerId: String(offer._id) });
  }

  // 5. Send consolidated notification to partner
  try {
    const proInfo = await PersonalInfo.findOne({ user: user._id });
    const proName = proInfo
      ? `${proInfo.firstName} ${proInfo.lastName}`
      : 'The caregiver';

    const partner = await User.findById(offer.partner);

    // Build notification message
    const actions: string[] = [];
    if (uploadedDocs.length > 0) {
      actions.push(
        `uploaded ${uploadedDocs.length} document(s): ${uploadedDocs.join(
          ', '
        )}`
      );
    }
    if (grantedDocs.length > 0) {
      actions.push(`granted access to: ${grantedDocs.join(', ')}`);
    }
    if (deniedDocs.length > 0) {
      actions.push(`denied access to: ${deniedDocs.join(', ')}`);
    }

    if (actions.length > 0) {
      const message = `<p><span style="font-weight: 600; color: #008000;">${proName}</span> has responded to your offer: ${actions.join(
        '; '
      )}.</p>`;

      await Notification.create({
        user: offer.partner,
        message,
      });

      if (partner?.email) {
        await sendEmail(
          partner.email,
          'Caregiver Responded to Your Offer',
          `<div>${message}<p>Thank you</p></div>`
        );
      }
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
  proRespondToOffer,
};
