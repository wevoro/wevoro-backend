/**
 * SCRUM-177 — move every document still flagged private to visible.
 *
 * The caregiver no longer chooses public/private on upload, so the flag stops
 * gating anything: new documents are written 'public'
 * (document.service#uploadDocument) and the schema default flips to match
 * (documents.model.ts). This brings the rows that were created before that over
 * with them, so the old uploads do not read as "Private" on a card while every
 * new one reads as visible.
 *
 * DRY RUN BY DEFAULT — it counts and prints, and writes nothing:
 *
 *   bun scripts/migrate-document-privacy.ts             # dry run
 *   bun scripts/migrate-document-privacy.ts --apply     # actually write
 *
 * It connects to whatever DATABASE_URL is in .env. CHECK THAT FIRST — this is
 * for QA. Never point it at production.
 */
/* eslint-disable no-console */
import mongoose from 'mongoose';
import config from '../src/config';
import { Documents } from '../src/app/modules/document/documents.model';

const APPLY = process.argv.includes('--apply');

/**
 * Anything that is not already 'public': the explicit 'private' rows, and any
 * row with no privacy at all (created before the field existed), which the old
 * default read as private.
 */
const FILTER = { privacy: { $ne: 'public' } };

(async () => {
  await mongoose.connect(config.database_url as string);

  // Say which database, so a wrong .env is visible before anything is written.
  const db = mongoose.connection.name;
  console.log(`Database: ${db}`);
  console.log(APPLY ? 'Mode: APPLY (will write)\n' : 'Mode: DRY RUN (no writes)\n');

  const total = await Documents.countDocuments({});
  const toChange = await Documents.countDocuments(FILTER);

  // Break it down, so the number can be recognised rather than just trusted.
  const byPrivacy = await Documents.aggregate([
    { $group: { _id: '$privacy', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log(`Documents in total            : ${total}`);
  byPrivacy.forEach((r: any) =>
    console.log(`  privacy=${r._id === null ? '(unset)' : r._id} : ${r.count}`)
  );
  console.log(`\nRows this would change        : ${toChange}`);

  if (toChange === 0) {
    console.log('\nNothing to do.');
    await mongoose.disconnect();
    return;
  }

  // A short sample, so the rows can be checked before they are touched.
  const sample = await Documents.find(FILTER)
    .select('_id user documentType title privacy createdAt')
    .sort({ createdAt: 1 })
    .limit(10)
    .lean();
  console.log('\nFirst rows:');
  sample.forEach((d: any) =>
    console.log(
      `  _id=${d._id} user=${d.user} type=${d.documentType || '—'} privacy=${
        d.privacy === undefined ? '(unset)' : d.privacy
      } title="${d.title || ''}"`
    )
  );

  if (!APPLY) {
    console.log(
      `\nDRY RUN — nothing was written. Re-run with --apply to set these ${toChange} rows to 'public'.`
    );
    await mongoose.disconnect();
    return;
  }

  const res = await Documents.updateMany(FILTER, { $set: { privacy: 'public' } });
  console.log(`\nUpdated ${res.modifiedCount} of ${toChange} rows to privacy='public'.`);

  const left = await Documents.countDocuments(FILTER);
  console.log(`Rows still not 'public'       : ${left}`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
