import fs from 'node:fs';

const path = 'supabase/functions/h38-penny-cache/index.ts';
const source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('async function persistRows(');
const end = source.indexOf('async function updateMeta(', start);
if (start < 0 || end < 0) throw new Error('persistRows block not found');
const block = source.slice(start, end);
const required = [
  'function dedupeCanonicalRows(',
  'const byKey = new Map',
  'byKey.set(candidate.key',
  'const canonicalized = rows',
  'normalized = dedupeCanonicalRows(canonicalized)',
  'upserts = normalized.map',
  'const detail = errorDetail(e);',
];
for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing Penny cache dedupe guard: ${token}`);
}
if (block.includes('upserts = canonicalized.map')) {
  throw new Error('Canonicalized duplicate rows can still reach the upsert batch');
}
if (!block.includes('keys = [...new Set(normalized.map((x) => x.key))]')) {
  throw new Error('Existing-row lookup is not driven by deduped canonical keys');
}
console.log('PENNY_CACHE_CANONICAL_DEDUPE_SOURCE_GATE_PASS');
