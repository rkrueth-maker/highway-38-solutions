#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const client=read('apps-script/core-engine/owner-portal-next/Portal_RolePreview_Client.html');
const userAccess=read('apps-script/core-engine/owner-portal-next/Portal_UserAccess_Client.html');
const styles=read('apps-script/core-engine/owner-portal-next/Portal_RolePreview_Styles.html');
const index=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const failures=[];
function check(name,condition,detail=''){if(condition)console.log(`PASS: ${name}`);else{console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);failures.push(name);}}
check('preview buttons are visible',userAccess.includes('Preview Foreman')&&userAccess.includes('Preview Employee'));
check('preview client loads after field roles',index.indexOf("h38PortalRawInclude_('Portal_RolePreview_Client')")>index.indexOf("h38PortalRawInclude_('Portal_Field_Roles_Client')"));
check('preview styles are included',index.includes("h38PortalRawInclude_('Portal_RolePreview_Styles')"));
check('preview fragments are allowlisted',raw.includes("'Portal_RolePreview_Client'")&&raw.includes("'Portal_RolePreview_Styles'"));
check('preview is explicitly read only',client.includes('Owner role preview is read-only')&&client.includes('No user was created, no permission changed'));
check('preview is temporary per tab',client.includes('sessionStorage.setItem')&&client.includes('sessionStorage.removeItem'));
check('preview supports exit',client.includes('h38ExitRolePreview')&&styles.includes('h38-role-preview-banner'));
try{new Function(client);check('preview client parses',true);}catch(error){check('preview client parses',false,error.message);}

const storage={};
const classNames=new Set();
const documentStub={
  body:{classList:{add:name=>classNames.add(name),remove:name=>classNames.delete(name)}},
  addEventListener(){},
  getElementById(){return null;},
  querySelector(){return null;},
  createElement(){return {className:'',innerHTML:'',remove(){},set id(value){this._id=value;},get id(){return this._id;}};}
};
let baseCalls=[];
const sandbox={
  console,Promise,Error,String,Array,Object,RegExp,JSON,
  H38_UNIFIED:{ownerMode:true,user:{role:'Owner'},groups:[{id:'today',label:'Today',items:[{key:'today',label:'Home'},{key:'users',label:'Users'}]}]},
  CURRENT:'users',document:documentStub,
  sessionStorage:{getItem:key=>storage[key]||null,setItem:(key,value)=>{storage[key]=String(value);},removeItem:key=>{delete storage[key];}},
  call(name,args){baseCalls.push(name);return Promise.resolve({name,args});},
  renderNav(){return true;},refresh(){return Promise.resolve(true);},
  h38FieldClientRole(){return 'Owner';},h38AppRouteAllowed(route){return route==='today';},
  uxRows:value=>Array.isArray(value)?value:[],esc:value=>String(value),notice(){},show(){return Promise.resolve(true);},h38NormalizeBrand(){}
};
(async()=>{
  try{
    vm.createContext(sandbox);new vm.Script(client,{filename:'Portal_RolePreview_Client.html'}).runInContext(sandbox);
    check('owner begins outside preview',sandbox.h38FieldClientRole()==='Owner');
    await sandbox.h38StartRolePreview('Foreman');
    check('owner can enter Foreman preview',sandbox.h38RolePreviewActive()&&sandbox.h38FieldClientRole()==='Foreman');
    check('Foreman preview persists for the tab',storage.h38OwnerRolePreview==='Foreman');
    let mutationBlocked=false;try{await sandbox.call('h38PortalUserAccessSave',[{}]);}catch(error){mutationBlocked=/read-only/.test(error.message);}check('mutations are blocked during preview',mutationBlocked);
    await sandbox.call('h38PortalUnifiedBootstrap');check('read calls remain available',baseCalls.includes('h38PortalUnifiedBootstrap'));
    await sandbox.h38ExitRolePreview();check('exit restores owner role',!sandbox.h38RolePreviewActive()&&sandbox.h38FieldClientRole()==='Owner'&&!storage.h38OwnerRolePreview);
  }catch(error){check('role preview runtime simulation',false,error.stack||error.message);}
  console.log(`RESULT: ${failures.length?'HOLD':'PASS'} — ${failures.length} failure(s)`);
  process.exit(failures.length?1:0);
})();
