/**
 * SCRUM-176 — READ-ONLY audit: which caregivers have more than one file on the
 * same required credential, and which approved rows carry a title that does not
 * look like the credential they are filed under.
 *
 * SCRUM-176 reported one caregiver whose credential opened the wrong file. The
 * view path itself is correct (Documents.findById -> that row's own url); what
 * diverges is credential RESOLUTION — the admin screen takes the first matching
 * row, six other builders take the last, and until now no query said which
 * order it wanted. That only matters where a caregiver has more than one row of
 * the same type, so this lists exactly those.
 *
 *   bun scripts/audit-credential-files.ts
 *
 * It only reads. No writes, no deletes, no repairs — the point is to see the
 * size of the problem before anyone decides what to do about it. Run it against
 * QA; it connects to whatever DATABASE_URL is in .env, so check that first.
 */
/* eslint-disable no-console */
import mongoose from 'mongoose';
import config from '../src/config';
import { Documents } from '../src/app/modules/document/documents.model';
import { User } from '../src/app/modules/user/user.model';
import { PersonalInfo } from '../src/app/modules/user/personal-info.model';
import { REQUIRED_CREDENTIAL_KEYS } from '../src/constants/credentials';

/**
 * Words that should appear in the title of a document filed under each
 * credential type. A title with none of them is not necessarily wrong — a
 * caregiver may name a file anything — so a hit here is a "look at this", not a
 * verdict.
 */
const TITLE_HINTS: Record<string, string[]> = {
  certifications: ['cert', 'cna', 'pca', 'nurse', 'aide', 'exam', 'sign', 'training'],
  cpr_test: ['cpr', 'bls', 'resus', 'first aid', 'aed'],
  tb_tests: ['tb', 'tuberc', 'ppd', 'mantoux', 'quantiferon', 'chest', 'x-ray', 'xray'],
  driver_license: ['driver', 'licence', 'license', 'dl', 'id card', 'state id'],
  auto_insurance: ['insur', 'auto', 'vehicle', 'car', 'policy', 'coverage'],
  gchexs: ['gchex', 'background', 'bgc', 'check', 'registry'],
};

const looksUnrelated = (documentType: string, title?: string | null): boolean => {
  const hints = TITLE_HINTS[documentType];
  if (!hints) return false;
  const t = String(title || '').toLowerCase().trim();
  if (!t) return false;
  return !hints.some((h) => t.includes(h));
};

const fmt = (d?: Date | null): string =>
  d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '—';

(async () => {
  await mongoose.connect(config.database_url as string);
  console.log('Connected. READ-ONLY audit — nothing is written.\n');

  // Every caregiver account, then their documents. Chunked by user so the
  // report reads per caregiver and the working set stays small.
  const caregivers = await User.find({ role: 'pro' }, { email: 1 }).lean();
  console.log(`Caregivers: ${caregivers.length}\n`);

  const watchedTypes = [
    ...(REQUIRED_CREDENTIAL_KEYS as readonly string[]),
    'gchexs',
  ];

  let duplicateCaregivers = 0;
  let duplicateGroups = 0;
  let duplicateRows = 0;
  let oddTitles = 0;

  for (const caregiver of caregivers) {
    const docs = await Documents.find({ user: caregiver._id })
      .sort({ createdAt: 1 })
      .lean();
    if (!docs.length) continue;

    const info: any = await PersonalInfo.findOne({ user: caregiver._id })
      .select('firstName lastName')
      .lean();
    const name =
      `${info?.firstName || ''} ${info?.lastName || ''}`.trim() ||
      (caregiver as any).email ||
      String(caregiver._id);

    const lines: string[] = [];

    // 1. More than one row on the same required credential type.
    for (const type of watchedTypes) {
      const rows = docs.filter((d: any) => d.documentType === type);
      if (rows.length < 2) continue;
      duplicateGroups += 1;
      duplicateRows += rows.length;
      lines.push(`  ${type} — ${rows.length} rows:`);
      rows.forEach((d: any) => {
        lines.push(
          `    _id=${d._id} status=${d.reviewStatus || '—'} part=${d.part || '—'} created=${fmt(
            d.createdAt
          )}`
        );
        lines.push(`      title: ${d.title || '(no title)'}`);
        lines.push(`      url:   ${d.url || '(no file)'}`);
      });
    }

    // 2. An APPROVED row whose title does not look like its documentType.
    //    An agency has been told this one is confirmed, so a mis-filed file
    //    here is the case SCRUM-176 is about.
    for (const d of docs as any[]) {
      if (d.reviewStatus !== 'approved') continue;
      if (!looksUnrelated(d.documentType, d.title)) continue;
      oddTitles += 1;
      lines.push(
        `  title does not match type — ${d.documentType}: "${d.title}" (_id=${d._id}, created=${fmt(
          d.createdAt
        )})`
      );
    }

    if (lines.length) {
      duplicateCaregivers += 1;
      console.log(`${name}  [${caregiver._id}]`);
      lines.forEach((l) => console.log(l));
      console.log('');
    }
  }

  console.log('--- summary ---');
  console.log(`Caregivers with something to look at : ${duplicateCaregivers}`);
  console.log(`Credential types with >1 row         : ${duplicateGroups}`);
  console.log(`Document rows in those groups        : ${duplicateRows}`);
  console.log(`Approved rows with an odd title      : ${oddTitles}`);
  console.log('\nNothing was changed.');

  await mongoose.disconnect();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
