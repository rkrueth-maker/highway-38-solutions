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
const functionBody=x=>(x?.files||[]).map(file=>String(file?.content||'')).join('\n');
console.log(`H38 SUPABASE LIVE ACCEPTANCE — SHA ${sha} — project ${ref}`);
if(!token){fail('scoped Supabase Management API token is configured');console.log('\nRESULT: FAIL');process.exit(1)}
try{const p=await getJson(`${API}/projects/${ref}`);(p?.id===ref||p?.ref===ref)?pass('management API resolves production project'):fail('management API resolves production project',p?.id||p?.ref||'unknown');const s=String(p?.status||'').toUpperCase();(s.includes('ACTIVE')||s.includes('HEALTHY'))?pass('production project reports active/healthy',s):fail('production project reports active/healthy',s||'missing')}catch(e){fail('production project health probe',e.message)}
let funcs=[];try{funcs=arr(await getJson(`${API}/projects/${ref}/functions`));funcs.length?pass('deployed Edge Function inventory is readable',`${funcs.length} functions`):fail('deployed Edge Function inventory is readable','empty')}catch(e){fail('deployed Edge Function inventory is readable',e.message)}
const active=funcs.filter(f=>String(f?.status||'ACTIVE').toUpperCase()==='ACTIVE'), by=new Map(active.map(f=>[f.slug||f.name,f]));
for(const s of policy.required_live_functions||[]) by.has(s)?pass(`required production function is active: ${s}`):fail(`required production function is active: ${s}`);
for(const s of policy.forbidden_active_functions||[]) by.has(s)?fail(`forbidden recovery function is absent: ${s}`,`ACTIVE v${by.get(s)?.version??'?'}`):pass(`forbidden recovery function is absent: ${s}`);
for(const s of policy.required_tombstone_functions||[]){
  const listed=by.get(s);
  if(!listed){fail(`legacy recovery function is neutralized: ${s}`,'not deployed');continue}
  listed.verify_jwt===true?pass(`legacy recovery function requires platform JWT: ${s}`):fail(`legacy recovery function requires platform JWT: ${s}`);
  try{
    const detail=await getJson(`${API}/projects/${ref}/functions/${encodeURIComponent(s)}`), body=functionBody(detail), marker=String(policy.tombstone_marker||'');
    const safe=marker&&body.includes(marker)&&!body.includes('SUPABASE_SERVICE_ROLE_KEY')&&!body.includes('auth.admin')&&!body.includes('updateUserById')&&!body.includes('signInWithPassword');
    safe?pass(`legacy recovery function body is fail-closed: ${s}`):fail(`legacy recovery function body is fail-closed: ${s}`);
  }catch(e){fail(`legacy recovery function body is readable: ${s}`,e.message)}
}
for(const s of policy.hardened_public_functions||[]){
  try{
    const detail=await getJson(`${API}/projects/${ref}/functions/${encodeURIComponent(s)}`), body=functionBody(detail);
    const exact=body.includes('H38_EXISTING_USER_MAGIC_LINK_V1')&&/shouldCreateUser\s*:\s*false/.test(body)&&!/shouldCreateUser\s*:\s*true/.test(body);
    exact?pass(`public auth helper is existing-user only: ${s}`):fail(`public auth helper is existing-user only: ${s}`);
  }catch(e){fail(`public auth helper body is readable: ${s}`,e.message)}
}
const allowed=new Set(policy.allowed_verify_jwt_false||[]), unexpected=active.filter(f=>f.verify_jwt===false).map(f=>f.slug||f.name).filter(s=>!allowed.has(s)).sort(); unexpected.length?fail('no unreviewed verify_jwt=false function is deployed',unexpected.join(', ')):pass('no unreviewed verify_jwt=false function is deployed');
const tr=path.join(ROOT,'supabase/functions'), tracked=fs.existsSync(tr)?new Set(fs.readdirSync(tr,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name)):new Set(), deployedOnly=[...by.keys()].filter(s=>!tracked.has(s)).sort();
const dangerous=deployedOnly.filter(s=>(policy.forbidden_active_functions||[]).includes(s)||(/(?:auth|signin|login|repair|maintenance)/i.test(s)&&!allowed.has(s))); dangerous.length?fail('no dangerous deployed-only auth/recovery drift exists',dangerous.join(', ')):pass('no dangerous deployed-only auth/recovery drift exists'); deployedOnly.length?warn('deployed-only function drift exists',`${deployedOnly.length} function(s)`):pass('every deployed function is source-controlled');
try{const l=arr(await getJson(`${API}/projects/${ref}/advisors/security`));pass('security advisors are readable');const block=new Set(policy.blocking_security_advisor_lints||[]),review=new Set(policy.reviewed_security_advisor_lints||[]);for(const name of block){l.some(x=>lname(x)===name)?fail(`blocking security advisor is clear: ${name}`):pass(`blocking security advisor is clear: ${name}`)}const definer=l.find(x=>lname(x)==='authenticated_security_definer_function_executable'),actual=new Set((definer?.findings||[]).map(x=>`${x?.metadata?.name||''}(${x?.metadata?.arguments||''})`)),approved=new Set(policy.approved_authenticated_security_definer_functions||[]),missing=[...approved].filter(x=>!actual.has(x)),extra=[...actual].filter(x=>!approved.has(x));(!missing.length&&!extra.length)?pass('authenticated SECURITY DEFINER surface matches exact approved allowlist',`${actual.size} function(s)`):fail('authenticated SECURITY DEFINER surface matches exact approved allowlist',`missing: ${missing.join(', ')||'none'}; extra: ${extra.join(', ')||'none'}`);const unknown=l.filter(x=>['warn','warning','error','critical'].includes(level(x))&&!block.has(lname(x))&&!review.has(lname(x)));unknown.length?fail('no new unreviewed security advisor warning exists',[...new Set(unknown.map(lname))].join(', ')):pass('no new unreviewed security advisor warning exists')}catch(e){fail('security advisors are readable',e.message)}
try{const l=arr(await getJson(`${API}/projects/${ref}/advisors/performance`));pass('performance advisors are readable',`${l.length} lint group(s)`);const block=new Set(policy.blocking_performance_advisor_lints||[]);for(const name of block){l.some(x=>lname(x)===name)?fail(`blocking performance advisor is clear: ${name}`):pass(`blocking performance advisor is clear: ${name}`)}const unknown=l.filter(x=>['warn','warning','error','critical'].includes(level(x))&&!block.has(lname(x)));if(unknown.length)warn('reviewed performance advisor warnings remain',[...new Set(unknown.map(lname))].join(', '))}catch(e){fail('performance advisors are readable',e.message)}
console.log(`\nRESULT: ${failures.length?'FAIL':'PASS'} — ${passed} passed, ${failures.length} failed, ${warnings.length} warning(s)`);if(failures.length){for(const x of failures)console.log('  - '+x);process.exit(1)}
