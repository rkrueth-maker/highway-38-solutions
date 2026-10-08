(function(){
'use strict';
// H38 Crew Location (Phone) — build 20261008-crew-phone-location-4.
// Optional, owner-enabled phone proof for field crews. Bouncie remains the
// vehicle tracker; this module only records crew-confirmed time stamps and,
// while a crew member is clocked in with the Office open in the foreground,
// optional live phone positions.
//
// Sandbox pilot (Ricky approved 2026-10-08, Sandbox tenant ONLY): the module
// lights up only where BOTH switches are on — the server-side tenant setting
// business_module_settings crew_phone_location (the pilot switch, set per
// business) AND the Owner Controls toggle crew_phone_location_enabled on the
// device. Everywhere else it stays dark, exactly as shipped.
//
// Privacy and manual-mode rules are hard boundaries:
// - Both switches default OFF; nothing appears until the owner turns them on.
// - Each crew member opts in on their own phone before GPS is captured.
// - Location is collected only while clocked in and while this page is visible.
// - Arrived/Depart always save the time even when GPS is denied or unavailable;
//   those rows are explicitly flagged "manual — no location".

var BUILD='20261008-crew-phone-location-4';
var PILOT_MODULE_KEY='crew_phone_location';
var FEATURE_ID='crew_phone_location_enabled';
var STAMP_COLLECTION='crewLocationStamps';
var POSITION_COLLECTION='crewPositions';
var CREW_CARD_ID='h38CrewPhoneLocationCard';
var JOB_PROOF_ID='h38CrewPhoneLocationJobProof';
var SERVICE_PROOF_ID='h38CrewPhoneLocationServiceProof';
var w=typeof window!=='undefined'?window:globalThis;

var FEATURE_DEF={
  id:FEATURE_ID,
  title:'Crew Location (Phone)',
  desc:'Opt-in phone arrival/departure proof for crew. Stamps time and GPS only while a crew member is clocked in; manual time stamps still work without location.',
  icon:'📍',
  default:false,
  category:'Fleet'
};

function text(value){return String(value==null?'':value).trim();}
function esc(value){
  if(typeof w.esc==='function')return w.esc(value);
  return text(value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});
}
function val(row){
  var keys=Array.prototype.slice.call(arguments,1);
  if(typeof w.v==='function')return w.v.apply(w,[row].concat(keys));
  for(var i=0;i<keys.length;i++){
    var key=keys[i];
    if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];
  }
  return '';
}
function num(value){var n=Number(value);return Number.isFinite(n)?n:0;}
function nowIso(){return typeof w.now==='function'?w.now():new Date().toISOString();}
function toast(message,bad){if(typeof w.toast==='function')w.toast(message,bad);else if(bad)console.warn(message);else console.log(message);}
function newId(prefix){
  if(typeof w.newId==='function')return w.newId(prefix);
  return prefix+'-'+Math.random().toString(36).slice(2,10).toUpperCase()+Date.now().toString(36).toUpperCase();
}
function records(name){
  if(typeof w.records==='function')return w.records(name)||[];
  var snapshot=(w.state&&w.state.snapshot)||{};
  return Array.isArray(snapshot[name])?snapshot[name]:[];
}
function businessId(){return text(w.state&&w.state.businessId);}
function currentUser(){
  var snapshot=(w.state&&w.state.snapshot)||{};
  return snapshot.user||w.state&&w.state.user||{};
}
function userId(){
  var user=currentUser();
  return text(val(user,'User ID','userId','authUserId')||user.id||user.userId||user.authUserId||user.email||'');
}
function userName(){
  var user=currentUser();
  return text(val(user,'Display Name','displayName','Name','name','Email','email')||userId()||'Crew member');
}
function roleName(){
  var user=currentUser();
  return text(val(user,'roleName','roleId','Role ID','role')||user.roleName||user.roleId||user.role||'').toLowerCase();
}
function isAdmin(){
  var role=roleName();
  return role==='owner'||role==='administrator'||role==='admin';
}
function isStaff(){
  var role=roleName(),user=currentUser();
  return role==='staff'||role==='field'||role==='field staff'||role==='foreman'||role==='site-manager'||role==='site manager'||/foreman|crew lead|field/.test(text(user.jobTitle||user.title).toLowerCase());
}
function ownerControls(){return w.H38OwnerControls||null;}
function registerFeature(){
  var controls=ownerControls();
  if(!controls||!Array.isArray(controls.FEATURES))return false;
  var exists=controls.FEATURES.some(function(feature){return feature&&feature.id===FEATURE_ID;});
  if(!exists)controls.FEATURES.push(FEATURE_DEF);
  return true;
}
function pilotEnabled(){
  // Server-backed tenant switch (business_module_settings, loaded into the
  // snapshot as moduleSettings). Missing row or enabled!==true means OFF.
  var snapshot=(w.state&&w.state.snapshot)||{};
  var list=Array.isArray(snapshot.moduleSettings)?snapshot.moduleSettings:[];
  for(var i=0;i<list.length;i++){
    var row=list[i]||{};
    if(text(row.moduleKey||row.module_key)===PILOT_MODULE_KEY)return row.enabled===true;
  }
  return false;
}
function enabled(){
  if(!registerFeature()||!businessId())return false;
  if(!pilotEnabled())return false;
  var controls=ownerControls();
  try{return !!(controls&&typeof controls.isEnabled==='function'&&controls.isEnabled(FEATURE_ID)===true);}
  catch(_){return false;}
}
function optInKey(){return 'h38-crew-location-optin-'+businessId()+'-'+(userId()||'anonymous');}
function isOptedIn(){
  if(!businessId()||!userId())return false;
  try{return localStorage.getItem(optInKey())==='1';}catch(_){return false;}
}
function setOptedIn(on){
  try{
    if(on)localStorage.setItem(optInKey(),'1');
    else localStorage.removeItem(optInKey());
  }catch(_){/* private browsing: stamps still work as manual */}
  watch.blocked=false;
  watch.error='';
  if(!on)stopWatch();
}

