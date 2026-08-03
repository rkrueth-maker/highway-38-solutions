#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');

const [credentialsArg]=process.argv.slice(2);
const credentialsPath=credentialsArg||path.join(process.env.HOME||'','.clasprc.json');
const evidenceDir=path.resolve(process.env.GITHUB_WORKSPACE||path.join(__dirname,'..'),'artifacts/commercial-google-native-beta');
const reportPath=path.join(evidenceDir,'standard-cloud-project-inventory.json');
const candidatePattern=/(highway|h38|commercial|business[ -]?office|apps?[ -]?script)/i;
const permissions=[
  'resourcemanager.projects.get',
  'resourcemanager.projects.update',
  'resourcemanager.projects.getIamPolicy',
  'serviceusage.services.get',
  'serviceusage.services.enable',
  'clientauthconfig.clients.get',
  'clientauthconfig.clients.list',
  'clientauthconfig.clients.create',
  'clientauthconfig.clients.update'
];
const services=['script.googleapis.com','drive.googleapis.com','sheets.googleapis.com'];

function findByKey(value,keys,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value))return'';
  seen.add(value);
  for(const [key,child] of Object.entries(value))if(keys.includes(key)&&typeof child==='string'&&child.trim())return child.trim();
  for(const child of Object.values(value)){const found=findByKey(child,keys,seen);if(found)return found;}
  return'';
}
function safeText(value,limit=500){return String(value||'').replace(/Help Token:\s*\S+/gi,'Help Token: [REDACTED]').replace(/ya29\.[A-Za-z0-9._-]+/g,'[REDACTED_TOKEN]').replace(/\s+/g,' ').trim().slice(0,limit);}
async function readJson(response){const text=await response.text();try{return text?JSON.parse(text):{};}catch(error){return{raw:safeText(text)}};}
async function refreshAccessToken(credentials){
  let token=findByKey(credentials,['access_token','accessToken']);
  const refreshToken=findByKey(credentials,['refresh_token','refreshToken']);
  const clientId=findByKey(credentials,['client_id','clientId']);
  const clientSecret=findByKey(credentials,['client_secret','clientSecret']);
  if(refreshToken&&clientId&&clientSecret){
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(30000)});
    const payload=await readJson(response);
    if(response.ok&&payload.access_token)token=payload.access_token;
    else if(!token)throw new Error(`Credential refresh failed (${response.status}): ${safeText(payload.error_description||payload.error?.message)}`);
  }
  if(!token)throw new Error('The encrypted Google credential does not contain a usable access token.');
  return token;
}
async function googleRequest(token,url,{method='GET',body}={}){
  const response=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  return{ok:response.ok,status:response.status,payload:await readJson(response)};
}
async function searchProjects(token){
  const projects=[];let pageToken='';
  for(let page=0;page<10;page++){
    const url=new URL('https://cloudresourcemanager.googleapis.com/v3/projects:search');
    url.searchParams.set('pageSize','100');
    url.searchParams.set('query','state:ACTIVE');
    if(pageToken)url.searchParams.set('pageToken',pageToken);
    const result=await googleRequest(token,url.toString());
    if(!result.ok)throw new Error(`Cloud project search failed (${result.status}): ${safeText(result.payload.error?.message||result.payload.raw)}`);
    projects.push(...(result.payload.projects||[]));
    pageToken=String(result.payload.nextPageToken||'');
    if(!pageToken)break;
  }
  return projects;
}
async function inspectProject(token,project){
  const number=String(project.name||'').replace(/^projects\//,'');
  const projectId=String(project.projectId||'');
  const displayName=String(project.displayName||'');
  const permissionResult=await googleRequest(token,`https://cloudresourcemanager.googleapis.com/v3/projects/${encodeURIComponent(number)}:testIamPermissions`,{method:'POST',body:{permissions}});
  const granted=new Set(permissionResult.payload.permissions||[]);
  const serviceStates={};
  for(const service of services){
    const state=await googleRequest(token,`https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(number)}/services/${encodeURIComponent(service)}`);
    serviceStates[service]={httpStatus:state.status,state:String(state.payload.state||''),message:state.ok?'':safeText(state.payload.error?.message||state.payload.raw)};
  }
  const canEnable=granted.has('serviceusage.services.enable');
  const oauthConfigControl=['clientauthconfig.clients.get','clientauthconfig.clients.list','clientauthconfig.clients.create','clientauthconfig.clients.update'].every(permission=>granted.has(permission));
  const projectControl=granted.has('resourcemanager.projects.get')&&granted.has('resourcemanager.projects.update');
  return{
    projectNumber:number,
    projectId,
    displayName,
    parent:String(project.parent||''),
    createTime:String(project.createTime||''),
    matchedHighway38:candidatePattern.test(`${projectId} ${displayName}`),
    permissionsGranted:[...granted].sort(),
    projectControl,
    canEnableApis:canEnable,
    oauthConfigControl,
    suitableForAppsScriptStandardProject:projectControl&&canEnable&&oauthConfigControl,
    services:serviceStates,
    permissionHttpStatus:permissionResult.status,
    permissionMessage:permissionResult.ok?'':safeText(permissionResult.payload.error?.message||permissionResult.payload.raw)
  };
}

(async()=>{
  const report={status:'FAIL',credentialFilePresent:false,visibleActiveProjectCount:0,matchedCandidateCount:0,suitableCandidateCount:0,candidates:[],unmatchedProjectCount:0,creationRecommended:false,recommendedProject:null,notes:[]};
  try{
    if(!fs.existsSync(credentialsPath))throw new Error('Encrypted Google credential file was not found.');
    report.credentialFilePresent=true;
    fs.mkdirSync(evidenceDir,{recursive:true});
    const credentials=JSON.parse(fs.readFileSync(credentialsPath,'utf8'));
    const token=await refreshAccessToken(credentials);
    const projects=await searchProjects(token);
    report.visibleActiveProjectCount=projects.length;
    const matched=projects.filter(project=>candidatePattern.test(`${project.projectId||''} ${project.displayName||''}`));
    report.matchedCandidateCount=matched.length;
    for(const project of matched)report.candidates.push(await inspectProject(token,project));
    report.unmatchedProjectCount=Math.max(0,projects.length-matched.length);
    report.suitableCandidateCount=report.candidates.filter(project=>project.suitableForAppsScriptStandardProject).length;
    report.recommendedProject=report.candidates.find(project=>project.suitableForAppsScriptStandardProject)||null;
    report.creationRecommended=!report.recommendedProject;
    if(report.recommendedProject)report.notes.push('A matching standard Cloud project is visible with project, API, and OAuth configuration control.');
    else if(projects.length)report.notes.push('No visible Highway 38 matching project has all required project, Service Usage, and OAuth configuration permissions.');
    else report.notes.push('No active standard Cloud projects are visible to this credential.');
    report.status='PASS';
  }catch(error){report.error=safeText(error.message,800);}
  finally{
    fs.mkdirSync(evidenceDir,{recursive:true});
    fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='PASS')process.exitCode=1;
  }
})();
