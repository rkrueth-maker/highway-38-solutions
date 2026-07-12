#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readJson,
  writeJson,
  hashFile,
  preservePstSource,
  indexExtractedEvidence,
  reviewPhotoRecord,
  compilePublicCaseStudies,
  validateToolManifest
} = require('../proof-system/lib/proof-evidence-core');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const passes = [];
const failures = [];
const check = (name, condition, detail = '') => (condition ? passes : failures).push({ name, detail });
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function expectThrow(name, fn, expected) {
  try {
    fn();
    failures.push({ name, detail: 'Expected an error but none was thrown.' });
  } catch (error) {
    check(name, !expected || String(error.message).includes(expected), error.message);
  }
}

async function run() {
  const required = [
    'proof-system/.gitignore',
    'proof-system/README.md',
    'proof-system/status.json',
    'proof-system/config/evidence-taxonomy.json',
    'proof-system/config/evidence-search-plan.json',
    'proof-system/config/case-study-registry.json',
    'proof-system/lib/proof-evidence-core.js',
    'proof-system/public/public-case-studies.json',
    'proof-system/public/tools-manifest.json',
    'proof-data.js',
    'proof.html',
    'proof.js',
    'free-tools.html',
    'tool-formulas.js',
    'downloads/README.md',
    'downloads/h38-vendor-quote-completeness.csv',
    'downloads/h38-project-scope-builder.csv',
    'downloads/h38-photo-privacy-review.csv',
    'scripts/process-private-proof-evidence.js'
  ];
  for (const file of required) check(`required artifact: ${file}`, exists(file));

  const taxonomy = readJson(path.join(ROOT, 'proof-system/config/evidence-taxonomy.json'));
  const searchPlan = readJson(path.join(ROOT, 'proof-system/config/evidence-search-plan.json'));
  const registry = readJson(path.join(ROOT, 'proof-system/config/case-study-registry.json'));
  const status = readJson(path.join(ROOT, 'proof-system/status.json'));
  const toolManifest = readJson(path.join(ROOT, 'proof-system/public/tools-manifest.json'));
  const committedPublic = readJson(path.join(ROOT, 'proof-system/public/public-case-studies.json'));

  check('five required proof classifications', taxonomy.allowedProofClassifications.length === 5);
  check('raw PST publication forbidden', taxonomy.publicationRules.rawMessagePublicationAllowed === false && taxonomy.publicationRules.rawAttachmentPublicationAllowed === false);
  check('uncorroborated quantity claims forbidden', taxonomy.publicationRules.uncorroboratedQuantityClaimsAllowed === false);
  check('search plan covers six evidence groups', searchPlan.groups.length === 6, String(searchPlan.groups.length));
  const searchText = JSON.stringify(searchPlan);
  for (const term of ['FeatureCAM','CADKEY','CKD','KeyCreator','Kubotek','Mastercam','CNC','Doosan','robot','blanking feeder','press','bar feed','automation','toolroom','quote','ROI','vision','macro','API']) {
    check(`search plan includes ${term}`, searchText.toLowerCase().includes(term.toLowerCase()));
  }
  check('former-employer search terms are private-only', searchPlan.groups.find(group => group.id === 'former-employer-discovery')?.privacyRule.includes('Never publish'));

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'h38-proof-work-'));
  const privateRoot = path.join(tempRoot, 'private-proof-work');
  fs.mkdirSync(privateRoot, { recursive: true });
  const sourcePst = path.join(privateRoot, 'backup.pst');
  const syntheticPst = Buffer.concat([
    Buffer.from('SYNTHETIC PST FIXTURE - NOT A REAL MAIL ARCHIVE\n'),
    Buffer.alloc(4096, 7)
  ]);
  fs.writeFileSync(sourcePst, syntheticPst);
  const sourceHashBefore = await hashFile(sourcePst);
  const sourceStatBefore = fs.statSync(sourcePst);
  const preserved = await preservePstSource({ sourceFile: sourcePst, workDir: path.join(privateRoot, 'evidence-work') });
  const sourceHashAfter = await hashFile(sourcePst);
  const sourceStatAfter = fs.statSync(sourcePst);
  check('original PST hash preserved', sourceHashBefore === sourceHashAfter && sourceHashBefore === preserved.sourceSha256);
  check('working copy hash matches original', preserved.workingCopySha256 === sourceHashBefore);
  check('original PST metadata preserved', sourceStatBefore.size === sourceStatAfter.size && sourceStatBefore.mtimeMs === sourceStatAfter.mtimeMs);
  check('working copy is read-only', (fs.statSync(preserved.workingCopy).mode & 0o222) === 0);
  expectThrow('non-private work directory rejected', () => {
    const core = require('../proof-system/lib/proof-evidence-core');
    core.indexExtractedEvidence({ extractedDir: path.join(tempRoot, 'public'), searchPlan, sourceHash: sourceHashBefore });
  }, 'private');

  const extracted = path.join(privateRoot, 'evidence-work', 'extracted');
  fs.mkdirSync(path.join(extracted, 'Inbox', 'Automation'), { recursive: true });
  fs.mkdirSync(path.join(extracted, 'Attachments'), { recursive: true });
  fs.writeFileSync(path.join(extracted, 'Inbox', 'Automation', 'message-001.eml'), [
    'From: Synthetic Sender <person@example.invalid>',
    'Date: Fri, 10 Jul 2026 14:00:00 -0500',
    'Subject: FeatureCAM robot tending ROI review',
    '',
    'Synthetic body about a Doosan lathe, bar feed, vision sensor, blanking feeder, quote, and post processor. No real people or companies.'
  ].join('\n'));
  fs.writeFileSync(path.join(extracted, 'Attachments', 'synthetic-robot-layout.dxf'), 'SYNTHETIC');
  fs.writeFileSync(path.join(extracted, 'Attachments', 'unrelated.bin'), 'NO MATCH');
  const privateIndex = indexExtractedEvidence({ extractedDir: extracted, searchPlan, sourceHash: sourceHashBefore });
  check('private evidence index finds synthetic message', privateIndex.counts.messagesMatched === 1, JSON.stringify(privateIndex.counts));
  check('private evidence index finds matching attachment', privateIndex.counts.attachmentsMatched === 1, JSON.stringify(privateIndex.counts));
  check('private index excludes raw content', privateIndex.rawContentIncluded === false && !JSON.stringify(privateIndex).includes('Synthetic body about'));
  check('private index hashes subject and path', privateIndex.messages[0].subjectDigest.length === 24 && privateIndex.messages[0].sourceRelativeDigest.length === 24);
  check('sender address is not retained', !JSON.stringify(privateIndex).includes('person@example.invalid'));
  check('matched groups include CAD/CAM and automation', ['cad-cam','automation'].every(id => privateIndex.messages[0].matchedGroups.some(group => group.groupId === id)));

  const compiled = compilePublicCaseStudies(registry, taxonomy);
  check('six explicitly public-safe case studies compile', compiled.items.length === 6, String(compiled.items.length));
  check('held cases remain excluded', !compiled.items.some(item => ['CASE-MFG-003','CASE-MFG-005','CASE-MFG-006','CASE-MFG-007','CASE-RES-001','CASE-RES-002'].includes(item.id)));
  check('all compiled items are public safe', compiled.items.every(item => item.privacyStatus === 'PUBLIC_SAFE'));
  check('verified historical item has source count', compiled.items.filter(item => item.classification === 'verified historical').every(item => item.sourceCount >= 1));
  check('compiled registry matches committed IDs', JSON.stringify(compiled.items.map(item => item.id)) === JSON.stringify(committedPublic.items.map(item => item.id)));
  check('compiled public proof excludes private indicators', !/\bClow\b|\bCSC\b|backup\.pst|private-work|@/i.test(JSON.stringify(compiled)));

  const tamperedRegistry = JSON.parse(JSON.stringify(registry));
  const held = tamperedRegistry.cases.find(item => item.id === 'CASE-MFG-006');
  held.publicationStatus = 'PUBLIC_SAFE';
  held.classification = 'verified historical';
  held.privacyStatus = 'PUBLIC_SAFE';
  held.sourceCount = 0;
  expectThrow('uncorroborated verified historical proof rejected', () => compilePublicCaseStudies(tamperedRegistry, taxonomy), 'lacks corroboration');

  const photoSafe = reviewPhotoRecord({ id:'PHOTO-001', sourceDigest:'abc123', stage:'after', projectClass:'garage', risks:[], peopleVisible:false, locationMetadataRemoved:true, ownerApproved:true, publicAssetPath:'proof/photos/garage-after.webp' }, taxonomy);
  const photoRedact = reviewPhotoRecord({ id:'PHOTO-002', sourceDigest:'def456', stage:'during', projectClass:'garage', risks:['address','location-metadata'], peopleVisible:false, locationMetadataRemoved:false, ownerApproved:true }, taxonomy);
  const photoHold = reviewPhotoRecord({ id:'PHOTO-003', sourceDigest:'ghi789', stage:'before', projectClass:'residential', risks:['family'], peopleVisible:true, locationMetadataRemoved:false, ownerApproved:true }, taxonomy);
  const photoNoApproval = reviewPhotoRecord({ id:'PHOTO-004', sourceDigest:'jkl012', stage:'reference', projectClass:'shop', risks:[], peopleVisible:false, locationMetadataRemoved:true, ownerApproved:false }, taxonomy);
  check('clean approved photo can be public safe', photoSafe.decision === 'PUBLIC_SAFE' && photoSafe.publicAssetPath);
  check('address and metadata photo requires redaction', photoRedact.decision === 'REDACT_AND_REVIEW');
  check('family photo remains on hold', photoHold.decision === 'HOLD');
  check('missing owner approval forces hold', photoNoApproval.decision === 'HOLD');
  expectThrow('invalid photo stage rejected', () => reviewPhotoRecord({ id:'PHOTO-005', sourceDigest:'x', stage:'marketing', risks:[], ownerApproved:true }, taxonomy), 'invalid');

  const toolErrors = validateToolManifest(toolManifest);
  check('tool manifest validates', toolErrors.length === 0, toolErrors.join(' '));
  check('eight public tools documented', toolManifest.tools.length === 8);
  check('three versioned downloads documented', toolManifest.downloads.length === 3);
  check('all tools have versions, assumptions, disclaimers, analytics, and related paths', toolManifest.tools.every(tool => tool.version && tool.assumptions.length && tool.disclaimer && tool.analyticsEvent && tool.relatedProduct));
  check('download files and README exist', toolManifest.downloads.every(item => exists(item.file) && exists(item.readme)));

  const formulas = require(path.join(ROOT, 'tool-formulas.js'));
  const machining = formulas.machining({ sfm:300, diameter:.5, teeth:4, chip:.003 });
  const payback = formulas.payback({ cost:100000, hoursPerWeek:40, loadedRate:45, weeksPerYear:50, otherAnnual:10000 });
  const bottleneck = formulas.bottleneck({ minutesPerDay:45, workingDays:240, loadedRate:55, people:2 });
  const barfeed = formulas.barfeed({ barLength:144, partLength:2, remnant:8, cutoff:.125, cycleSeconds:60, runHours:8, efficiencyPercent:80 });
  const pressfeed = formulas.pressfeed({ strokesPerMinute:30, feedPitchInches:4, scheduledHours:8, efficiencyPercent:75, usableCoilFeet:3000 });
  check('machining formula regression', Math.abs(machining.rpm - 2292) < .001 && Math.abs(machining.feed - 27.504) < .001);
  check('payback formula regression', Math.abs(payback.paybackMonths - 12) < .001);
  check('bottleneck formula regression', bottleneck.annualHours === 360 && bottleneck.annualCost === 19800);
  check('bar-feed formula regression', barfeed.partsPerBar === 64 && barfeed.runParts === 384);
  check('press-feed formula regression', pressfeed.goodStrokes === 10800 && pressfeed.stripFeet === 3600);
  check('score formula regression', formulas.score([3,3,3,3]).percent === 60);

  const downloadText = toolManifest.downloads.map(item => read(item.file)).join('\n') + read('downloads/README.md');
  check('downloads contain no private employer terms', !/\bClow\b|\bCSC\b/i.test(downloadText));
  check('downloads contain no credential or raw card fields', !/password|private key|cardNumber|\bcvv\b|\bcvc\b|sk_live_/i.test(downloadText));
  check('photo privacy download covers required risks', ['People visible','Address visible','Family or customer visible','Vendor or employee visible','Drawing or pricing visible','Vehicle identifier visible','Location metadata removed','Owner approved','Decision'].every(label => read('downloads/h38-photo-privacy-review.csv').includes(label)));

  const proofHtml = read('proof.html');
  const proofJs = read('proof.js');
  const proofData = read('proof-data.js');
  const freeTools = read('free-tools.html');
  check('proof page loads versioned public proof data', proofHtml.includes('proof-data.js') && proofJs.includes('H38_PUBLIC_PROOF'));
  check('proof page publishes method and privacy rules', proofHtml.includes('Original preserved. Working copy indexed. Public summary compiled separately.') && proofHtml.includes('No raw PST messages or attachments are public.'));
  check('proof page links photo review and tool resources', proofHtml.includes('downloads/h38-photo-privacy-review.csv') && proofHtml.includes('free-tools.html'));
  check('public proof code excludes private employer names', !/\bClow\b|\bCSC\b/i.test(proofHtml + proofJs + proofData));
  check('free tools exposes release, manifest, and downloads', freeTools.includes('Release 1.0.0') && freeTools.includes('tools-manifest.json') && toolManifest.downloads.every(item => freeTools.includes(item.file)));
  check('free tools has no checkout form or raw card input', !/<form[^>]*(?:checkout|payment)|cardNumber|\bcvv\b|\bcvc\b/i.test(freeTools));

  check('PST source remains explicitly blocked, not claimed complete', status.status === 'PIPELINE_READY_PRIVATE_SOURCE_BLOCKED' && status.blockers.some(item => item.id === 'BLOCK-PST-001' && item.status === 'MISSING_PRIVATE_MOUNT'));
  check('photo source remains explicitly blocked', status.blockers.some(item => item.id === 'BLOCK-PHOTO-001' && item.status === 'MISSING_PRIVATE_MOUNT'));
  check('status records no private publication or external actions', status.externalActionsOccurred === false && status.privateSourcePublished === false);

  const syntheticEvidence = {
    status: 'SYNTHETIC_PIPELINE_PASS',
    generatedAt: new Date().toISOString(),
    pstPreservation: {
      sourceSha256: preserved.sourceSha256,
      sourceSizeBytes: preserved.sourceSizeBytes,
      workingCopySha256: preserved.workingCopySha256,
      originalModified: preserved.originalModified
    },
    privateIndexCounts: privateIndex.counts,
    publicCaseIds: compiled.items.map(item => item.id),
    photoDecisions: [photoSafe, photoRedact, photoHold, photoNoApproval].map(item => ({ id:item.id, decision:item.decision })),
    toolRelease: toolManifest.release,
    toolCount: toolManifest.tools.length,
    downloadCount: toolManifest.downloads.length,
    actualPrivatePstProcessed: false,
    privateSourcePublished: false,
    externalActionsOccurred: false
  };
  writeJson(path.join(EVIDENCE_DIR, 'proof-evidence-synthetic-pipeline.json'), syntheticEvidence);

  const evidence = {
    status: failures.length ? 'HOLD' : 'PASS',
    generatedAt: new Date().toISOString(),
    release: 'proof-evidence-system-2026-07-12',
    passed: passes.length,
    failed: failures.length,
    publicCaseStudies: compiled.items.length,
    tools: toolManifest.tools.length,
    downloads: toolManifest.downloads.length,
    actualPrivatePstProcessed: false,
    exactPrivateBlockers: status.blockers,
    privateSourcePublished: false,
    externalActionsOccurred: false,
    passes,
    failures
  };
  writeJson(path.join(EVIDENCE_DIR, 'proof-evidence-system-verification.json'), evidence);
  console.log(JSON.stringify(evidence, null, 2));
  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.exit(failures.length ? 1 : 0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