// ---------- presentation ----------
var styleInjected=false;
function ensureStyle(){
  if(styleInjected||typeof document==='undefined')return;
  styleInjected=true;
  var css=[
    '.h38-crew-location-card,.h38-crew-location-proof,.h38-crew-location-service{margin:0 0 16px}',
    '.h38-crew-location-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}',
    '.h38-crew-location-head h2,.h38-crew-location-proof h3,.h38-crew-location-service h2{margin:0}',
    '.h38-crew-location-kicker{font-size:.7rem;font-weight:900;letter-spacing:.08em;color:var(--blue,#174a70)}',
    '.h38-crew-location-note{color:var(--muted,#5f6f7d);font-size:.9rem}',
    '.h38-crew-location-sharing{display:flex;gap:8px;align-items:center;border:1px solid #9ccc9c;background:#edf8ed;border-radius:10px;padding:10px 12px;font-weight:800}',
    '.h38-crew-location-sharing .dot{width:11px;height:11px;border-radius:50%;background:#1d7a46;box-shadow:0 0 0 4px rgba(29,122,70,.15)}',
    '.h38-crew-location-actions,.h38-crew-location-job-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.h38-crew-location-actions button,.h38-crew-location-job-actions button,.h38-crew-location-service input[type="date"]{min-height:48px}',
    '.h38-crew-location-job{border-top:1px solid var(--line,#d6e0e8);padding:12px 0}',
    '.h38-crew-location-job:first-of-type{border-top:0}',
    '.h38-crew-location-job-title{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}',
    '.h38-crew-location-stamps{display:grid;gap:7px;margin-top:10px}',
    '.h38-crew-location-stamp{display:flex;gap:8px;align-items:flex-start;border-top:1px solid var(--line,#d6e0e8);padding:8px 0}',
    '.h38-crew-location-stamp:first-child{border-top:0}',
    '.h38-crew-location-stamp-main{flex:1;min-width:0}',
    '.h38-crew-location-status{font-weight:900}',
    '.h38-crew-location-status.gps{color:#1d7a46}.h38-crew-location-status.manual{color:#8a5a00}',
    '.h38-crew-location-service-list{display:grid;gap:9px;margin-top:10px}',
    '.h38-crew-location-stop{border:1px solid var(--line,#d6e0e8);border-radius:11px;padding:11px}',
    '.h38-crew-location-stop-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}',
    '@media(max-width:760px){.h38-crew-location-actions button,.h38-crew-location-job-actions button{flex:1 1 140px}}'
  ].join('\n');
  var style=document.createElement('style');
  style.setAttribute('data-h38-crew-phone-location','1');
  style.textContent=css;
  document.head.appendChild(style);
}
function fmtTime(iso){
  var date=new Date(iso||0);
  return Number.isNaN(date.getTime())?'—':date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
}
function fmtDateTime(iso){
  var date=new Date(iso||0);
  return Number.isNaN(date.getTime())?'—':date.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function dayKey(value){
  var date=new Date(value||0);
  if(Number.isNaN(date.getTime()))return '';
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
function todayKey(){return dayKey(new Date());}
function statusLabel(stamp){
  if(!stamp)return 'Not stamped';
  if(text(val(stamp,'Location Status'))==='gps'||stamp.Manual===false)return 'GPS';
  return 'Manual — no location';
}
function stampTypeLabel(type){
  var value=text(type).toLowerCase();
  if(value==='clock-in')return 'Clocked in';
  if(value==='arrived')return 'Arrived';
  if(value==='departed')return 'Departed';
  if(value==='photo')return 'Photo proof';
  return text(type)||'Stamp';
}

// ---------- record lookups ----------
function rowId(row){
  var keys=Array.prototype.slice.call(arguments,1);
  return text(val.apply(null,[row].concat(keys)));
}
function jobById(id){return records('jobs').find(function(row){return rowId(row,'Job ID','jobId','id')===text(id);})||null;}
function taskById(id){return records('tasks').find(function(row){return rowId(row,'Task ID','taskId','id')===text(id);})||null;}
function customerById(id){return records('customers').find(function(row){return rowId(row,'Customer ID','customerId','id')===text(id);})||null;}
function customerFor(job,event){
  var id=text(val(event||{},'Customer ID','customerId')||val(job||{},'Customer ID','customerId'));
  return customerById(id);
}
function linkedToCurrentUser(row){
  if(!row||isAdmin())return true;
  var uid=userId(),name=userName().toLowerCase();
  var assigned=text(val(row,'Assigned User ID','assignedUserId','Employee ID','employeeId','User ID','userId','Assigned To','assignedTo','Email','email'));
  if(!assigned)return true;
  return assigned===uid||assigned.toLowerCase()===name||assigned.toLowerCase()===text(currentUser().email||'').toLowerCase();
}
function activeTimeEntry(){
  var uid=userId();
  var rows=records('timeEntries').filter(function(row){
    var rowUser=text(val(row,'User ID','userId','Employee ID','employeeId')||'');
    if(uid&&rowUser&&rowUser!==uid)return false;
    return !text(val(row,'End Time','endTime','Clock Out','Clock Out Time','clockOut'));
  });
  rows.sort(function(a,b){
    return new Date(val(b,'Start Time','startTime','Clock In','Clock In Time','Created Time')||0)-new Date(val(a,'Start Time','startTime','Clock In','Clock In Time','Created Time')||0);
  });
  return rows[0]||null;
}
function addContext(map,job,task,event,source){
  var jobId=rowId(job||{},'Job ID','jobId','id')||text(val(event||{},'Job ID','jobId','Related Record ID','relatedRecordId'));
  if(!jobId)return;
  var existing=map.get(jobId);
  if(existing){
    if(task&&!existing.task)existing.task=task;
    if(event&&!existing.event)existing.event=event;
    return;
  }
  map.set(jobId,{job:job||jobById(jobId),task:task||null,event:event||null,source:source});
}
function currentContexts(){
  var map=new Map();
  var active=activeTimeEntry();
  if(active){
    var activeTask=taskById(val(active,'Task ID','taskId'));
    addContext(map,jobById(val(active,'Job ID','jobId')),activeTask,null,'clocked-in job');
  }
  // Today's scheduled stops come before the general task list: the card is
  // capped at 5 jobs, and a busy tenant's older assigned tasks would
  // otherwise push today's route stops (the ones needing stamps) off the card.
  records('scheduleEvents').filter(function(event){
    return linkedToCurrentUser(event)&&dayKey(val(event,'Start Time','startTime','Scheduled Time','scheduledAt'))===todayKey()&&!/CANCEL|VOID|DELETE/i.test(text(val(event,'Status','status')));
  }).slice(0,50).forEach(function(event){
    var jobId=text(val(event,'Job ID','jobId','Related Record ID','relatedRecordId'));
    var task=records('tasks').find(function(row){return rowId(row,'Job ID','jobId')===jobId&&linkedToCurrentUser(row);})||null;
    addContext(map,jobById(jobId),task,event,'scheduled today');
  });
  records('tasks').filter(function(task){
    return linkedToCurrentUser(task)&&!/COMPLET|CANCEL|VOID|ARCHIV/i.test(text(val(task,'Status','status')));
  }).slice(0,50).forEach(function(task){
    addContext(map,jobById(val(task,'Job ID','jobId')),task,null,'assigned task');
  });
  var selectedJobId=w.H38_JOB_LIFECYCLE&&typeof w.H38_JOB_LIFECYCLE.selectedJobId==='function'?text(w.H38_JOB_LIFECYCLE.selectedJobId()):'';
  if(selectedJobId&&(text(w.state&&w.state.page)==='work'))addContext(map,jobById(selectedJobId),null,null,'selected job');
  return Array.from(map.values()).filter(function(context){return context.job;}).slice(0,5);
}
function allStamps(){
  var rows=(records(STAMP_COLLECTION)||[]).slice();
  rows.sort(function(a,b){return String(val(b,'Timestamp','Created Time')||'').localeCompare(String(val(a,'Timestamp','Created Time')||''));});
  return rows;
}
function visibleStamps(){
  var rows=allStamps();
  if(isAdmin())return rows;
  var uid=userId(),name=userName(),email=text(currentUser().email||'').toLowerCase();
  return rows.filter(function(row){
    var rowUser=text(val(row,'User ID','userId'));
    var rowName=text(val(row,'User Name','userName'));
    return (uid&&rowUser===uid)||(name&&rowName===name)||(email&&rowName.toLowerCase()===email);
  });
}
function stampsForJob(jobId,eventId){
  return visibleStamps().filter(function(row){
    return (jobId&&text(val(row,'Job ID','jobId'))===text(jobId))||(eventId&&text(val(row,'Schedule Event ID','scheduleEventId'))===text(eventId));
  });
}
function latestStamp(jobId,eventId,type,userOnly){
  var rows=stampsForJob(jobId,eventId);
  if(userOnly){
    var uid=userId();
    rows=rows.filter(function(row){return text(val(row,'User ID','userId'))===uid;});
  }
  if(type)rows=rows.filter(function(row){return text(val(row,'Stamp Type','stampType')).toLowerCase()===text(type).toLowerCase();});
  return rows[0]||null;
}

// ---------- geolocation: GPS when allowed, manual time stamp when not ----------
function manualPosition(reason,message){
  return {manual:true,lat:'',lng:'',accuracy:'',reason:reason,message:message};
}
function capturePosition(){
  if(!isOptedIn()){
    return Promise.resolve(manualPosition('not-opted-in','Location sharing is not turned on, so we saved the time only — marked manual — no location.'));
  }
  if(typeof navigator==='undefined'||!navigator.geolocation||typeof navigator.geolocation.getCurrentPosition!=='function'){
    return Promise.resolve(manualPosition('unavailable','This phone cannot share GPS here, so we saved the time only — marked manual — no location.'));
  }
  return new Promise(function(resolve){
    var settled=false;
    var finish=function(position){if(!settled){settled=true;resolve(position);}};
    try{
      navigator.geolocation.getCurrentPosition(function(position){
        finish({
          manual:false,
          lat:Number(position.coords.latitude),
          lng:Number(position.coords.longitude),
          accuracy:position.coords.accuracy==null?'':Number(position.coords.accuracy),
          reason:'',
          message:''
        });
      },function(error){
        var code=error&&error.code;
        if(code===1)finish(manualPosition('denied','Location is off for this phone, so we saved the time only — marked manual — no location.'));
        else if(code===3)finish(manualPosition('timeout','Location took too long, so we saved the time only — marked manual — no location.'));
        else finish(manualPosition('unavailable','This phone could not find its location, so we saved the time only — marked manual — no location.'));
      },{enableHighAccuracy:true,maximumAge:30000,timeout:12000});
    }catch(_){
      finish(manualPosition('unavailable','This phone could not share GPS here, so we saved the time only — marked manual — no location.'));
    }
    setTimeout(function(){finish(manualPosition('timeout','Location took too long, so we saved the time only — marked manual — no location.'));},13000);
  });
}

async function saveStamp(type,context,position){
  if(!enabled())throw new Error('Crew Location (Phone) is off in Owner Controls.');
  if(typeof w.queueOperation!=='function')throw new Error('Open a business first.');
  context=context||{};
  var job=context.job||jobById(context.jobId||''),task=context.task||taskById(context.taskId||''),event=context.event||null;
  var jobId=rowId(job||{},'Job ID','jobId','id')||text(context.jobId||val(task||{},'Job ID','jobId')||val(event||{},'Job ID','jobId','Related Record ID','relatedRecordId'));
  if((type==='arrived'||type==='departed')&&!jobId)throw new Error('Choose a job before saving this stamp.');
  var stamp=nowIso(),id=newId('CREWSTAMP');
  var record={
    'Stamp ID':id,
    'Business ID':businessId(),
    'Job ID':jobId||'',
    'Schedule Event ID':rowId(event||{},'Schedule Event ID','scheduleEventId','Event ID','eventId','id')||text(context.eventId||''),
    'Task ID':rowId(task||{},'Task ID','taskId','id')||text(context.taskId||''),
    'User ID':userId(),
    'User Name':userName(),
    'Stamp Type':type,
    'Timestamp':stamp,
    'Lat':position&&position.manual?'':position.lat,
    'Lng':position&&position.manual?'':position.lng,
    'Accuracy':position&&position.manual?'':position.accuracy,
    'Location Status':position&&position.manual?'manual — no location':'gps',
    'Manual':!!(position&&position.manual),
    'Location Message':position&&position.manual?position.message:'',
    'Created Time':stamp,
    'Updated Time':stamp,
    'Record Version':1
  };
  await w.queueOperation('SAVE_CREW_LOCATION_STAMP','Crew Location Stamp',id,{
    stampId:id,stampType:type,jobId:record['Job ID'],scheduleEventId:record['Schedule Event ID'],taskId:record['Task ID'],
    userId:record['User ID'],userName:record['User Name'],timestamp:stamp,lat:record.Lat,lng:record.Lng,accuracy:record.Accuracy,manual:record.Manual
  },{collection:STAMP_COLLECTION,record:record,idKeys:['Stamp ID']});
  try{w.dispatchEvent(new CustomEvent('h38:business-snapshot-updated',{detail:{source:'crew-phone-location',collection:STAMP_COLLECTION,stampId:id}}));}catch(_){}
  return record;
}

async function stamp(type,context){
  if(!enabled()){toast('Crew Location (Phone) is off in Owner Controls.',true);return null;}
  context=context||{};
  if(!context.job&&context.jobId)context.job=jobById(context.jobId);
  if(!context.task&&context.taskId)context.task=taskById(context.taskId);
  var position=await capturePosition();
  var record=await saveStamp(type,context,position);
  if(type==='arrived'&&record['Task ID']&&isStaff()&&w.H38_EMPLOYEE_WORKSPACE&&typeof w.H38_EMPLOYEE_WORKSPACE.updateAssignedTask==='function'){
    try{await w.H38_EMPLOYEE_WORKSPACE.updateAssignedTask(record['Task ID'],'Arrived','Arrived stamp saved from Crew Location (Phone).');}
    catch(error){toast('Arrival time stamp saved. The task status was not changed: '+text(error&&error.message||error),true);}
  }
  if(position.manual)toast(position.message,true);
  else toast(stampTypeLabel(type)+' stamp saved with GPS location.');
  scheduleDecorateSettled();
  return record;
}

// ---------- foreground live position while clocked in ----------
var watch={id:null,lastLat:null,lastLng:null,lastAt:0,lastWriteAt:'',error:'',blocked:false};
function haversineM(aLat,aLng,bLat,bLng){
  var radius=6371000,toRad=function(degrees){return degrees*Math.PI/180;};
  var dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*radius*Math.asin(Math.sqrt(s));
}
async function writePosition(lat,lng,accuracy){
  if(!enabled()||!isOptedIn()||typeof w.queueOperation!=='function')return null;
  var id=newId('CREWPOS'),stamp=nowIso(),uid=userId()||'DEVICE';
  var record={'Crew Position ID':id,'Business ID':businessId(),'User ID':uid,'Lat':lat,'Lng':lng,'Accuracy':accuracy==null?'':accuracy,'Timestamp':stamp,'Created Time':stamp,'Record Version':1};
  await w.queueOperation('SAVE_CREW_POSITION','Crew Position',id,{positionId:id,userId:uid,userName:userName(),lat:lat,lng:lng,accuracy:accuracy,timestamp:stamp},{collection:POSITION_COLLECTION,record:record,idKeys:['Crew Position ID']});
  watch.lastLat=lat;watch.lastLng=lng;watch.lastAt=Date.now();watch.lastWriteAt=stamp;watch.error='';
  return record;
}
function watchConditions(){
  return enabled()&&isOptedIn()&&!!activeTimeEntry()&&typeof document!=='undefined'&&document.visibilityState==='visible'&&typeof navigator!=='undefined'&&!!navigator.geolocation;
}
function startWatch(){
  if(watch.blocked)return false;
  if(!watchConditions()){
    if(watch.id!=null)stopWatch();
    return false;
  }
  if(watch.id!=null)return true;
  watch.error='';
  try{
    watch.id=navigator.geolocation.watchPosition(function(position){
      if(!watchConditions()){stopWatch();return;}
      var lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      var moved=watch.lastLat==null||haversineM(watch.lastLat,watch.lastLng,lat,lng)>=50;
      var aged=Date.now()-watch.lastAt>=30000;
      if(moved||aged)writePosition(lat,lng,position.coords.accuracy).catch(function(){/* queued/offline: never crash the watch */});
    },function(error){
      watch.blocked=true;
      watch.error=error&&error.code===1?'Location is off for this phone. Live sharing stopped; time stamps will be marked manual — no location.':'This phone could not keep a GPS fix. Live sharing stopped; time stamps will be marked manual — no location.';
      stopWatch();
      toast(watch.error,true);
      scheduleDecorate();
    },{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
  }catch(_){
    watch.blocked=true;
    watch.error='This phone could not start location sharing. Time stamps will be marked manual — no location.';
    watch.id=null;
    return false;
  }
  scheduleDecorate();
  return true;
}
function stopWatch(){
  if(watch.id!=null&&typeof navigator!=='undefined'&&navigator.geolocation){
    try{navigator.geolocation.clearWatch(watch.id);}catch(_){}
  }
  watch.id=null;watch.lastLat=null;watch.lastLng=null;watch.lastAt=0;
}
function syncWatch(){return watchConditions()?startWatch():(stopWatch(),false);}

// ---------- crew card (Today / Work) ----------
function crewCardSignature(contexts,active){
  return JSON.stringify({
    page:text(w.state&&w.state.page),business:businessId(),user:userId(),opted:isOptedIn(),watching:watch.id!=null,
    active:active?rowId(active,'Time Entry ID','timeEntryId','id'):'' ,watchError:watch.error,lastWrite:watch.lastWriteAt,
    contexts:contexts.map(function(context){return [rowId(context.job,'Job ID','jobId','id'),rowId(context.task||{},'Task ID','taskId','id'),text(val(context.task||{},'Status','status'))];}),
    stamps:visibleStamps().slice(0,20).map(function(row){return rowId(row,'Stamp ID','stampId')+':'+text(val(row,'Timestamp'));})
  });
}
function stampSummary(jobId,eventId){
  var arrived=latestStamp(jobId,eventId,'arrived',true),departed=latestStamp(jobId,eventId,'departed',true);
  if(departed)return 'Departed '+fmtTime(val(departed,'Timestamp'))+' · '+statusLabel(departed);
  if(arrived)return 'Arrived '+fmtTime(val(arrived,'Timestamp'))+' · '+statusLabel(arrived);
  return 'No stamp yet';
}
function renderCrewCard(){
  var page=text(w.state&&w.state.page);
  var host=document.getElementById(CREW_CARD_ID);
  if(!enabled()||!userId()||(page!=='today'&&page!=='work')||(page==='work'&&isAdmin()&&!activeTimeEntry())){
    if(host)host.remove();
    return;
  }
  ensureStyle();
  var main=document.getElementById('mainContent');
  if(!main)return;
  var contexts=currentContexts(),active=activeTimeEntry(),signature=crewCardSignature(contexts,active);
  if(host&&host.dataset.h38CrewSignature===signature)return;
  if(!host){
    host=document.createElement('section');
    host.id=CREW_CARD_ID;
    host.className='card h38-crew-location-card';
    host.setAttribute('data-h38-crew-location','card');
    var fieldHost=document.getElementById('h38FieldMyDay')||document.getElementById('h38FieldJobHub');
    if(fieldHost)fieldHost.insertAdjacentElement('afterend',host);
    else {
      var grid=main.querySelector('.grid');
      if(grid)grid.insertAdjacentElement('beforebegin',host);else main.prepend(host);
    }
  }
  host.dataset.h38CrewSignature=signature;
  var opted=isOptedIn(),sharing=watch.id!=null;
  var jobs=contexts.length?contexts.map(function(context,index){
    var job=context.job,jobId=rowId(job,'Job ID','jobId','id'),taskId=rowId(context.task||{},'Task ID','taskId','id'),eventId=rowId(context.event||{},'Schedule Event ID','scheduleEventId','Event ID','eventId','id');
    var customer=customerFor(job,context.event);
    var title=text(val(job,'Project Title','projectTitle','Job Number','jobNumber')||'Assigned job');
    var customerName=text(val(customer||{},'Customer Name','name')||val(context.event||{},'Customer Name','customerName')||'');
    var address=text(val(context.event||{},'Location','location','Address','address')||val(job,'Address','address','Service Address','serviceAddress')||val(customer||{},'Service Address','serviceAddress','Address','address')||'');
    return '<div class="h38-crew-location-job"><div class="h38-crew-location-job-title"><div><strong>'+esc(title)+'</strong><br><small>'+esc([customerName,address].filter(Boolean).join(' · ')||context.source)+'</small></div><span>'+esc(stampSummary(jobId,eventId))+'</span></div>'+
      '<div class="h38-crew-location-job-actions">'+
      '<button type="button" data-h38-crew-stamp="arrived" data-job-id="'+esc(jobId)+'" data-task-id="'+esc(taskId)+'" data-event-id="'+esc(eventId)+'">Arrived</button>'+
      '<button type="button" class="secondary" data-h38-crew-stamp="departed" data-job-id="'+esc(jobId)+'" data-task-id="'+esc(taskId)+'" data-event-id="'+esc(eventId)+'">Depart</button>'+
      '<button type="button" class="secondary" data-h38-crew-photo data-job-id="'+esc(jobId)+'" data-task-id="'+esc(taskId)+'" data-event-id="'+esc(eventId)+'">📷 Photo proof</button>'+
      '</div></div>';
  }).join(''):'<p class="h38-crew-location-note">No assigned job is showing yet. Clock In still offers a location stamp when a job is attached to your time entry.</p>';
  host.innerHTML='<div class="h38-crew-location-head"><div><span class="h38-crew-location-kicker">CREW LOCATION (PHONE)</span><h2>Arrival & departure proof</h2><p class="h38-crew-location-note">GPS is captured only after you opt in, only while you are clocked in, and only while this Office page is open.</p></div><span>'+(sharing?'Sharing on shift':opted?'Ready':'Manual stamps')+'</span></div>'+
    (sharing?'<div class="h38-crew-location-sharing" data-h38-crew-sharing-indicator><span class="dot"></span><span>Sharing your location while on shift'+(watch.lastWriteAt?' · last update '+esc(fmtTime(watch.lastWriteAt)):'')+'</span></div>':'')+
    (watch.error?'<p class="h38-crew-location-note">'+esc(watch.error)+'</p>':'')+
    '<p class="h38-crew-location-note">'+(active?'Clocked in'+(active&&val(active,'Start Time','startTime','Clock In','Clock In Time')?' since '+esc(fmtTime(val(active,'Start Time','startTime','Clock In','Clock In Time'))):'')+'.':'Not clocked in.')+' '+(opted?'Phone location sharing is on for your shift.':'You can still use Arrived and Depart; the time will be saved and marked manual — no location.')+'</p>'+
    '<div class="h38-crew-location-actions">'+
    (opted?'<button type="button" class="secondary" data-h38-crew-opt-out>Stop sharing location</button>':'<button type="button" data-h38-crew-opt-in>Share my location on shift</button>')+
    (active?'<button type="button" class="secondary" data-h38-crew-clock="out">Clock out</button>':'<button type="button" class="secondary" data-h38-crew-clock="in">Clock in</button>')+
    '</div>'+jobs;
  var optIn=host.querySelector('[data-h38-crew-opt-in]');
  if(optIn)optIn.onclick=function(){
    setOptedIn(true);
    toast(activeTimeEntry()?'Location sharing is on. It runs only while you are clocked in and this page is open.':'Location sharing is ready. It starts after you clock in.');
    syncWatch();scheduleDecorate();
  };
  var optOut=host.querySelector('[data-h38-crew-opt-out]');
  if(optOut)optOut.onclick=function(){setOptedIn(false);toast('Location sharing stopped. Arrived and Depart will save manual time stamps.');scheduleDecorate();};
  var clock=host.querySelector('[data-h38-crew-clock]');
  if(clock)clock.onclick=function(){void crewClock(clock.dataset.h38CrewClock);};
  host.querySelectorAll('[data-h38-crew-stamp]').forEach(function(button){
    button.onclick=async function(){
      button.disabled=true;
      try{await stamp(button.dataset.h38CrewStamp,{jobId:button.dataset.jobId,taskId:button.dataset.taskId,eventId:button.dataset.eventId});}
      catch(error){toast(text(error&&error.message||error),true);}
      finally{button.disabled=false;scheduleDecorate();}
    };
  });
  host.querySelectorAll('[data-h38-crew-photo]').forEach(function(button){
    button.onclick=function(){photoProof(button);};
  });
}

// Photo proof: the photo itself rides the app's normal attachment path onto
// the job (Documents), and a "photo" stamp pins the time + GPS to the 📍
// proof trail so the two read as one piece of evidence.
function photoProof(button){
  var jobId=button.dataset.jobId,taskId=button.dataset.taskId,eventId=button.dataset.eventId;
  if(typeof document==='undefined')return;
  var input=document.createElement('input');
  input.type='file';input.accept='image/*';input.setAttribute('capture','environment');
  input.style.display='none';
  document.body.appendChild(input);
  input.onchange=async function(){
    var files=input.files;
    try{
      if(files&&files.length){
        if(typeof w.handleAttachmentFiles==='function'){
          await w.handleAttachmentFiles(files,'Job',jobId,'Internal',{});
        }else{
          toast('Photo saving is not available in this build — your time stamp still saves below.',true);
        }
        await stamp('photo',{jobId:jobId,taskId:taskId,eventId:eventId});
      }
    }catch(error){toast(text(error&&error.message||error),true);}
    finally{input.remove();scheduleDecorateSettled();}
  };
  input.click();
}

async function crewClock(action){
  if(action==='out'){
    stopWatch();
    try{
      if(isStaff()&&w.H38_EMPLOYEE_WORKSPACE&&typeof w.H38_EMPLOYEE_WORKSPACE.clockOut==='function')await w.H38_EMPLOYEE_WORKSPACE.clockOut();
      else {
        var existing=document.querySelector('[data-h38-clock="out"]');
        if(existing){existing.click();}
        else throw new Error('Use the Time clock card to clock out.');
      }
      toast('Clocked out. Location sharing stopped.');
    }catch(error){toast(text(error&&error.message||error),true);}
    scheduleDecorate();
    return;
  }
  try{
    var context=currentContexts()[0]||{};
    if(isStaff()&&w.H38_EMPLOYEE_WORKSPACE&&typeof w.H38_EMPLOYEE_WORKSPACE.clockInToTask==='function'){
      await w.H38_EMPLOYEE_WORKSPACE.clockInToTask(context.task||{});
    }else{
      var clockIn=document.querySelector('[data-h38-clock="in"]');
      if(clockIn){clockIn.click();pollForClockInStamp();return;}
      throw new Error('Use the Time clock card to clock in.');
    }
    await stamp('clock-in',context);
    syncWatch();
  }catch(error){toast(text(error&&error.message||error),true);}
  scheduleDecorate();
}
function recentClockInStamp(){
  var uid=userId(),cutoff=Date.now()-3*60*1000;
  return visibleStamps().find(function(row){
    return text(val(row,'User ID','userId'))===uid&&text(val(row,'Stamp Type','stampType')).toLowerCase()==='clock-in'&&new Date(val(row,'Timestamp','Created Time')||0).getTime()>=cutoff;
  })||null;
}
function pollForClockInStamp(){
  var attempts=0;
  var timer=setInterval(function(){
    attempts++;
    var active=activeTimeEntry()||document.querySelector('[data-h38-clock="out"]');
    if(active){
      clearInterval(timer);
      if(!recentClockInStamp())stamp('clock-in',currentContexts()[0]||{}).catch(function(error){toast(text(error&&error.message||error),true);});
      syncWatch();
    }else if(attempts>=8)clearInterval(timer);
  },700);
}

// ---------- owner/admin job proof ----------
function stampRowsHtml(rows){
  if(!rows.length)return '<p class="h38-crew-location-note">No crew location stamps for this job yet.</p>';
  return '<div class="h38-crew-location-stamps">'+rows.slice(0,20).map(function(row){
    var manual=text(val(row,'Location Status'))!=='gps';
    var coords=manual?'Manual — no location':'GPS '+Number(val(row,'Lat')).toFixed(5)+', '+Number(val(row,'Lng')).toFixed(5)+(val(row,'Accuracy')?' (±'+Math.round(num(val(row,'Accuracy')))+' m)':'');
    return '<div class="h38-crew-location-stamp"><div class="h38-crew-location-stamp-main"><strong>'+esc(stampTypeLabel(val(row,'Stamp Type')))+' '+esc(fmtDateTime(val(row,'Timestamp','Created Time')))+'</strong><br><small>'+esc(text(val(row,'User Name','userName')||val(row,'User ID','userId')||'Crew'))+' · '+esc(coords)+'</small></div><span class="h38-crew-location-status '+(manual?'manual':'gps')+'">'+esc(manual?'Manual':'GPS')+'</span></div>';
  }).join('')+'</div>';
}
function renderJobProof(){
  var host=document.getElementById(JOB_PROOF_ID);
  if(!enabled()||text(w.state&&w.state.page)!=='work'){
    if(host)host.remove();
    return;
  }
  var panel=document.querySelector('.h38-life-work');
  if(!panel)return;
  ensureStyle();
  var selected=w.H38_JOB_LIFECYCLE&&typeof w.H38_JOB_LIFECYCLE.selectedJobId==='function'?text(w.H38_JOB_LIFECYCLE.selectedJobId()):text(document.getElementById('h38LifecycleJob')&&document.getElementById('h38LifecycleJob').value);
  var job=jobById(selected);
  if(!job){if(host)host.remove();return;}
  var rows=stampsForJob(selected,''),signature=selected+':'+rows.map(function(row){return rowId(row,'Stamp ID','stampId')+text(val(row,'Timestamp'));}).join('|');
  if(!host){
    host=document.createElement('section');
    host.id=JOB_PROOF_ID;
    host.className='h38-crew-location-proof';
    host.setAttribute('data-h38-crew-location','job-proof');
    panel.appendChild(host);
  }
  if(host.dataset.h38CrewSignature===signature)return;
  host.dataset.h38CrewSignature=signature;
  host.innerHTML='<h3>📍 Arrival / departure proof</h3><p class="h38-crew-location-note">Crew phone stamps for '+esc(text(val(job,'Project Title','projectTitle','Job Number','jobNumber')||'this job'))+'. GPS rows show the captured location; manual rows prove the time only.</p>'+stampRowsHtml(rows);
}

// ---------- owner/admin schedule service proof (snow/route list) ----------
var boardDate='';
function defaultBoardDate(){
  var dates=records('scheduleEvents').map(function(event){return dayKey(val(event,'Start Time','startTime','Scheduled Time','scheduledAt'));}).filter(Boolean).sort();
  if(dates.indexOf(todayKey())>=0)return todayKey();
  return dates.find(function(date){return date>=todayKey();})||dates[dates.length-1]||todayKey();
}
function dayEvents(dateKeyValue){
  var jobs=records('jobs'),customers=records('customers');
  return records('scheduleEvents').filter(function(event){
    return dayKey(val(event,'Start Time','startTime','Scheduled Time','scheduledAt'))===dateKeyValue&&!/CANCEL|VOID|DELETE/i.test(text(val(event,'Status','status')));
  }).slice(0,50).map(function(event){
    var jobId=text(val(event,'Job ID','jobId','Related Record ID','relatedRecordId'));
    var job=jobById(jobId);
    var customer=customerFor(job,event);
    return {event:event,job:job,customer:customer,jobId:jobId,eventId:rowId(event,'Schedule Event ID','scheduleEventId','Event ID','eventId','id')};
  }).sort(function(a,b){return String(val(a.event,'Start Time','startTime')||'').localeCompare(String(val(b.event,'Start Time','startTime')||''));});
}
function serviceStatus(stop){
  var rows=stampsForJob(stop.jobId,stop.eventId);
  var departed=rows.find(function(row){return text(val(row,'Stamp Type')).toLowerCase()==='departed';});
  var arrived=rows.find(function(row){return text(val(row,'Stamp Type')).toLowerCase()==='arrived';});
  if(departed)return {label:'Serviced',stamp:departed};
  if(arrived)return {label:'Arrived',stamp:arrived};
  return {label:'Not stamped',stamp:null};
}
function renderScheduleProof(){
  var host=document.getElementById(SERVICE_PROOF_ID);
  if(!enabled()||!isAdmin()||text(w.state&&w.state.page)!=='schedule'){
    if(host)host.remove();
    return;
  }
  var main=document.getElementById('mainContent');
  if(!main)return;
  ensureStyle();
  if(!boardDate)boardDate=defaultBoardDate();
  var stops=dayEvents(boardDate);
  var signature=boardDate+':'+stops.map(function(stop){return stop.eventId+':'+stop.jobId;}).join('|')+':'+visibleStamps().slice(0,50).map(function(row){return rowId(row,'Stamp ID','stampId')+text(val(row,'Timestamp'));}).join('|');
  if(!host){
    host=document.createElement('section');
    host.id=SERVICE_PROOF_ID;
    host.className='card h38-crew-location-service';
    host.setAttribute('data-h38-crew-location','service-proof');
    var grid=main.querySelector('.grid');
    if(grid)grid.insertAdjacentElement('afterend',host);else main.appendChild(host);
  }
  if(host.dataset.h38CrewSignature===signature)return;
  host.dataset.h38CrewSignature=signature;
  var list=stops.length?stops.map(function(stop,index){
    var status=serviceStatus(stop),stamp=status.stamp;
    var title=text(val(stop.event,'Title','title')||val(stop.job||{},'Project Title','projectTitle','Job Number','jobNumber')||'Scheduled stop');
    var customerName=text(val(stop.customer||{},'Customer Name','name')||val(stop.event,'Customer Name','customerName')||'');
    var address=text(val(stop.event,'Location','location','Address','address')||val(stop.customer||{},'Service Address','serviceAddress','Address','address')||'');
    var detail=stamp?stampTypeLabel(val(stamp,'Stamp Type'))+' '+fmtTime(val(stamp,'Timestamp'))+' · '+statusLabel(stamp)+' · '+text(val(stamp,'User Name','userName')||'Crew'):'No crew phone stamp yet';
    return '<div class="h38-crew-location-stop"><div class="h38-crew-location-stop-head"><div><strong>'+esc((index+1)+'. '+title)+'</strong><br><small>'+esc(fmtTime(val(stop.event,'Start Time','startTime')))+(customerName?' · '+esc(customerName):'')+(address?' · '+esc(address):'')+'</small></div><span class="h38-crew-location-status '+(stamp?(text(val(stamp,'Location Status'))==='gps'?'gps':'manual'):'')+'">'+esc(status.label)+'</span></div><small>'+esc(detail)+'</small></div>';
  }).join(''):'<p class="h38-crew-location-note">No scheduled stops for this date.</p>';
  host.innerHTML='<div class="h38-crew-location-head"><div><span class="h38-crew-location-kicker">ROUTE / SNOW SERVICE PROOF</span><h2>Serviced stamps by stop</h2><p class="h38-crew-location-note">Built from the existing Schedule, Jobs and Customers records. A Departed stamp marks the stop serviced.</p></div><label>Date <input type="date" data-h38-crew-service-date value="'+esc(boardDate)+'"></label></div><div class="h38-crew-location-service-list">'+list+'</div>';
  var input=host.querySelector('[data-h38-crew-service-date]');
  if(input)input.onchange=function(){boardDate=input.value||todayKey();host.dataset.h38CrewSignature='';renderScheduleProof();};
}

// ---------- lifecycle / hooks ----------
function removeSurfaces(){
  [CREW_CARD_ID,JOB_PROOF_ID,SERVICE_PROOF_ID].forEach(function(id){
    var node=document.getElementById(id);
    if(node)node.remove();
  });
}
function decorate(){
  registerFeature();
  if(!enabled()){
    stopWatch();
    removeSurfaces();
    return;
  }
  if(!userId()||!businessId())return;
  renderCrewCard();
  renderJobProof();
  renderScheduleProof();
  syncWatch();
}
var decorateQueued=false;
function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  var run=function(){decorateQueued=false;decorate();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}
// After our own saves, the app's post-sync page refresh can re-render the
// workspace AFTER the snapshot-updated hook ran, wiping injected surfaces
// with no later hook firing. Re-check on a short settle timer so the card
// and proof panels come back on their own. decorate() is signature-guarded,
// so these extra passes are no-ops when everything is already in place.
function scheduleDecorateSettled(){
  scheduleDecorate();
  setTimeout(scheduleDecorate,1200);
  setTimeout(scheduleDecorate,3000);
}
function installHooks(){
  if(typeof document==='undefined'||document.documentElement.dataset.h38CrewPhoneLocationHooks==='1')return;
  document.documentElement.dataset.h38CrewPhoneLocationHooks='1';
  w.addEventListener('h38:office-page-rendered',scheduleDecorate);
  w.addEventListener('h38:business-snapshot-updated',scheduleDecorate);
  w.addEventListener('h38:job-lifecycle-ready',scheduleDecorate);
  w.addEventListener('pageshow',scheduleDecorate);
  w.addEventListener('focus',scheduleDecorate);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState!=='visible')stopWatch();
    else scheduleDecorate();
  });
  w.addEventListener('pagehide',stopWatch);
  w.addEventListener('h38:auth-cleared',function(){stopWatch();removeSurfaces();});
  document.addEventListener('change',function(event){
    if(event.target&&event.target.id==='h38LifecycleJob')setTimeout(scheduleDecorate,30);
  });
  document.addEventListener('click',function(event){
    var target=event.target;
    if(!target||typeof target.closest!=='function')return;
    if(target.closest('[data-h38-crew-location]'))return;
    if(target.closest('[data-h38-clock="out"],[data-h38-clock-out]')){
      setTimeout(stopWatch,0);
      return;
    }
    if(target.closest('[data-h38-job-primary="finish"]')){
      setTimeout(stopWatch,0);
      return;
    }
    if(enabled()&&isOptedIn()&&target.closest('[data-h38-clock="in"],[data-h38-clock-in],[data-h38-job-primary="start"]')){
      pollForClockInStamp();
    }
  },false);
}

registerFeature();
installHooks();
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleDecorate,{once:true});
  else scheduleDecorate();
}

w.H38CrewPhoneLocation=Object.freeze({
  build:BUILD,
  feature:FEATURE_DEF,
  enabled:enabled,
  pilotEnabled:pilotEnabled,
  isOptedIn:isOptedIn,
  setOptedIn:setOptedIn,
  capturePosition:capturePosition,
  stamp:stamp,
  saveStamp:saveStamp,
  startWatch:startWatch,
  stopWatch:stopWatch,
  isWatching:function(){return watch.id!=null;},
  stamps:visibleStamps,
  contexts:currentContexts,
  decorate:decorate,
  collections:{stamps:STAMP_COLLECTION,positions:POSITION_COLLECTION},
  manualFallbackNeverGates:true,
  foregroundOnly:true,
  trackingOnlyWhileClockedIn:true
});
})();
