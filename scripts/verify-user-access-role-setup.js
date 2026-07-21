#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const server=read('apps-script/core-engine/owner-portal-next/Portal_UserAccess.js');
const client=read('apps-script/core-engine/owner-portal-next/Portal_UserAccess_Client.html');
const styles=read('apps-script/core-engine/owner-portal-next/Portal_UserAccess_Styles.html');
const index=read('apps-script/core-engine/owner-portal-next/Portal_Index.html');
const raw=read('apps-script/core-engine/owner-portal-next/Portal_RawIncludes.js');
const failures=[];
function check(name,condition,detail=''){if(condition)console.log(`PASS: ${name}`);else{console.error(`FAIL: ${name}${detail?` — ${detail}`:''}`);failures.push(name);}}

check('User Access style is included',index.includes("h38PortalRawInclude_('Portal_UserAccess_Styles')"));
check('User Access client is included after base views',index.indexOf("h38PortalRawInclude_('Portal_UserAccess_Client')")>index.indexOf("h38PortalRawInclude_('Portal_Application_Client_Views')"));
check('User Access fragments are allowlisted',['Portal_UserAccess_Styles','Portal_UserAccess_Client'].every(name=>raw.includes(`'${name}'`)));
check('visible management controls exist',['Add User','Edit user','Save Role Assignment','Google account email','Account status'].every(text=>client.includes(text)));
check('Foreman and Employee guidance is visible',client.includes("Foreman:'Can coordinate assigned field work")&&client.includes("Employee:'Can see assigned work"));
check('server protects owner and duplicate email',server.includes('The signed-in Owner cannot be deactivated')&&server.includes('That Google account is already authorized'));
check('restricted access is role derived',server.includes('h38PortalUserAccessDefaultsForRole_')&&server.includes("roleName==='Owner'")&&server.includes("roleName==='Administrator'"));
check('no invitation or external action occurs',client.includes('does not send an invitation')&&server.includes('externalActionsOccurred:false'));
try{new Function(client);check('User Access client parses',true);}catch(error){check('User Access client parses',false,error.message);}
try{new vm.Script(server);check('User Access server parses',true);}catch(error){check('User Access server parses',false,error.message);}

const headers=['User ID','Business ID','Email','Display Name','Role ID','Payroll Access','Tax Access','Posting Access','Customer Send Access','Export Access','User Access Admin','Status'];
const rows=[['USER-OWNER','highway38','owner@example.com','Owner','ROLE-OWNER','Yes','Yes','Yes','Yes','Yes','Yes','Active']];
const roles=[
  {'Role ID':'ROLE-OWNER','Role Name':'Owner',Active:'Yes'},
  {'Role ID':'ROLE-FOREMAN','Role Name':'Foreman',Active:'Yes'},
  {'Role ID':'ROLE-EMPLOYEE','Role Name':'Employee',Active:'Yes'},
  {'Role ID':'ROLE-VIEWER','Role Name':'Viewer',Active:'Yes'}
];
function rowObject(row){const out={};headers.forEach((header,index)=>{out[header]=row[index]||'';});return out;}
const sheet={
  getLastColumn(){return headers.length;},
  getLastRow(){return rows.length+1;},
  getRange(row,column,numRows,numColumns){
    return {
      getDisplayValues(){
        if(row===1)return [headers.slice(column-1,column-1+numColumns)];
        return rows.slice(row-2,row-2+numRows).map(item=>item.slice(column-1,column-1+numColumns));
      },
      setValues(values){
        const target=row-2;
        values.forEach((value,index)=>{rows[target+index]=value.slice();});
      }
    };
  }
};
let proofCount=0;
const sandbox={
  console,Object,Array,String,Number,Boolean,Math,Error,RegExp,Date,JSON,
  H38_BO_SHEETS:{ROLES:'roles',USERS:'users'},
  h38PortalRequireUnifiedUser_(){return {ownerMode:true,role:'Owner',user:{'User ID':'USER-OWNER',Email:'owner@example.com'}};},
  boReadTable_(name){if(name==='roles')return roles.map(item=>Object.assign({},item));if(name==='users')return rows.map(rowObject);return[];},
  boGetSpreadsheet_(){return {getSheetByName(name){return name==='users'?sheet:null;}};},
  boAssert_(condition,message){if(!condition)throw new Error(message);},
  boNormalizeText_(value){return String(value==null?'':value).trim();},
  boGetBusinessId_(){return 'highway38';},
  boNow_(){return '2026-07-21T00:00:00Z';},
  boProof_(){proofCount+=1;},
  Utilities:{getUuid(){return '12345678-1234-1234-1234-123456789abc';}}
};
try{
  vm.createContext(sandbox);
  new vm.Script(server,{filename:'Portal_UserAccess.js'}).runInContext(sandbox);
  const created=sandbox.h38PortalUserAccessSave({displayName:'Eli Employee',email:'eli@example.com',roleId:'ROLE-EMPLOYEE',status:'Active'});
  const employee=rows.map(rowObject).find(user=>user.Email==='eli@example.com');
  check('Employee can be added',!!employee&&employee['Role ID']==='ROLE-EMPLOYEE');
  check('Employee receives no restricted financial access',employee&&['Payroll Access','Tax Access','Posting Access','Customer Send Access','Export Access','User Access Admin'].every(field=>employee[field]==='No'));
  check('save returns refreshed manager snapshot',created&&created.status==='PASS'&&created.savedUserId===employee['User ID']&&created.externalActionsOccurred===false);
  sandbox.h38PortalUserAccessSave({userId:employee['User ID'],displayName:'Eli Foreman',email:'eli@example.com',roleId:'ROLE-FOREMAN',status:'Active'});
  const foreman=rows.map(rowObject).find(user=>user.Email==='eli@example.com');
  check('Employee can be reassigned to Foreman',foreman&&foreman['Role ID']==='ROLE-FOREMAN');
  let duplicateBlocked=false;try{sandbox.h38PortalUserAccessSave({displayName:'Duplicate',email:'eli@example.com',roleId:'ROLE-EMPLOYEE',status:'Active'});}catch(error){duplicateBlocked=/already authorized/.test(error.message);}check('duplicate Google account is blocked',duplicateBlocked);
  let ownerBlocked=false;try{sandbox.h38PortalUserAccessSave({userId:'USER-OWNER',displayName:'Owner',email:'owner@example.com',roleId:'ROLE-OWNER',status:'Inactive'});}catch(error){ownerBlocked=/cannot be deactivated/.test(error.message);}check('signed-in Owner cannot be deactivated',ownerBlocked);
  check('user changes write proof records',proofCount===2,`proofCount=${proofCount}`);
}catch(error){check('User Access runtime simulation',false,error.stack||error.message);}

console.log(`RESULT: ${failures.length?'HOLD':'PASS'} — ${failures.length} failure(s)`);
process.exit(failures.length?1:0);
