import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import ApiError from '../../../errors/ApiError';
import sendResponse from '../../../shared/sendResponse';
import httpStatus from 'http-status';
import { DocumentService } from './document.service';
import { DownloadService, fileTypeFromUrl } from './download.service';
import { extractCredential } from './credential-ai.service';
import { decideAllForUser, autoDecideOnUpload } from './credential-ai.decide';
import { getAiSettings, updateAiSettings } from './credential-ai.settings';

const uploadDocument = catchAsync(async (req: Request, res: Response) => {
  const file = req.file;
  const userId = req.user?._id;
  // SCRUM-165: `part` says which half of the PCA certificate this file is
  // (written exam or RN/LPN practical sign-off). It was not read here, so a
  // sign-off landed as a plain second certificate row.
  // SCRUM-177: `consentVersion` is the version of the medical-consent wording
  // the caregiver ticked, posted alongside `consent`. Read here or the service
  // never sees it and the consent record has nothing to point at.
  const {
    category,
    documentType,
    title,
    isPublic,
    consent,
    consentVersion,
    documentId,
    part,
  } = req.body;

  const result = await DocumentService.uploadDocument(
    file,
    {
      category,
      documentType,
      title,
      isPublic: isPublic === 'true' || isPublic === true,
      consent: consent === 'true' || consent === true,
      consentVersion,
      user: userId as string,
      part,
    },
    documentId as string,
    userId as string
  );

  // When AI automation is switched on, the credential is read and decided here
  // rather than waiting for an admin to open it. Awaited, because a serverless
  // function stops executing the moment it responds — and swallowed inside, so
  // it can never turn a successful upload into an error for the caregiver.
  await autoDecideOnUpload(result?._id ? String(result._id) : undefined);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document uploaded successfully!',
    data: result,
  });
});

const getUserDocuments = catchAsync(async (req: Request, res: Response) => {
  const queryUserId = req.query.userId;
  const userId = queryUserId ? queryUserId : req.user?._id;

  // SCRUM-99: pass the requester so agencies are gated to their allowed tier.
  const result = await DocumentService.getUserDocuments(
    userId as string,
    req.user?._id as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Documents retrieved successfully!',
    data: result,
  });
});

const deleteDocument = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const { documentId } = req.params;

  const result = await DocumentService.deleteDocument(
    userId as string,
    documentId
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document deleted successfully!',
    data: result,
  });
});

const reviewDocument = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const {
    reviewStatus,
    credentialIdNumber,
    credentialIssueDate,
    credentialExpirationDate,
    issuingOrganization,
    rejectionReason,
    // SCRUM-109
    rejectionReasonCode,
    requestReplacement,
    aiSuggestedReason,
    adminAgreedWithAi,
    // SCRUM-109: confirm a credential that has no fixed renewal date. Dropped
    // here until now, so the service never saw it and the "expiry is required"
    // guard threw on every never-expiring credential — the checkbox, the model
    // field and the caregiver-facing "No official expiration date" copy all
    // existed but were unreachable.
    hasNoExpiration,
  } = req.body;

  const result = await DocumentService.reviewDocument(documentId, {
    reviewStatus,
    credentialIdNumber,
    credentialIssueDate,
    credentialExpirationDate,
    issuingOrganization,
    rejectionReason,
    rejectionReasonCode,
    requestReplacement,
    aiSuggestedReason,
    adminAgreedWithAi,
    hasNoExpiration,
    reviewedBy: (req as any).user?._id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Document ${reviewStatus} successfully!`,
    data: result,
  });
});

// Admin: read this credential with AI and pre-fill the confirmation form.
// Suggestion only — it writes nothing to reviewStatus.
const aiExtractCredential = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;

  // AI assist off means the admin asked not to be shown a suggestion at all.
  // Answered as a normal 200 with a flag, so the modal simply shows no panel
  // instead of an error the admin would have to dismiss.
  const settings = await getAiSettings();
  if (!settings.assistEnabled) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'AI assist is turned off',
      data: { disabled: true },
    });
    return;
  }

  const result = await extractCredential(documentId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document read successfully!',
    data: result,
  });
});

/**
 * Admin "Run AI check": read and decide every required credential this
 * caregiver has uploaded, in one go.
 */
const aiReviewUser = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const result = await decideAllForUser(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: result.ran ? 'Credentials checked' : result.reason || 'Nothing to check',
    data: result,
  });
});

const getCredentialAiSettings = catchAsync(async (_req: Request, res: Response) => {
  const result = await getAiSettings();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'AI settings retrieved',
    data: result,
  });
});

const updateCredentialAiSettings = catchAsync(async (req: Request, res: Response) => {
  const { assistEnabled, automationEnabled } = req.body || {};
  const result = await updateAiSettings(
    { assistEnabled, automationEnabled },
    req.user?._id as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'AI settings updated',
    data: result,
  });
});

const getCredentialStatus = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;
  // SCRUM-99 / SCRUM-119: pass the requester, so this view is gated to the
  // caller's tier and withholds the file url until the packet is paid for.
  const result = await DocumentService.getCredentialStatus(
    userId,
    req.user?._id as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Credential status retrieved successfully!',
    data: result,
  });
});

const removeCredential = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  // SCRUM-178: pass who removed it, for the audit row.
  const result = await DocumentService.removeCredential(
    documentId,
    req.user?._id as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Credential removed successfully!',
    data: result,
  });
});

// SCRUM-67: Download a single document
const downloadDocument = catchAsync(async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.downloadDocument(documentId, agencyId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Document download URL retrieved!',
    data: result,
  });
});

// SCRUM-119 (A10): one signed document from a paid packet.
const downloadSignedDocument = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId, itemId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.downloadSignedDocument(
    caregiverUserId,
    itemId,
    agencyId as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Signed document download URL retrieved!',
    data: result,
  });
});

// SCRUM-67: Get bulk download package info
// SCRUM-119: the locked/unlocked file list for the documents modal. Viewing is
// free, so this returns metadata for every file but a url only once paid.
const getPacketManifest = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.getPacketManifest(
    caregiverUserId,
    agencyId as string
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Packet manifest retrieved!',
    data: result,
  });
});

const getDownloadPackage = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.getDownloadPackage(caregiverUserId, agencyId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Download package retrieved!',
    data: result,
  });
});

// SCRUM-67: Request private document access
const requestPrivateAccess = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const agencyId = req.user?._id;

  const result = await DownloadService.requestPrivateAccess(agencyId as string, caregiverUserId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Private access requested!',
    data: result,
  });
});

// SCRUM-67: Grant or revoke private access (caregiver action)
const updatePrivateAccess = catchAsync(async (req: Request, res: Response) => {
  const { accessId } = req.params;
  const { action } = req.body; // 'grant' or 'revoke'
  const caregiverId = req.user?._id;

  const result = await DownloadService.updatePrivateAccess(accessId, caregiverId as string, action);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Private access ${action}ed successfully!`,
    data: result,
  });
});

