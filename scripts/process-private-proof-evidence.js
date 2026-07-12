#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  readJson,
  writeJson,
  preservePstSource,
  indexExtractedEvidence,
  compilePublicCaseStudies,
  reviewPhotoRecord
} = require('../proof-system/lib/proof-evidence-core');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = { command: argv[0] || 'help' };
  const args = argv.slice(1);
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!args.length) throw new Error(`Missing value for --${key}`);
    options[key] = args.shift();
  }
  return options;
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key} is required.`);
  return options[key];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const taxonomyPath = path.join(ROOT, 'proof-system', 'config', 'evidence-taxonomy.json');
  const searchPlanPath = path.join(ROOT, 'proof-system', 'config', 'evidence-search-plan.json');
  const registryPath = path.join(ROOT, 'proof-system', 'config', 'case-study-registry.json');

  if (options.command === 'preserve-pst') {
    const manifest = await preservePstSource({ sourceFile: required(options, 'source'), workDir: required(options, 'work-dir') });
    process.stdout.write(JSON.stringify({ status: 'PASS', command: options.command, manifest }, null, 2) + '\n');
    return;
  }

  if (options.command === 'index-extracted') {
    const sourceManifest = readJson(required(options, 'source-manifest'));
    const index = indexExtractedEvidence({
      extractedDir: required(options, 'extracted-dir'),
      searchPlan: readJson(searchPlanPath),
      sourceHash: sourceManifest.sourceSha256
    });
    const output = path.resolve(required(options, 'output'));
    writeJson(output, index);
    process.stdout.write(JSON.stringify({ status: 'PASS', command: options.command, output, counts: index.counts, rawContentIncluded: false }, null, 2) + '\n');
    return;
  }

  if (options.command === 'compile-public') {
    const compiled = compilePublicCaseStudies(readJson(registryPath), readJson(taxonomyPath));
    const output = path.resolve(required(options, 'output'));
    writeJson(output, compiled);
    process.stdout.write(JSON.stringify({ status: 'PASS', command: options.command, output, publicItems: compiled.items.length }, null, 2) + '\n');
    return;
  }

  if (options.command === 'review-photos') {
    const source = readJson(required(options, 'input'));
    const taxonomy = readJson(taxonomyPath);
    const reviewed = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      items: (source.items || []).map(item => reviewPhotoRecord(item, taxonomy))
    };
    reviewed.counts = reviewed.items.reduce((result, item) => {
      result[item.decision] = (result[item.decision] || 0) + 1;
      return result;
    }, {});
    const output = path.resolve(required(options, 'output'));
    writeJson(output, reviewed);
    process.stdout.write(JSON.stringify({ status: 'PASS', command: options.command, output, counts: reviewed.counts }, null, 2) + '\n');
    return;
  }

  process.stdout.write(`Private proof evidence processor\n\n` +
    `Preserve original PST and create a verified read-only working copy:\n` +
    `  node scripts/process-private-proof-evidence.js preserve-pst --source /private/backup.pst --work-dir /private/proof-work\n\n` +
    `Index an already extracted working-copy directory without retaining raw content in the index:\n` +
    `  node scripts/process-private-proof-evidence.js index-extracted --source-manifest /private/proof-work/pst-preservation-manifest.json --extracted-dir /private/proof-work/extracted --output /private/proof-work/private-evidence-index.json\n\n` +
    `Review a private photo manifest:\n` +
    `  node scripts/process-private-proof-evidence.js review-photos --input /private/proof-work/photo-manifest.json --output /private/proof-work/photo-review.json\n\n` +
    `Compile explicitly public-safe case-study summaries:\n` +
    `  node scripts/process-private-proof-evidence.js compile-public --output proof-system/public/public-case-studies.json\n`);
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'HOLD', error: error.message }, null, 2) + '\n');
  process.exit(1);
});
