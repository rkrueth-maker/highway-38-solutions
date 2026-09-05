'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('supabase/migrations/20260905233000_supabase_traffic_efficiency.sql');
const recovery=read('commercial-app/supabase-session-recovery.js');

for(const needle of [
  'private.current_business_access_context()',
  '(select private.current_business_access_context())',
  'private.business_record_row_access_context',
  'private.employee_task_assigned_context',
  'private.employee_job_assigned_context',
  'business_error_log_business_created_idx',
  'occurrence_count',
  'last_seen_at',
  'business_error_log_dedupe_repeats',
  "interval '5 minutes'",
  "p_collection='timeEntries'"
]) assert(migration.includes(needle),`traffic migration missing ${needle}`);
assert(!/disable row level security/i.test(migration),'traffic repair must not disable RLS');
assert(!/service[_-]?role/i.test(migration.replace(/No service-role credentials[^\n]*/i,'')),'traffic repair must not introduce service-role access');
for(const needle of [
  'H38_SUPABASE_TRAFFIC_GUARD',
  "AUDIT_TABLES=new Set(['business_proof_log','business_error_log'])",
  'isOperationalHydration',
  '/hydrateSnapshot/',
  '/supabase-data\\.js/',
  'startupAuditHistoryLazy:true',
  'auditHistoryStillAvailable:true',
  'rlsStillAuthoritative:true',
  'loadAuditHistory'
]) assert(recovery.includes(needle),`traffic guard missing ${needle}`);

function chain(table,calls){
  const response={data:table==='business_proof_log'?[{id:'P1',action_type:'test',result:'PASS',created_at:'2026-09-05T00:00:00Z'}]:table==='business_error_log'?[{id:'E1',source:'test',message:'x',severity:'error',status:'open',occurrence_count:3,created_at:'2026-09-05T00:00:00Z',last_seen_at:'2026-09-05T00:01:00Z'}]:[],error:null};
  let proxy;
  proxy=new Proxy({}, {get(_target,property){
    if(property==='then')return (resolve,reject)=>Promise.resolve(response).then(resolve,reject);
    if(property==='catch')return reject=>Promise.resolve(response).catch(reject);
    if(property==='finally')return callback=>Promise.resolve(response).finally(callback);
    return (..._args)=>proxy;
  }});
  calls.push(table);
  return proxy;
}

(async()=>{
  const rawCalls=[];
  const listeners={};
  const api={
    from(table){return chain(String(table),rawCalls);},
    auth:{
      getSession:async()=>({data:{session:null},error:null}),
      getUser:async()=>({data:{user:{id:'U1'}},error:null}),
      refreshSession:async()=>({data:{session:null},error:null}),
      signOut:async()=>({error:null})
    }
  };
  const window={
    H38_SUPABASE_SHARED_CLIENT:{enabled:true,ensure:()=>api,get:()=>api},
    H38_SUPABASE_AUTH:{signOut:async()=>{},getState:()=>({userId:'U1'})},
    state:{businessId:'B1',snapshot:{}},
    addEventListener:(name,fn)=>{listeners[name]=fn;},
    dispatchEvent:()=>{}
  };
  const document={
    visibilityState:'visible',
    getElementById:()=>null,
    addEventListener:(name,fn)=>{listeners[`document:${name}`]=fn;},
    querySelector:()=>null,
    createElement:()=>({dataset:{},set src(_v){},get src(){return'';}}),
    head:{appendChild:()=>{}}
  };
  const context=vm.createContext({
    window,document,navigator:{onLine:false,serviceWorker:null},location:{reload:()=>{}},sessionStorage:{getItem:()=>null,setItem:()=>{}},
    CustomEvent:function(name,init){this.type=name;this.detail=init?.detail;},
    console,setTimeout:()=>0,clearTimeout:()=>{},Promise,Proxy,Set,Date,Number,String,Error,Symbol
  });
  vm.runInContext(recovery,context,{filename:'commercial-app/supabase-session-recovery.js'});
  assert(window.H38_SUPABASE_TRAFFIC_GUARD?.enabled,'traffic guard did not install');

  vm.runInContext(`
    async function hydrateSnapshot(){
      return Promise.all([
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_records').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_memberships').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('price_book_items').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_approvals').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_proof_log').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_error_log').select('*').eq('business_id','B1'),
        window.H38_SUPABASE_SHARED_CLIENT.ensure().from('business_module_settings').select('*').eq('business_id','B1')
      ]);
    }
    window.__hydrateSnapshot=hydrateSnapshot;
  `,context,{filename:'commercial-app/supabase-data.js'});
  await window.__hydrateSnapshot();
  assert.deepEqual(rawCalls,[
    'business_records','business_memberships','price_book_items','business_approvals','business_module_settings'
  ],'normal hydration must issue five operational reads and no audit-history reads');
  const afterStartup=window.H38_SUPABASE_TRAFFIC_GUARD.metrics();
  assert.equal(afterStartup.suppressedStartupAuditReads,2,'expected exactly two lazy startup audit reads');

  const audit=await window.H38_SUPABASE_TRAFFIC_GUARD.loadAuditHistory('B1');
  assert.equal(audit.proofLog.length,1,'explicit proof history must remain available');
  assert.equal(audit.errorLog.length,1,'explicit error history must remain available');
  assert.equal(audit.errorLog[0]['Occurrence Count'],3,'dedupe occurrence count must reach reporting layer');
  assert.deepEqual(rawCalls.slice(-2),['business_proof_log','business_error_log'],'explicit audit load must execute the two secured audit requests');
  assert.equal(window.H38_SUPABASE_TRAFFIC_GUARD.metrics().explicitAuditLoads,1);

  console.log(JSON.stringify({
    status:'PASS',
    startupHydrationRequestsBefore:7,
    startupHydrationRequestsAfter:5,
    startupAuditRequestsRemoved:2,
    explicitAuditRequestsWhenRequested:2,
    rlsStatementContext:true,
    errorLoopDedupe:true
  },null,2));
})().catch(error=>{console.error(error);process.exit(1);});
