#!/usr/bin/env node
'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const authSource=fs.readFileSync(path.join(root,'commercial-app/supabase-auth.js'),'utf8');
const guardSource=fs.readFileSync(path.join(root,'commercial-app/auth-session-guard.js'),'utf8');

const USER_A='22000000-0000-4000-8000-000000000001';
const USER_B='22000000-0000-4000-8000-000000000002';
const USER_C='22000000-0000-4000-8000-000000000003';
const BUSINESS_A='12000000-0000-4000-8000-000000000001';
const BUSINESS_B1='12000000-0000-4000-8000-000000000002';
const BUSINESS_B2='12000000-0000-4000-8000-000000000003';

let currentSession=null;
let currentAuthState=null;
let authCallback=null;
let userScope='';
let authClearedEvents=0;
const writes=[];
const storage=new Map();
const elements=new Map();

function element(id){
  if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:false,innerHTML:'',textContent:'',className:'',value:'',onclick:null,onsubmit:null});
  return elements.get(id);
}
function session(userId,email,token){return{access_token:token,user:{id:userId,email,user_metadata:{display_name:email.split('@')[0]}}};}
function membership(businessId,key,name,role,status='active',businessStatus='active'){
  return{
    membershipId:`membership-${businessId}`,
    businessId,
    businessKey:key,
    businessName:name,
    businessStatus,
    timezone:'America/Chicago',
    brandConfig:{currency:'USD'},
    businessModuleConfig:{},
    role,
    membershipStatus:status,
    acceptedAt:'2026-08-05T00:00:00Z',
    modules:[{moduleKey:'today',enabled:true,config:{}},{moduleKey:'quotes',enabled:true,config:{ownerReviewRequired:true}}]
  };
}
function authState(rows){
  const active=rows.filter(row=>row.membershipStatus==='active'&&row.businessStatus==='active');
  return{
    status:'PASS',
    serverTime:'2026-08-05T01:00:00Z',
    activeMembershipCount:active.length,
    canSwitchBusinesses:active.length>1,
    claimedInviteCount:0,
    memberships:rows,
    safeguards:{externalActionsEnabled:false,productionMigrationEnabled:false,automaticCustomerSending:false,automaticSocialPublishing:false,automaticFinancialActions:false,northernLakesEnabled:false}
  };
}

const client={
  auth:{
    async getSession(){return{data:{session:currentSession},error:null};},
    onAuthStateChange(callback){authCallback=callback;return{data:{subscription:{unsubscribe(){}}}};},
    async signInWithPassword(){return{data:{session:currentSession},error:null};},
    async signOut(){currentSession=null;if(authCallback)authCallback('SIGNED_OUT',null);return{error:null};},
    async resetPasswordForEmail(){return{error:null};},
    async updateUser(){return{error:null};}
  },
  async rpc(name){
    assert.equal(name,'business_office_auth_state');
    return{data:currentAuthState,error:null};
  }
};

const window={
  H38_BUSINESS_OFFICE_SUPABASE:{
    enabled:true,
    url:'https://preview-project.supabase.co',
    publishableKey:'sb_publishable_1234567890abcdefghijklmnop',
    fallbackUrl:'/open-business-office.html',
    authRedirectUrl:'https://preview.example/commercial-app/',
    productionPromotionAuthorized:false,
    northernLakesEnabled:false,
    externalActionsEnabled:false
  },
  H38Bridge:function LegacyBridge(){},
  supabase:{createClient(){return client;}},
  H38DB:{
    setUserScope(userId){
      if(userScope&&userScope!==userId){authClearedEvents++;}
      userScope=userId;
      return userId;
    },
    clearUserScope(){userScope='';},
    getUserScope(){return userScope;},
    async put(store,value){writes.push({store,value:{...value}});return value;}
  },
  dispatchEvent(event){if(event&&event.type==='h38:auth-cleared')authClearedEvents++;return true;}
};
window.window=window;

const sandbox={
  window,
  document:{getElementById:element},
  navigator:{onLine:true},
  location:{origin:'https://preview.example',pathname:'/commercial-app/',search:''},
  localStorage:{
    getItem(key){return storage.has(key)?storage.get(key):null;},
    setItem(key,value){storage.set(key,String(value));},
    removeItem(key){storage.delete(key);}
  },
  URLSearchParams,
  CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
  console,
  setTimeout,
  clearTimeout
};
vm.createContext(sandbox);
vm.runInContext(authSource,sandbox,{filename:'commercial-app/supabase-auth.js'});
vm.runInContext(guardSource,sandbox,{filename:'commercial-app/auth-session-guard.js'});

assert.equal(window.H38_SUPABASE_AUTH.enabled,true);
assert.notEqual(window.H38Bridge.name,'LegacyBridge');

const statuses=[];
const bootstraps=[];
const errors=[];
const bridge=new window.H38Bridge(null,'',status=>statuses.push(status),startup=>bootstraps.push(startup),()=>{},(stage,message)=>errors.push({stage,message}));

