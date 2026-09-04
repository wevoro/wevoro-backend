"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPackage = exports.stampAndStore = exports.buildSignedPdf = void 0;
const axios_1 = __importDefault(require("axios"));
const jszip_1 = __importDefault(require("jszip"));
const crypto_1 = __importDefault(require("crypto"));
const pdf_lib_1 = require("pdf-lib");
const config_1 = __importDefault(require("../../../config"));
/**
 * SCRUM-118: turning a signature into a document the agency can actually hold.
 *
 * Recording the signature in the database is not enough — nobody can hand a
 * mongo row to an auditor. This burns the caregiver's hand-drawn signature and
 * the WeVoro mark onto the original PDF, appends a certificate page carrying
 * the audit trail, and packages the finished set as a ZIP.
 *
 * Everything runs in memory; the results go to the same Bunny CDN the rest of
 * the platform uses.
 */
const GREEN = (0, pdf_lib_1.rgb)(0, 0.502, 0);
const INK = (0, pdf_lib_1.rgb)(0.11, 0.11, 0.11);
const MUTED = (0, pdf_lib_1.rgb)(0.37, 0.41, 0.39);
const cdnBase = () => {
    const base = String(config_1.default.bunny.cdn_url || '').replace(/\/+$/, '');
    return base.startsWith('http') ? base : `https://${base}`;
};
/** Push bytes to the CDN and return the public URL. */
const upload = (fileName, bytes, contentType) => __awaiter(void 0, void 0, void 0, function* () {
    const unique = `esign/${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}-${fileName}`;
    yield axios_1.default.put(`https://storage.bunnycdn.com/${config_1.default.bunny.storage_zone}/${unique}`, bytes, { headers: { AccessKey: config_1.default.bunny.api_key, 'Content-Type': contentType } });
    return `${cdnBase()}/${unique}`;
});
const fetchBytes = (url) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield axios_1.default.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    return Buffer.from(res.data);
});
const safeName = (s) => String(s || 'document').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_') || 'document';
/**
 * Stamp one document and return the signed bytes plus the hash of the original,
 * so the certificate can prove which version was signed.
 */
const buildSignedPdf = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const original = yield fetchBytes(input.fileUrl);
    const sourceHash = crypto_1.default.createHash('sha256').update(original).digest('hex');
    const pdf = yield pdf_lib_1.PDFDocument.load(original, { ignoreEncryption: true });
    const helv = yield pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const helvBold = yield pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    // --- the signature block, stamped at the foot of the last page ---
    const pages = pdf.getPages();
    const last = pages[pages.length - 1];
    const { width } = last.getSize();
    const boxW = 260;
    const boxH = 92;
    const boxX = 56;
    const boxY = 48;
    last.drawRectangle({
        x: boxX, y: boxY, width: boxW, height: boxH,
        borderColor: GREEN, borderWidth: 1.2,
        color: (0, pdf_lib_1.rgb)(0.945, 0.984, 0.957),
    });
    // The caregiver's own drawing is the mark. It sits in the middle of the block
    // between "Signed by" and the WeVoro line; the name, time and id are metadata
    // underneath rather than the signature itself.
    last.drawText('Signed by', { x: boxX + 12, y: boxY + boxH - 16, size: 7, font: helv, color: MUTED });
    let drewSignature = false;
    if ((_a = input.signatureImage) === null || _a === void 0 ? void 0 : _a.startsWith('data:image')) {
        try {
            const b64 = input.signatureImage.split(',')[1] || '';
            const png = yield pdf.embedPng(Buffer.from(b64, 'base64'));
            const maxW = boxW - 24;
            const maxH = 34;
            const scale = Math.min(maxW / png.width, maxH / png.height, 1);
            last.drawImage(png, {
                x: boxX + 12,
                y: boxY + 34,
                width: png.width * scale,
                height: png.height * scale,
            });
            drewSignature = true;
        }
        catch (_b) {
            // A malformed drawing must not stop the document being produced.
        }
    }
    if (!drewSignature) {
        // No drawing on file: fall back to the name so the block is never blank.
        last.drawText(input.signerName, {
            x: boxX + 12, y: boxY + 44, size: 12, font: helvBold, color: GREEN,
        });
    }
    last.drawText(`${input.signerName}  ·  WeVoro`, {
        x: boxX + 12, y: boxY + 22, size: 8, font: helvBold, color: GREEN,
    });
    last.drawText(input.signedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC', {
        x: boxX + 12, y: boxY + 12, size: 6.5, font: helv, color: MUTED,
    });
    last.drawText(`Signature ID ${input.stampId}`, {
        x: boxX + 130, y: boxY + 12, size: 6.5, font: helv, color: MUTED,
    });
    // --- certificate of completion ---
    const cert = pdf.addPage([width, 792]);
    let y = 720;
    const line = (text, size = 10, font = helv, color = INK, gap = 18) => {
        cert.drawText(text, { x: 56, y, size, font, color });
        y -= gap;
    };
    line('Certificate of Completion', 18, helvBold, INK, 30);
    line('This page is generated by WeVoro and records how the document above was signed.', 9, helv, MUTED, 28);
    const rows = [
        ['Document', input.title],
        ['Signed by', input.signerName],
        ['Signature ID', input.stampId],
        ['Signed at', `${input.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`],
        ['Sent by', input.agencyName],
        ['IP address', input.ip || 'not recorded'],
        ['Browser', (input.userAgent || 'not recorded').slice(0, 90)],
        ['Document hash', `sha256:${sourceHash}`],
    ];
    for (const [label, value] of rows) {
        cert.drawText(label.toUpperCase(), { x: 56, y, size: 7, font: helvBold, color: MUTED });
        y -= 13;
        cert.drawText(value, { x: 56, y, size: 10, font: helv, color: INK });
        y -= 22;
    }
    y -= 6;
    cert.drawText('The hash identifies the exact version of the document that was signed.', { x: 56, y, size: 8, font: helv, color: MUTED });
    return { bytes: Buffer.from(yield pdf.save()), sourceHash };
});
exports.buildSignedPdf = buildSignedPdf;
/** Stamp and store one document, returning its public URL. */
const stampAndStore = (input) => __awaiter(void 0, void 0, void 0, function* () {
    const { bytes } = yield (0, exports.buildSignedPdf)(input);
    return upload(`${safeName(input.title)}-signed.pdf`, bytes, 'application/pdf');
});
exports.stampAndStore = stampAndStore;
/**
 * Bundle every signed document into one ZIP and store it. Returned as both a
 * URL (for the agency's account) and bytes (to attach to the email), so the
 * documents are only built once.
 */
const buildPackage = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const zip = new jszip_1.default();
    for (const f of params.files) {
        try {
            zip.file(`${safeName(f.title)}.pdf`, yield fetchBytes(f.url));
        }
        catch (err) {
            console.error(`[esign] could not add ${f.title} to the package:`, err === null || err === void 0 ? void 0 : err.message);
        }
    }
    const bytes = yield zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const fileName = `${safeName(params.caregiverName)}-${params.role}-signed-documents.zip`;
    const url = yield upload(fileName, bytes, 'application/zip');
    return { url, bytes, fileName };
});
exports.buildPackage = buildPackage;