// SCRUM-67: Get access requests for a caregiver
const getAccessRequests = catchAsync(async (req: Request, res: Response) => {
  const caregiverId = req.user?._id;

  const result = await DownloadService.getAccessRequests(caregiverId as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Access requests retrieved!',
    data: result,
  });
});

// SCRUM-67: Get download audit log (admin)
const getDownloadAuditLog = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;

  const result = await DownloadService.getDownloadAuditLog(caregiverUserId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Download audit log retrieved!',
    data: result,
  });
});

/**
 * SCRUM-119: the only file types the free view lets the browser render inline.
 * A PDF or a bitmap image cannot run script; SVG, HTML and XML can.
 */
const INLINE_VIEW_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/**
 * SCRUM-130 — stream the credential inline, so the agency can read it without
 * paying and without ever being handed the CDN link.
 */
const viewDocument = catchAsync(async (req: Request, res: Response) => {
  const doc: any = await DocumentService.viewDocument(
    req.params.documentId,
    (req as any).user?._id,
    // Forwarded by the Next proxy from the browser's Sec-Fetch-Dest. The
    // service uses it to tell the in-app preview from someone opening the
    // address in a tab of its own.
    String(req.headers['x-wevoro-fetch-dest'] || '')
  );

  const upstream = await fetch(doc.url as string);
  if (!upstream.ok) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Could not load this document right now. Please try again.'
    );
  }

  const ext = String(doc.url).split('?')[0].split('.').pop()?.toLowerCase() || 'pdf';
  const safeName = String(doc.title || doc.documentType || 'document').replace(
    /[^\w.-]+/g,
    '_'
  );
  // SCRUM-119: the file's real type. A PNG credential was served as
  // "application/png", which no browser can show inline, so the free in-app
  // preview downloaded the file instead of displaying it.
  //
  // Only a type on INLINE_VIEW_TYPES is ever sent, never the CDN's own answer
  // as-is: this response is rendered inline on the app's own origin (the Next
  // proxy passes it through), and uploads are not filtered by type, so a
  // credential named x.svg or x.html with a <script> inside would otherwise run
  // with the viewing agency's session. Anything else is sent as opaque bytes.
  const knownType = (
    fileTypeFromUrl(doc.url)?.mimeType ||
    String(upstream.headers.get('content-type') || '').split(';')[0]
  )
    .trim()
    .toLowerCase();
  const contentType = INLINE_VIEW_TYPES.has(knownType)
    ? knownType
    : 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  // The browser must not second-guess that type from the bytes.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // No script, no same-origin, whatever the file turns out to hold. Not on a
  // PDF: Chrome's PDF viewer does not load in a sandboxed document, which would
  // blank the free preview of every PDF credential, and a PDF cannot run script
  // on our origin anyway.
  if (contentType !== 'application/pdf') {
    res.setHeader('Content-Security-Policy', 'sandbox');
  }
  // inline, not attachment: this is the free read, not the paid download.
  res.setHeader('Content-Disposition', `inline; filename="${safeName}.${ext}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(await upstream.arrayBuffer()));
});

/** SCRUM-67: the whole package as a single zip, so every file actually lands. */
const getDownloadPackageZip = catchAsync(async (req: Request, res: Response) => {
  const { caregiverUserId } = req.params;
  const { buffer, fileName, count, credentialCount, signedCount } =
    await DownloadService.getDownloadPackageZip(
      caregiverUserId,
      (req as any).user?._id as string
    );

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  // SCRUM-67: every file in the ZIP, signed documents included. The toast reads
  // this instead of counting the credential list on the client.
  res.setHeader('X-Document-Count', String(count));
  res.setHeader('X-Credential-Count', String(credentialCount));
  res.setHeader('X-Signed-Count', String(signedCount));
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
});

export const DocumentController = {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
  reviewDocument,
  aiExtractCredential,
  aiReviewUser,
  getCredentialAiSettings,
  updateCredentialAiSettings,
  getCredentialStatus,
  removeCredential,
  downloadDocument,
  getDownloadPackage,
  getDownloadPackageZip,
  getPacketManifest,
  downloadSignedDocument,
  requestPrivateAccess,
  updatePrivateAccess,
  getAccessRequests,
  getDownloadAuditLog,
  viewDocument,
};
