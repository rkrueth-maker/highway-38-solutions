import assert from 'node:assert/strict';
import {runDollarGeneralAdapters,DG_SOURCE_ADAPTERS} from './source-adapters.mjs';

const result=await runDollarGeneralAdapters(fetch);
const productive=result.source_status.filter(s=>s.status==='AVAILABLE'||s.status==='DEGRADED');
const direct=result.source_status.filter(s=>s.status==='AVAILABLE');
const validRows=result.rows.filter(r=>r?.retailer==='Dollar General'&&/^\d{7,14}$/.test(String(r?.upc||''))&&String(r?.title||'').trim().length>=4);

console.log(JSON.stringify({
  adapters:DG_SOURCE_ADAPTERS.length,
  productive:productive.length,
  direct:direct.length,
  rows:result.rows.length,
  valid_rows:validRows.length,
  source_status:result.source_status,
  warnings:result.warnings
},null,2));

assert.equal(result.source_status.length,DG_SOURCE_ADAPTERS.length,'every configured source must report its own status');
assert.ok(productive.length>=2,`expected at least 2 productive independent acquisition paths, got ${productive.length}`);
assert.ok(validRows.length>=2,`expected at least 2 defensible UPC candidates from live public sources, got ${validRows.length}`);
assert.ok(result.source_status.every(s=>['AVAILABLE','DEGRADED','UNAVAILABLE'].includes(s.status)),'source state must be explicit and isolated');
console.log('DG live multi-source acquisition gate succeeded');
