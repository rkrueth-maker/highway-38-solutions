import fs from 'node:fs';

const path = 'supabase/functions/h38-penny-cache/index.ts';
const src = fs.readFileSync(path, 'utf8');
const errors = [];

if (/\breturn\d+\b/.test(src)) {
  errors.push('Found malformed returnN token (for example return3).');
}
for (const name of ['part', 'items', 'q']) {
  const assignment = new RegExp(`\\(${name}\\s*=`);
  if (assignment.test(src)) {
    errors.push(`Found undeclared parenthesized assignment to ${name}.`);
  }
}
if (!src.includes('const part = rows.slice(start, start + 8);')) {
  errors.push('Image resolver no longer declares the batch slice locally.');
}
if (!src.includes('const q = await invokeFunction(')) {
  errors.push('Image resolver no longer declares the delivery response locally.');
}
if (!src.includes('console.error("h38-penny-cache request failed"')) {
  errors.push('Request failures are not logged with action context.');
}
if (!src.includes('verify') && !src.includes('authenticatedUser')) {
  errors.push('Authentication guard appears to be missing.');
}

if (errors.length) {
  console.error('H38 Penny cache source verification FAILED');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('H38 Penny cache source verification passed.');
