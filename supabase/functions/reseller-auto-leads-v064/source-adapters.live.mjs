import assert from 'node:assert/strict';
import {runDollarGeneralSourceOrchestrator} from './dg-source-orchestrator.mjs';

const result=await runDollarGeneralSourceOrchestrator(fetch);
const productive=result.source_status.filter(s=>s.status==='AVAILABLE'||s.status==='DEGRADED');
const direct=result.source_status.filter(s=>s.status==='AVAILABLE');
const references=result.source_status.filter(s=>s.status==='REFERENCE_ONLY');
const validRows=result.rows.filter(r=>r?.retailer==='Dollar General'&&(/^\d{7,14}$/.test(String(r?.upc||''))||/^\d{4,20}$/.test(String(r?.sku||'')))&&String(r?.title||'').trim().length>=4);
const retailShout=result.source_status.find(s=>s.adapter_id==='dg-retailshout');
const futureRows=validRows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(String(r?.pennied_at||''))&&r.pennied_at>new Date().toISOString().slice(0,10));

console.log(JSON.stringify({
  source_count:result.source_status.length,
  productive:productive.length,
  direct:direct.length,
  reference_only:references.length,
  rows:result.rows.length,
  valid_rows:validRows.length,
  future_rows:futureRows.length,
  source_status:result.source_status,
  warnings:result.warnings
},null,2));

assert.ok(result.source_status.length>=9,'all product adapters plus reference-only source must report their own status');
assert.ok(productive.length>=4,`expected at least 4 productive acquisition paths, got ${productive.length}`);
assert.ok(validRows.length>=100,`expected at least 100 defensible live public DG candidates, got ${validRows.length}`);
assert.ok(retailShout&&['AVAILABLE','DEGRADED'].includes(retailShout.status),`RetailShout is publicly current and must have a productive source-specific path; got ${retailShout?.status||'missing'}`);
assert.equal(futureRows.length,0,'future-effective list rows must not be emitted as already-live penny inventory');
assert.ok(result.source_status.every(s=>['AVAILABLE','DEGRADED','UNAVAILABLE','REFERENCE_ONLY'].includes(s.status)),'source state must be explicit and isolated');
console.log('DG live source-specific orchestrator gate succeeded');