(async()=>{
  await bridge.connect();
  assert.equal(bridge.ready,false);
  assert.equal(statuses.at(-1),'sign-in-required');
  assert.equal(bootstraps.length,0);

  currentSession=session(USER_A,'owner-a@example.test','token-a');
  currentAuthState=authState([membership(BUSINESS_A,'auth-a','Auth A','owner')]);
  statuses.length=0;
  await bridge.connect();
  assert.equal(errors.length,0);
  assert.equal(bridge.ready,true);
  assert.deepEqual(statuses,['connected','bootstrapped']);
  assert.equal(bootstraps.length,1);
  assert.equal(bootstraps[0].selectedBusinessId,BUSINESS_A);
  assert.equal(bootstraps[0].snapshot.authUserId,USER_A);
  assert.equal(bootstraps[0].snapshot.business.businessId,BUSINESS_A);
  assert.equal(bootstraps[0].snapshot.user.roleName,'owner');
  assert.equal(bootstraps[0].snapshot.safeguards.externalActionsEnabled,false);
  assert.equal(storage.get(`h38-selected-business:${USER_A}`),BUSINESS_A);
  assert.ok(writes.some(row=>row.value.userId===USER_A&&row.value.businessId===BUSINESS_A&&row.value.status==='active'));

  await assert.rejects(
    bridge.request('fullStartupRefresh',{businessId:BUSINESS_B1}),
    /not an active membership/
  );
  const acceptance=await bridge.request('acceptanceStatus',{});
  assert.equal(acceptance.status,'PASS');
  assert.equal(acceptance.externalActionsEnabled,false);
  assert.equal(acceptance.productionPromotionAuthorized,false);
  assert.equal(acceptance.northernLakesEnabled,false);

  currentSession=session(USER_C,'suspended@example.test','token-c');
  currentAuthState=authState([membership(BUSINESS_A,'auth-a','Auth A','staff','suspended')]);
  statuses.length=0;
  await bridge.connect();
  assert.equal(bridge.ready,false);
  assert.deepEqual(statuses,['connected','membership-suspended']);
  assert.ok(authClearedEvents>=1,'user switch must clear visible tenant state');
  assert.ok(writes.some(row=>row.value.userId===USER_C&&row.value.status==='membership-suspended'));
  assert.equal(window.H38_SUPABASE_AUTH.getState().selectedBusinessId,'');
  await assert.rejects(
    bridge.request('fullStartupRefresh',{businessId:BUSINESS_A}),
    /not an active membership/
  );

  sandbox.location.search='?businessId=forged-business';
  currentSession=session(USER_B,'admin-b@example.test','token-b');
  currentAuthState=authState([
    membership(BUSINESS_B1,'auth-b-one','Auth B One','administrator'),
    membership(BUSINESS_B2,'auth-b-two','Auth B Two','viewer')
  ]);
  statuses.length=0;
  await bridge.connect();
  assert.equal(bridge.ready,true);
  assert.deepEqual(statuses,['connected','bootstrapped']);
  const multi=bootstraps.at(-1);
  assert.equal(multi.canSwitchBusinesses,true);
  assert.equal(multi.selectedBusinessId,'');
  assert.equal(multi.snapshot,null);
  assert.equal(multi.businesses.length,2);
  assert.equal(window.H38_SUPABASE_AUTH.getState().selectedBusinessId,'');

  const selected=await bridge.request('fullStartupRefresh',{businessId:BUSINESS_B2});
  assert.equal(selected.authUserId,USER_B);
  assert.equal(selected.business.businessId,BUSINESS_B2);
  assert.equal(selected.user.roleName,'viewer');
  assert.equal(storage.get(`h38-selected-business:${USER_B}`),BUSINESS_B2);
  assert.equal(window.H38_SUPABASE_AUTH.getState().selectedBusinessId,BUSINESS_B2);
  assert.equal(storage.get(`h38-selected-business:${USER_A}`),BUSINESS_A,'User A preference remains separately namespaced');

  statuses.length=0;
  authCallback('SIGNED_OUT',null);
  assert.equal(statuses.at(-1),'sign-in-required');
  assert.equal(userScope,'');
  assert.equal(element('authSignOutButton').hidden,true);

  console.log(JSON.stringify({
    status:'PASS',
    acceptance:'SUPABASE_BUSINESS_OFFICE_AUTH_RUNTIME',
    noSessionDenied:true,
    oneBusinessAutomaticSelection:true,
    forgedBusinessRejected:true,
    suspendedMembershipDenied:true,
    userSwitchClearsVisibleTenant:true,
    multiBusinessRequiresValidSelection:true,
    selectedBusinessNamespacedByUser:true,
    signOutClearsScope:true,
    externalActionsEnabled:false,
    productionPromotionAuthorized:false,
    northernLakesEnabled:false
  },null,2));
})().catch(error=>{
  console.error(JSON.stringify({status:'FAIL',acceptance:'SUPABASE_BUSINESS_OFFICE_AUTH_RUNTIME',error:error.stack||error.message||String(error)},null,2));
  process.exit(1);
});
