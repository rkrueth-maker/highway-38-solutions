#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import process from 'node:process'; import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'supabase/acceptance/production-policy.json'),'utf8'));
const ref=policy.project_ref, token=(process.env.SUPABASE_ACCESS_TOKEN||'').trim(), sha=process.env.GITHUB_SHA||process.env.H38_ACCEPTANCE_SHA||'unknown', API='https://api.supabase.com/v1';
const failures=[], warnings=[]; let passed=0;
const pass=(l,d='')=>{passed++;console.log(`PASS  ${l}${d?` — ${d}`:''}`)}; const fail=(l,d='')=>{failures.push(`${l}${d?`: ${d}`:''}`);console.log(`FAIL  ${l}${d?` — ${d}`:''}`)}; const warn=(l,d='')=>{warnings.push(`${l}${d?`: ${d}`:''}`);console.log(`WARN  ${l}${d?` — ${d}`:''}`)};
async function getJson(url){const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':`H38-Supabase-Acceptance/${sha}`}});const t=await r.text();let b;try{b=t?JSON.parse(t):null}catch{b=t}if(!r.ok)throw new Error(`${r.status} ${r.statusText}: ${typeof b==='string'?b.slice(0,300):JSON.stringify(b).slice(0,300)}`);return b}
const arr=v=>Array.isArray(v)?v:Array.isArray(v?.functions)?v.functions:Array.isArray(v?.lints)?v.lints:Array.isArray(v?.result)?v.result:[];
const lname=x=>x?.name||x?.lint_name||x?.id||x?.type||'unknown', level=x=>String(x?.level||x?.severity||x?.category||'').toLowerCase();
const findingName=x=>String(x?.metadata?.name||x?.metadata?.entity||'');
console.log(`H38 SUPABASE LIVE ACCEPTANCE — SHA ${sha} — project ${ref}`);
if(!token){fail('scoped Supabase Management API token is configured');console.log('\nRESULT: FAIL');process.exit(1)}
try{const p=await getJson(`${API}/projects/${ref}`);(p?.id===ref||p?.ref===ref)?pass('management API resolves production project'):fail('management API resolves production project',p?.id||p?.ref||'unknown');const s=String(p?.status||'').toUpperCase();(s.includes('ACTIVE')||s.includes('HEALTHY'))?pass('production project reports active/healthy',s):fail('production project reports active/healthy',s||'missing')}catch(e){fail('production project health probe',e.message)}
let funcs=[];try{funcs=arr(await getJson(`${API}/projects/${ref}/functions`));funcs.length?pass('deployed Edge Function inventory is readable',`${funcs.length} functions`):fail('deployed Edge Function inventory is readable','empty')}catch(e){fail('deployed Edge Function inventory is readable',e.message)}
const active=funcs.filter(f=>String(f?.status||'ACTIVE').toUpperCase()==='ACTIVE'), by=new Map(active.map(f=>[f.slug||f.name,f]));
for(const s of policy.required_live_functions||[]) by.has(s)?pass(`required production function is active: ${s}`):fail(`required production function is active: ${s}`);
for(const [slug,contract] of Object.entries(policy.retired_live_functions||{})){
  const f=by.get(slug);
  if(!f){fail(`retired recovery tombstone is deployed: ${slug}`);continue;}
  f.verify_jwt===contract.verify_jwt?pass(`retired recovery tombstone requires JWT: ${slug}`):fail(`retired recovery tombstone requires JWT: ${slug}`,`verify_jwt=${String(f.verify_jwt)}`);
  String(f.ezbr_sha256||'')===String(contract.ezbr_sha256||'')?pass(`retired recovery tombstone matches approved build: ${slug}`):fail(`retired recovery tombstone matches approved build: ${slug}`,String(f.ezbr_sha256||'missing hash'));
}
for(const [slug,expected] of Object.entries(policy.required_live_function_hashes||{})){
  const f=by.get(slug); if(!f){fail(`pinned live function is deployed: ${slug}`);continue;}
  String(f.ezbr_sha256||'')===String(expected)?pass(`pinned live function matches approved build: ${slug}`):fail(`pinned live function matches approved build: ${slug}`,String(f.ezbr_sha256||'missing hash'));
}
const allowed=new Set(policy.allowed_verify_jwt_false||[]), unexpected=active.filter(f=>f.verify_jwt===false).map(f=>f.slug||f.name).filter(s=>!allowed.has(s)).sort(); unexpected.length?fail('no unreviewed verify_jwt=false function is deployed',unexpected.join(', ')):pass('no unreviewed verify_jwt=false function is deployed');
const tr=path.join(ROOT,'supabase/functions'), tracked=fs.existsSync(tr)?new Set(fs.readdirSync(tr,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name)):new Set(), deployedOnly=[...by.keys()].filter(s=>!tracked.has(s)).sort();
const retired=new Set(Object.keys(policy.retired_live_functions||{})), dangerous=deployedOnly.filter(s=>!retired.has(s)&&(/(?:auth|signin|login|repair|maintenance)/i.test(s)&&!allowed.has(s))); dangerous.length?fail('no dangerous deployed-only auth/recovery drift exists',dangerous.join(', ')):pass('no dangerous deployed-only auth/recovery drift exists'); deployedOnly.length?warn('deployed-only function drift exists',`${deployedOnly.length} function(s)`):pass('every deployed function is source-controlled');
try{
  const l=arr(await getJson(`${API}/projects/${ref}/advisors/security`)); pass('security advisors are readable');
  const block=new Set(policy.blocking_security_advisor_lints||[]), review=new Set(policy.reviewed_security_advisor_lints||[]), launchWarnings=new Set(policy.launch_warning_security_advisor_lints||[]), reviewedFindings=policy.reviewed_security_advisor_findings||[];
  const specificallyReviewed=x=>reviewedFindings.some(r=>String(r?.lint||'')===lname(x)&&(!r?.name||String(r.name)===findingName(x)));
  for(const x of l.filter(x=>block.has(lname(x)))) fail(`blocking security advisor is clear: ${lname(x)}`);
  for(const x of l.filter(x=>launchWarnings.has(lname(x)))) warn('launch security setting remains',`${lname(x)}${findingName(x)?` (${findingName(x)})`:''}`);
  const unknown=l.filter(x=>['warn','warning','error','critical'].includes(level(x))&&!block.has(lname(x))&&!review.has(lname(x))&&!launchWarnings.has(lname(x))&&!specificallyReviewed(x));
  unknown.length?fail('no new unreviewed security advisor warning exists',[...new Set(unknown.map(x=>`${lname(x)}${findingName(x)?`:${findingName(x)}`:''}`))].join(', ')):pass('no new unreviewed security advisor warning exists');
  const rh=l.filter(x=>review.has(lname(x))||specificallyReviewed(x)); if(rh.length)warn('reviewed security advisor findings remain',[...new Set(rh.map(x=>`${lname(x)}${findingName(x)?`:${findingName(x)}`:''}`))].join(', '));
}catch(e){fail('security advisors are readable',e.message)}
try{const l=arr(await getJson(`${API}/projects/${ref}/advisors/performance`));pass('performance advisors are readable',`${l.length} finding(s)`);const n=l.filter(x=>['warn','warning','error','critical'].includes(level(x))).length;if(n)warn('performance advisor warnings remain',`${n} warning/error finding(s)`)}catch(e){fail('performance advisors are readable',e.message)}
console.log(`\nRESULT: ${failures.length?'FAIL':'PASS'} — ${passed} passed, ${failures.length} failed, ${warnings.length} warning(s)`);if(failures.length){for(const x of failures)console.log('  - '+x);process.exit(1)}
