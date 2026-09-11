#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'commercial-app','supabase-operation-coverage.js'),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

(async()=>{
  let previousCalls=0;
  let supabaseClientTouches=0;
  class Bridge {}
  Bridge.prototype.request=async function(action,args){
    previousCalls++;
    return {
      status:'PASS',
      transport:'previous-adapter',
      results:(args?.operations||[]).map(op=>({operationId:op.operationId||op.id,status:'SYNCED',recordId:op.recordId||op.id,forwarded:true})),
      externalActionOccurred:false
    };
  };
  const state={snapshot:{user:{roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true}}}};
  const context={
    console,
    window:{
      H38_BUSINESS_OFFICE_SUPABASE:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test_only_12345678901234567890'},
      H38_SUPABASE_AUTH:{enabled:true,getState:()=>({userId:'staff-user'})},
      H38Bridge:Bridge,
      supabase:{createClient(){supabaseClientTouches++;throw new Error('Suppressed Staff usage telemetry must not create a Supabase data client.');}},
      state
    }
  };
  context.globalThis=context.window;
  vm.createContext(context);
  new vm.Script(source,{filename:'supabase-operation-coverage.js'}).runInContext(context);

  const bridge=new context.window.H38Bridge();
  const usage={id:'USAGE-STAFF-1',operationId:'USAGE-STAFF-1',recordId:'USAGE-STAFF-1',businessId:'business-1',recordType:'Usage Event',action:'RECORD_USAGE_EVENT',payload:{pageKey:'today',actionKey:'open'}};
  const staff=await bridge.request('completionSync',{businessId:'business-1',operations:[usage]},30000);
  assert(previousCalls===0,'Staff usage telemetry must be stopped before the previous generic business-record adapter.');
  assert(supabaseClientTouches===0,'Staff usage telemetry suppression must not touch the Supabase record client.');
  assert(staff.status==='PASS','Suppressed Staff telemetry must keep the sync batch healthy.');
  assert(staff.externalActionOccurred===false,'Suppressed telemetry must never create an external action.');
  assert(staff.staffUsageTelemetrySuppressed===true,'Response must report Staff telemetry suppression.');
  assert(staff.results?.length===1,'Suppressed Staff telemetry must return one synthetic completion result.');
  assert(staff.results[0].status==='SYNCED'&&staff.results[0].suppressed===true,'Suppressed Staff telemetry must be treated as intentionally completed, not failed/retried.');
  assert(staff.results[0].suppressionReason==='STAFF_USAGE_TELEMETRY_RLS_BOUNDARY','Suppression must identify the RLS boundary reason.');

  state.snapshot.user={roleName:'Owner',roleId:'owner',owner:true,permissions:{all:true}};
  const ownerUsage={...usage,id:'USAGE-OWNER-1',operationId:'USAGE-OWNER-1',recordId:'USAGE-OWNER-1'};
  const owner=await bridge.request('completionSync',{businessId:'business-1',operations:[ownerUsage]},30000);
  assert(previousCalls===1,'Owner usage telemetry must continue to the existing operational adapter.');
  assert(owner.results?.[0]?.forwarded===true,'Owner usage telemetry must not be suppressed.');
  assert(owner.staffUsageTelemetrySuppressed===false,'Owner telemetry response must not claim Staff suppression.');

  state.snapshot.user={roleName:'Staff',roleId:'staff',permissions:{viewCustomers:true,manageWork:true}};
  const businessOp={id:'JOB-1',operationId:'JOB-1',recordId:'JOB-1',businessId:'business-1',recordType:'Job',action:'SAVE_JOB',payload:{projectTitle:'Regression'}};
  const mixed=await bridge.request('completionSync',{businessId:'business-1',operations:[usage,businessOp]},30000);
  assert(previousCalls===2,'Real Staff business operations must still be forwarded after telemetry is removed from the batch.');
  assert(mixed.results.some(result=>result.suppressed===true),'Mixed batch must complete the Staff usage event quietly.');
  assert(mixed.results.some(result=>result.forwarded===true),'Mixed batch must preserve the real Staff business operation.');

  console.log(JSON.stringify({status:'PASS',acceptance:'STAFF_USAGE_TELEMETRY_BOUNDARY',staffUsageSuppressedBeforeBusinessRecords:true,ownerTelemetryPreserved:true,staffBusinessWritesPreserved:true,externalActionsOccurred:false},null,2));
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
