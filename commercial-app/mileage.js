(function(){
'use strict';
// H38 Mileage Tracking (Phone) — build 20261025-today-first-2.
// Automatic drive detection + ask-later classification for the mileage log
// (Rick's decisions, 2026-10-22):
//  - Trips are detected automatically and queued; the driver classifies
//    them LATER (business/personal + job + purpose), never in the moment.
//    A manual Start Trip / End Trip button is always available as fallback.
//  - Classification rule: "Auto-file the sure ones, ask me about the rest."
//    Signal order: (1) schedule/dispatch match, (2) learned places with a
//    consistent history, (3) repeat routes/patterns, (4) time-of-day /
//    day-of-week as a weak supporting signal ONLY — it never auto-files.
//    Auto-filed trips stay visible in an Auto-filed list and are one-tap
//    fixable; every fix feeds the place/pattern learning.
//  - Recording policy: EMPLOYEES record only while CLOCKED IN (the manual
//    button works anytime, so a forgotten clock-in never loses a trip).
//    OWNERS/ADMINS record whenever their recording switch is on. A
//    per-person Off-Duty switch stops all detection while it is on.
//
// Platform honesty (hard rule): in a plain browser, the phone only reports
// GPS while the Office is open on screen. Inside the H38 Office native app,
// the same policy arms a background runner that records drives with the
// app closed — that is the only background path, and the UI says which one
// is active on this phone. Drives the web layer misses surface as an honest
// "Missed a drive?" prompt (endpoints + straight-line distance,
// driver-editable), never as a fabricated route.
//
// Pilot gate: lights up where the server-side tenant setting
// business_module_settings mileage_tracking is on (set per business; ON
// for the H38 tenant pilot) AND the Owner Controls feature toggle is on.
// The toggle defaults ON and is saved server-side per business
// (FeatureToggles record) — it is an opt-OUT, never a hidden switch an
// owner has to find before tracking can arm. (Before 2026-10-25 the
// toggle defaulted OFF and lived only in per-device localStorage, so the
// native runner never armed and no trips were ever recorded.)
//
// Privacy: this keeps a mileage LOG, not a live-location map. A driver
// sees all of their own trips. Owners/admins see BUSINESS-classified trips
// and business totals for the team; a driver's PERSONAL trips and
// unreviewed trip details are never shown to anyone else (owners see only
// a count of trips awaiting review per person).

var BUILD='20261025-today-first-2';
var PILOT_MODULE_KEY='mileage_tracking';
var FEATURE_ID='mileage_tracking_enabled';
var TRIP_COLLECTION='mileageTrips';
var PLACE_COLLECTION='mileagePlaces';
var SETTINGS_COLLECTION='mileageSettings';
var CARD_ID='h38MileageCard';
var SECTION_ID='h38MileageSection';
var REPORT_CARD_ID='h38MileageReportCard';
var w=typeof window!=='undefined'?window:globalThis;

var FEATURE_DEF={
  id:FEATURE_ID,
  title:'Mileage Tracking (Phone)',
  desc:'Automatic trip detection on the phone with ask-later sorting: sure trips file themselves, the rest wait for a one-tap review. On by default — owners record whenever their day is started (Stop Day or this switch turns it off); employees record while clocked in.',
  icon:'🚗',
  default:true,
  category:'Fleet'
};

// ---------- shared helpers (Office conventions) ----------
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
function rowId(row){
  var keys=Array.prototype.slice.call(arguments,1);
  for(var i=0;i<keys.length;i++){var v=val(row,keys[i]);if(v)return text(v);}
  return row&&row.id?text(row.id):'';
}
function records(name){
  if(typeof w.records==='function')return w.records(name)||[];
  var snapshot=(w.state&&w.state.snapshot)||{};
  return Array.isArray(snapshot[name])?snapshot[name]:[];
}
function businessId(){return text(w.state&&w.state.businessId);}
function currentUser(){
  var snapshot=(w.state&&w.state.snapshot)||{};
  return snapshot.user||(w.state&&w.state.user)||{};
}
function userId(){
  var user=currentUser();
  return text(val(user,'User ID','userId','authUserId')||user.id||user.userId||user.authUserId||user.email||'');
}
function userName(){
  var user=currentUser();
  return text(val(user,'Display Name','displayName','Name','name','Email','email')||userId()||'Driver');
}
function roleName(){
  var user=currentUser();
  return text(val(user,'roleName','roleId','Role ID','role')||user.roleName||user.roleId||user.role||'').toLowerCase();
}
function isOwnerAdmin(){
  var user=currentUser();
  if(user&&(user.owner===true||user.isOwner===true))return true;
  var role=roleName();
  return role==='owner'||role==='administrator'||role==='admin';
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

// ---------- per-person switches (this phone, this person) ----------
function lsGet(key){try{return localStorage.getItem(key);}catch(_){return null;}}
function lsSet(key,value){try{if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(_){/* private mode: detection simply will not persist across opens */}}
function switchKey(kind){return 'h38-mileage-'+kind+'-'+businessId()+'-'+(userId()||'anonymous');}
function recordingOn(){
  // Default ON once the feature is enabled for the business: Rick asked for
  // automatic tracking, and the switch exists so a person can turn it off.
  var v=lsGet(switchKey('on'));
  return v===null?true:v==='1';
}
function setRecordingOn(on){lsSet(switchKey('on'),on?'1':'0');if(!on)stopWatch();pushNativePolicy(true);}
// Start Day / Stop Day (Rick's day bracket, 2026-10-25): Start Day arms
// recording — every drive from then on is recorded, with the app closed
// or open (the native runner does the work), until Stop Day. Start Day
// also clears an off-duty pause: pressing it means "record my drives".
// The recording switch defaults ON, so an owner who never presses
// anything is armed too (full background tracking); Stop Day is how an
// owner turns that off until the next Start Day.
function startDay(){
  lsSet(switchKey('offduty'),null);
  lsSet(switchKey('on'),'1');
  watch.blocked=false;watch.error='';
  pushNativePolicy(true);
  syncWatch();
}
function stopDay(){setRecordingOn(false);}
function offDuty(){return lsGet(switchKey('offduty'))==='1';}
function setOffDuty(on){lsSet(switchKey('offduty'),on?'1':null);if(on)stopWatch();pushNativePolicy(true);}

// ---------- time clock (employees record while clocked in) ----------
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
function clockedIn(){return !!activeTimeEntry();}
// Recording policy in one place: owners/admins record whenever their
// switch is on; employees record while clocked in. A manual trip in
// progress always keeps recording (the button works anytime).
function detectionEligible(){
  if(!enabled()||!userId())return false;
  if(!recordingOn()||offDuty())return false;
  if(manual.trip)return true;
  if(isOwnerAdmin())return true;
  return clockedIn();
}
function policyLine(){
  if(!recordingOn())return 'Day is stopped — tap Start Day when you head out. Drives are recorded until you tap Stop Day.';
  if(offDuty())return 'Off duty — not recording.';
  var nativeSt=nativeStatus();
  if(nativeSt&&(nativeSt.gate==='RECORDING'||nativeSt.gate==='WAITING_CLOCKIN')){
    if(isOwnerAdmin())return 'Recording is on — the H38 Office app on this phone watches for drives in the background.';
    return clockedIn()
      ? 'Recording is on — the H38 Office app watches for drives while you\u2019re clocked in.'
      : 'Trips are recorded while you\u2019re clocked in. Clock in to start automatic recording — or start a trip by hand anytime.';
  }
  if(isOwnerAdmin())return 'Recording is on. Drives are recorded while the Office is open on your phone.';
  return clockedIn()
    ? 'Recording is on. Trips are recorded while you\u2019re clocked in.'
    : 'Trips are recorded while you\u2019re clocked in. Clock in to start automatic recording — or start a trip by hand anytime.';
}

// ---------- geo math ----------
function haversineM(aLat,aLng,bLat,bLng){
  var radius=6371000,toRad=function(degrees){return degrees*Math.PI/180;};
  var dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*radius*Math.asin(Math.sqrt(s));
}
var MILE=1609.344;
function fmtMiles(m){return (Math.round(num(m)*10)/10).toFixed(1);}
function fmtTime(iso){
  var d=new Date(iso);
  if(isNaN(d))return text(iso);
  return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
}
function fmtDay(iso){
  var d=new Date(iso);
  if(isNaN(d))return text(iso).slice(0,10);
  return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
}

// ---------- records ----------
function tripIdOf(row){return rowId(row,'Trip ID','tripId');}
function placeIdOf(row){return rowId(row,'Place ID','placeId');}
function allTrips(){return records(TRIP_COLLECTION);}
function myTrips(){
  var uid=userId();
  return allTrips().filter(function(row){return text(val(row,'User ID','userId'))===uid;});
}
function tripStatus(row){return text(val(row,'Status','status'))||'Unreviewed';}
function tripClass(row){return text(val(row,'Classification','classification'));}
function isFiled(row){var s=tripStatus(row);return s==='Classified'||s==='Auto-filed';}
function myPlaces(){
  var uid=userId();
  return records(PLACE_COLLECTION).filter(function(row){return text(val(row,'User ID','userId'))===uid;});
}
function jobById(id){
  if(!id)return null;
  return records('jobs').filter(function(row){return rowId(row,'Job ID','jobId')===id;})[0]||null;
}
function customerById(id){
  if(!id)return null;
  return records('customers').filter(function(row){return rowId(row,'Customer ID','customerId')===id;})[0]||null;
}
function jobLabel(job){
  if(!job)return '';
  return text(val(job,'Job Number','jobNumber')||'')+' '+text(val(job,'Project Title','projectTitle','Title','title')||'Job');
}
function settingsRow(){
  var rows=records(SETTINGS_COLLECTION);
  return rows[0]||null;
}
function ratePerMile(){
  var row=settingsRow();
  var rate=num(row?val(row,'Rate Per Mile','ratePerMile'):'');
  return rate>0?rate:0;
}

// ---------- places ----------
function placeRadius(place){return Math.max(120,num(val(place,'Radius M','radiusM'))||200);}
function nearestPlace(lat,lng,places){
  var best=null,bestDist=Infinity;
  (places||[]).forEach(function(place){
    var pLat=num(val(place,'Lat','lat')),pLng=num(val(place,'Lng','lng'));
    if(!pLat&&!pLng)return;
    var d=haversineM(lat,lng,pLat,pLng);
    if(d<=placeRadius(place)&&d<bestDist){best=place;bestDist=d;}
  });
  return best?{place:best,dist:bestDist}:null;
}
function placeConsistent(place){
  // "Learned place with a consistent history": confirmed at least twice and
  // never corrected away. Anything weaker only feeds a suggestion.
  return num(val(place,'Times Confirmed','timesConfirmed'))>=2&&num(val(place,'Times Corrected Away','timesCorrectedAway'))===0;
}
function endpointLabel(lat,lng){
  var near=nearestPlace(lat,lng,myPlaces());
  if(near)return text(val(near.place,'Label','label'))||'Saved place';
  var customers=records('customers');
  for(var i=0;i<customers.length;i++){
    var cLat=num(val(customers[i],'Lat','Latitude','latitude')),cLng=num(val(customers[i],'Lng','Longitude','longitude'));
    if(cLat&&cLng&&haversineM(lat,lng,cLat,cLng)<=250)return text(val(customers[i],'Customer Name','name'))||'Customer';
  }
  return 'Unnamed place';
}

// ---------- suggestion engine ----------
// Returns {classification, jobId, customerId, score, autoFile, reason,
// placeId} — placeId is the learned place that drove an endpoint decision
// (used so a later correction can mark that place corrected-away).
function eventCoords(event){
  var lat=num(val(event,'Lat','Latitude','latitude')),lng=num(val(event,'Lng','Longitude','longitude'));
  if(lat&&lng)return {lat:lat,lng:lng};
  var customer=customerById(text(val(event,'Customer ID','customerId')));
  if(customer){
    lat=num(val(customer,'Lat','Latitude','latitude'));lng=num(val(customer,'Lng','Longitude','longitude'));
    if(lat&&lng)return {lat:lat,lng:lng};
  }
  var job=jobById(text(val(event,'Related Record ID','relatedRecordId')));
  if(job){
    var jc=customerById(text(val(job,'Customer ID','customerId')));
    if(jc){
      lat=num(val(jc,'Lat','Latitude','latitude'));lng=num(val(jc,'Lng','Longitude','longitude'));
      if(lat&&lng)return {lat:lat,lng:lng};
    }
  }
  return null;
}
function placeForJobOrCustomer(jobId,customerId){
  var places=myPlaces();
  for(var i=0;i<places.length;i++){
    if(jobId&&text(val(places[i],'Job ID','jobId'))===jobId)return places[i];
    if(customerId&&text(val(places[i],'Customer ID','customerId'))===customerId)return places[i];
  }
  return null;
}
function suggest(trip){
  var uid=userId();
  var startLat=num(trip.startLat),startLng=num(trip.startLng),endLat=num(trip.endLat),endLng=num(trip.endLng);
  var startMs=new Date(trip.startedAt).getTime(),endMs=new Date(trip.endedAt).getTime();
  var places=myPlaces();
  var best={classification:'',jobId:'',customerId:'',score:0,autoFile:false,reason:'',placeId:''};
  function consider(candidate){
    if(candidate.score>best.score)best=candidate;
    else if(candidate.autoFile&&!best.autoFile&&candidate.score>=best.score-5)best=candidate;
  }
  // (1) Schedule / dispatch match — strongest signal.
  if(endLat&&endLng){
    var events=records('scheduleEvents').filter(function(event){
      var assigned=text(val(event,'Assigned User ID','assignedUserId'));
      if(assigned&&uid&&assigned!==uid)return false;
      var evStart=new Date(val(event,'Start Time','startTime')||0).getTime();
      var evEnd=new Date(val(event,'End Time','endTime')||val(event,'Start Time','startTime')||0).getTime();
      if(!evStart)return false;
      // Trip ends near the event's window, or starts just before it.
      return (endMs>=evStart-60*60000&&endMs<=evEnd+45*60000)||(startMs>=evStart-45*60000&&startMs<=evStart+20*60000);
    });
    events.forEach(function(event){
      var jobId=text(val(event,'Related Record ID','relatedRecordId'));
      var coords=eventCoords(event);
      var nearEnd=false;
      if(coords&&haversineM(endLat,endLng,coords.lat,coords.lng)<=300)nearEnd=true;
      if(!nearEnd){
        var place=placeForJobOrCustomer(jobId,text(val(event,'Customer ID','customerId')));
        if(place&&haversineM(endLat,endLng,num(val(place,'Lat','lat')),num(val(place,'Lng','lng')))<=placeRadius(place)+100)nearEnd=true;
      }
      if(nearEnd){
        var job=jobById(jobId);
        consider({
          classification:'Business',jobId:jobId,
          customerId:job?text(val(job,'Customer ID','customerId')):text(val(event,'Customer ID','customerId')),
          score:92,autoFile:true,
          reason:'Matches your schedule: '+text(val(event,'Title','title')||(job?jobLabel(job):'scheduled job')),
          placeId:''
        });
      }
    });
  }
  // (2) Learned places at either endpoint.
  var endPlace=endLat?nearestPlace(endLat,endLng,places):null;
  var startPlace=startLat?nearestPlace(startLat,startLng,places):null;
  [endPlace,startPlace].forEach(function(hit){
    if(!hit)return;
    var place=hit.place;
    var classification=tripClass(place)||text(val(place,'Classification','classification'));
    if(!classification)return;
    var confirmed=num(val(place,'Times Confirmed','timesConfirmed'));
    var corrected=num(val(place,'Times Corrected Away','timesCorrectedAway'));
    var label=text(val(place,'Label','label'))||'Saved place';
    if(placeConsistent(place)){
      consider({
        classification:classification,
        jobId:classification==='Business'?text(val(place,'Job ID','jobId')):'',
        customerId:classification==='Business'?text(val(place,'Customer ID','customerId')):'',
        score:86,autoFile:true,
        reason:(hit===endPlace?'Ends at ':'Starts at ')+label+' — filed this way '+confirmed+' times',
        placeId:placeIdOf(place)
      });
    }else if(confirmed>=1&&corrected===0){
      consider({
        classification:classification,
        jobId:classification==='Business'?text(val(place,'Job ID','jobId')):'',
        customerId:classification==='Business'?text(val(place,'Customer ID','customerId')):'',
        score:58,autoFile:false,
        reason:'Looks like '+label+' (filed this way before)',
        placeId:placeIdOf(place)
      });
    }
  });
  // (3) Repeat routes: same start place + end place pair, filed the same
  // way at least twice with >=80% agreement. Supports a suggestion; the
  // pair alone never crosses the auto-file bar (rule 2 covers that case
  // when the places themselves are consistent).
  if(startPlace&&endPlace){
    var filed=myTrips().filter(function(row){
      return isFiled(row)&&tripIdOf(row)!==trip.id;
    });
    var same=0,agree=0,agreeClass='',agreeJob='';
    filed.forEach(function(row){
      var rStart=num(val(row,'Start Lat','startLat')),rEnd=num(val(row,'End Lat','endLat'));
      var rStartLng=num(val(row,'Start Lng','startLng')),rEndLng=num(val(row,'End Lng','endLng'));
      if(!rStart||!rEnd)return;
      var sp=nearestPlace(rStart,rStartLng,places),ep=nearestPlace(rEnd,rEndLng,places);
      if(sp&&ep&&placeIdOf(sp.place)===placeIdOf(startPlace.place)&&placeIdOf(ep.place)===placeIdOf(endPlace.place)){
        same++;
        if(tripClass(row)){agree++;agreeClass=tripClass(row);agreeJob=text(val(row,'Job ID','jobId'));}
      }
    });
    if(same>=2&&agree>=2&&agree/same>=0.8){
      consider({
        classification:agreeClass,jobId:agreeClass==='Business'?agreeJob:'',
        customerId:'',score:70,autoFile:false,
        reason:'A route you\u2019ve filed as '+agreeClass.toLowerCase()+' '+agree+' times',
        placeId:placeIdOf(endPlace.place)
      });
    }
  }
  // (4) Time-of-day / day-of-week: weak supporting signal only. It can
  // nudge an existing suggestion by a few points; it can never create one
  // and never auto-files.
  if(best.score>0&&best.score<92){
    var hour=new Date(trip.startedAt).getHours();
    var dow=new Date(trip.startedAt).getDay();
    var pattern=myTrips().filter(function(row){
      if(!isFiled(row)||tripClass(row)!==best.classification)return false;
      var h=new Date(val(row,'Started At','startedAt')||0).getHours();
      var d=new Date(val(row,'Started At','startedAt')||0).getDay();
      return Math.abs(h-hour)<=1&&d===dow;
    });
    if(pattern.length>=3)best.score=Math.min(78,best.score+5);
  }
  if(best.score>0&&best.score<35)best.score=0;
  if(!best.classification)best={classification:'',jobId:'',customerId:'',score:0,autoFile:false,reason:'',placeId:''};
  return best;
}

// ---------- saves ----------
async function saveTripRecord(record){
  if(typeof w.queueOperation!=='function')throw new Error('Open a business first.');
  var id=record['Trip ID'];
  await w.queueOperation('SAVE_MILEAGE_TRIP','Mileage Trip',id,{
    tripId:id,status:record['Status'],classification:record['Classification'],
    jobId:record['Job ID'],customerId:record['Customer ID'],miles:record['Miles']
  },{collection:TRIP_COLLECTION,record:record,idKeys:['Trip ID']});
  try{w.dispatchEvent(new CustomEvent('h38:business-snapshot-updated',{detail:{source:'mileage',collection:TRIP_COLLECTION,tripId:id}}));}catch(_){}
  return record;
}
async function savePlaceRecord(record){
  if(typeof w.queueOperation!=='function')throw new Error('Open a business first.');
  var id=record['Place ID'];
  await w.queueOperation('SAVE_MILEAGE_PLACE','Mileage Place',id,{
    placeId:id,label:record['Label'],classification:record['Classification'],
    jobId:record['Job ID'],customerId:record['Customer ID']
  },{collection:PLACE_COLLECTION,record:record,idKeys:['Place ID']});
  try{w.dispatchEvent(new CustomEvent('h38:business-snapshot-updated',{detail:{source:'mileage',collection:PLACE_COLLECTION,placeId:id}}));}catch(_){}
  return record;
}
// Learning: after a trip's classification is final, fold its endpoints
// into the driver's learned places. `previous` is the classification the
// suggestion/auto-file had (if any) so corrections mark the driving place.
async function learnFromTrip(trip,previous){
  var finalClass=trip.classification;
  if(!finalClass)return;
  var suggestionWasWrong=previous&&(previous.classification||previous.jobId)&&(previous.classification!==finalClass||(previous.jobId&&previous.jobId!==trip.jobId));
  var endpoints=[
    {lat:num(trip.startLat),lng:num(trip.startLng),label:trip.startLabel},
    {lat:num(trip.endLat),lng:num(trip.endLng),label:trip.endLabel}
  ];
  for(var i=0;i<endpoints.length;i++){
    var ep=endpoints[i];
    if(!ep.lat&&!ep.lng)continue;
    var places=myPlaces();
    var hit=nearestPlace(ep.lat,ep.lng,places);
    var stamp=nowIso();
    if(hit){
      var place=hit.place;
      var updated=Object.assign({},place);
      var placeClass=text(val(place,'Classification','classification'));
      updated['Classification']=finalClass;
      if(finalClass==='Business'){
        if(trip.jobId)updated['Job ID']=trip.jobId;
        if(trip.customerId)updated['Customer ID']=trip.customerId;
        updated['Kind']=trip.jobId?'job-site':'business';
      }else{
        updated['Kind']='personal';
        updated['Job ID']='';updated['Customer ID']='';
      }
      var droveSuggestion=previous&&previous.placeId&&previous.placeId===placeIdOf(place);
      if(placeClass&&placeClass!==finalClass){
        // The driver overruled what this place used to mean: the old
        // history no longer counts toward auto-filing under the new
        // classification — it has to earn consistency again.
        updated['Times Corrected Away']=num(val(place,'Times Corrected Away','timesCorrectedAway'))+1;
        updated['Times Confirmed']=1;
      }else if(suggestionWasWrong&&droveSuggestion){
        updated['Times Corrected Away']=num(val(place,'Times Corrected Away','timesCorrectedAway'))+1;
      }else{
        updated['Times Confirmed']=num(val(place,'Times Confirmed','timesConfirmed'))+1;
      }
      updated['Last Seen']=stamp;updated['Updated Time']=stamp;
      updated['Record Version']=num(val(place,'Record Version','recordVersion'))+1;
      await savePlaceRecord(updated);
    }else{
      var id=newId('MPLACE');
      var created={
        'Place ID':id,'Business ID':businessId(),'User ID':userId(),
        'Label':ep.label&&ep.label!=='Unnamed place'?ep.label:(finalClass==='Business'?'Job place':'Personal place'),
        'Kind':finalClass==='Business'?(trip.jobId?'job-site':'business'):'personal',
        'Lat':ep.lat,'Lng':ep.lng,'Radius M':200,
        'Classification':finalClass,
        'Job ID':finalClass==='Business'?trip.jobId||'':'',
        'Customer ID':finalClass==='Business'?trip.customerId||'':'',
        'Times Seen':1,'Times Confirmed':1,'Times Corrected Away':0,
        'Last Seen':stamp,'Created Time':stamp,'Updated Time':stamp,'Record Version':1
      };
      await savePlaceRecord(created);
    }
  }
}
function tripObjectFromRow(row){
  return {
    id:tripIdOf(row),
    startedAt:text(val(row,'Started At','startedAt')),
    endedAt:text(val(row,'Ended At','endedAt')),
    startLat:num(val(row,'Start Lat','startLat')),startLng:num(val(row,'Start Lng','startLng')),
    endLat:num(val(row,'End Lat','endLat')),endLng:num(val(row,'End Lng','endLng')),
    startLabel:text(val(row,'Start Label','startLabel')),endLabel:text(val(row,'End Label','endLabel')),
    miles:num(val(row,'Miles','miles')),
    classification:tripClass(row),jobId:text(val(row,'Job ID','jobId')),customerId:text(val(row,'Customer ID','customerId')),
    purpose:text(val(row,'Purpose','purpose')),status:tripStatus(row)
  };
}

// ---------- detection engine ----------
// State machine over watchPosition fixes while the Office is open:
//   parked (anchor known) -> moving (left the anchor area) -> parked again
//   after sustained stillness -> trip closed and sorted (auto-file/queue).
// Only endpoints + total distance are kept; the route itself is not stored.
var ENGINE_KEY=function(){return 'h38-mileage-engine-'+businessId()+'-'+(userId()||'anonymous');};
var MISSED_KEY=function(){return 'h38-mileage-missed-'+businessId()+'-'+(userId()||'anonymous');};
var engine={phase:'idle',anchor:null,trip:null,stillSince:0,lastFix:null};
var watch={id:null,blocked:false,error:''};
var manual={trip:null};

function engineLoad(){
  try{
    var raw=lsGet(ENGINE_KEY());
    if(raw){var parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')engine=parsed;}
  }catch(_){}
  if(!engine||typeof engine!=='object')engine={phase:'idle',anchor:null,trip:null,stillSince:0,lastFix:null};
}
function engineSave(){lsSet(ENGINE_KEY(),JSON.stringify(engine));}
function missedLoad(){
  try{var raw=lsGet(MISSED_KEY());var parsed=raw?JSON.parse(raw):[];return Array.isArray(parsed)?parsed:[];}catch(_){return [];}
}
function missedSave(list){lsSet(MISSED_KEY(),JSON.stringify(list||[]));}

function goodFix(position){
  if(!position||!position.coords)return null;
  var lat=Number(position.coords.latitude),lng=Number(position.coords.longitude);
  var acc=position.coords.accuracy==null?999:Number(position.coords.accuracy);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  if(acc>65)return null; // too fuzzy to measure a drive honestly
  return {lat:lat,lng:lng,acc:acc,at:Date.now(),speed:position.coords.speed==null?null:Number(position.coords.speed)};
}
function medianSpeedOk(fix){return fix.speed==null||fix.speed>=3.2;}

async function closeTrip(trip,note){
  // Run the suggestion engine, then auto-file the sure ones and queue
  // the rest with their suggestion attached (Rick's classification rule).
  var s=suggest(trip);
  var stamp=nowIso(),id=newId('TRIP');
  var record={
    'Trip ID':id,'Business ID':businessId(),'User ID':userId(),'User Name':userName(),
    'Source':trip.source||'auto',
    'Status':s.autoFile?'Auto-filed':'Unreviewed',
    'Classification':s.autoFile?s.classification:'',
    'Job ID':s.autoFile?s.jobId||'':'',
    'Customer ID':s.autoFile?s.customerId||'':'',
    'Purpose':'',
    'Started At':trip.startedAt,'Ended At':trip.endedAt,
    'Miles':Math.round(num(trip.miles)*10)/10,
    'Start Lat':trip.startLat||'','Start Lng':trip.startLng||'',
    'End Lat':trip.endLat||'','End Lng':trip.endLng||'',
    'Start Label':trip.startLabel||'','End Label':trip.endLabel||'',
    'Suggested Classification':s.classification||'',
    'Suggested Job ID':s.jobId||'',
    'Suggestion Reason':s.reason||'',
    'Suggestion Score':s.score||0,
    'Filed Place ID':s.autoFile?s.placeId||'':'',
    'Detection Note':note||'',
    'Created Time':stamp,'Updated Time':stamp,'Record Version':1
  };
  await saveTripRecord(record);
  if(s.autoFile){
    await learnFromTrip({
      classification:s.classification,jobId:s.jobId||'',customerId:s.customerId||'',
      startLat:trip.startLat,startLng:trip.startLng,endLat:trip.endLat,endLng:trip.endLng,
      startLabel:trip.startLabel,endLabel:trip.endLabel
    },{classification:s.classification,jobId:s.jobId||'',placeId:s.placeId||''});
  }
  scheduleDecorateSettled();
  return record;
}

function onFix(position){
  var fix=goodFix(position);
  if(!fix)return;
  engine.lastFix=fix;
  reportOwnerPosition(fix);
  // While a manual trip is open, accumulate its distance from live fixes.
  if(manual.trip){
    var last=manual.trip.lastFix;
    if(last){
      var segM=haversineM(last.lat,last.lng,fix.lat,fix.lng);
      var dt=(fix.at-last.at)/1000;
      if(segM>=8&&dt>0&&(segM/dt)<=55)manual.trip.miles+=segM/MILE;
    }
    manual.trip.lastFix=fix;
    manualSave();
  }
  if(!detectionEligible()){engineSave();return;}
  var now=fix.at;
  if(engine.phase==='idle'){
    if(!engine.anchor){
      engine.anchor={lat:fix.lat,lng:fix.lng,at:now};
    }else{
      var away=haversineM(engine.anchor.lat,engine.anchor.lng,fix.lat,fix.lng);
      if(away>120&&medianSpeedOk(fix)){
        engine.phase='driving';
        engine.trip={
          startedAt:new Date(engine.anchor.at).toISOString(),
          startLat:engine.anchor.lat,startLng:engine.anchor.lng,
          miles:away/MILE,lastLat:fix.lat,lastLng:fix.lng,lastAt:now,
          source:'auto'
        };
        engine.stillSince=0;
      }else if(away<=40){
        // Still parked; refresh the anchor slowly so drift doesn't creep.
        engine.anchor.at=now;
      }
    }
  }else if(engine.phase==='driving'&&engine.trip){
    var t=engine.trip;
    var seg=haversineM(t.lastLat,t.lastLng,fix.lat,fix.lng);
    var dtS=(now-t.lastAt)/1000;
    if(seg>=8&&dtS>0&&(seg/dtS)<=55){t.miles+=seg/MILE;t.lastLat=fix.lat;t.lastLng=fix.lng;t.lastAt=now;}
    var stillRef={lat:t.lastLat,lng:t.lastLng};
    if(haversineM(stillRef.lat,stillRef.lng,fix.lat,fix.lng)<25&&(fix.speed==null||fix.speed<0.6)){
      if(!engine.stillSince)engine.stillSince=now;
      if(now-engine.stillSince>=150000){
        // Sustained stillness: the drive ended where movement stopped.
        var endedAt=new Date(engine.stillSince).toISOString();
        var finished={
          startedAt:t.startedAt,endedAt:endedAt,
          startLat:t.startLat,startLng:t.startLng,endLat:t.lastLat,endLng:t.lastLng,
          miles:t.miles,source:'auto',
          startLabel:endpointLabel(t.startLat,t.startLng),endLabel:endpointLabel(t.lastLat,t.lastLng)
        };
        engine.phase='idle';
        engine.anchor={lat:t.lastLat,lng:t.lastLng,at:now};
        engine.trip=null;engine.stillSince=0;
        engineSave();
        if(finished.miles>=0.2){
          closeTrip(finished,'Detected while the Office was open on this phone.').catch(function(error){toast(text(error&&error.message||error),true);});
        }
        return;
      }
    }else{
      engine.stillSince=0;
    }
  }
  engineSave();
}

function startWatch(){
  if(watch.id!=null||watch.blocked)return false;
  if(typeof navigator==='undefined'||!navigator.geolocation||typeof navigator.geolocation.watchPosition!=='function')return false;
  if(typeof document!=='undefined'&&document.visibilityState!=='visible')return false;
  if(!enabled())return false;
  if(!recordingOn()||offDuty())return false;
  // The watch runs when detection is eligible OR a manual trip is open
  // (manual works anytime); fixes themselves re-check eligibility.
  if(!detectionEligible()&&!manual.trip)return false;
  try{
    watch.id=navigator.geolocation.watchPosition(onFix,function(error){
      watch.blocked=true;
      watch.error=error&&error.code===1
        ? 'Location is off for this phone, so automatic detection can\u2019t run. Manual Start Trip still works.'
        : 'Location is unavailable right now. Manual Start Trip still works.';
      stopWatch();
      scheduleDecorate();
    },{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
    return true;
  }catch(_){return false;}
}
function stopWatch(){
  if(watch.id!=null&&typeof navigator!=='undefined'&&navigator.geolocation&&typeof navigator.geolocation.clearWatch==='function'){
    try{navigator.geolocation.clearWatch(watch.id);}catch(_){}
  }
  watch.id=null;
}
function syncWatch(){
  if(!enabled()||!recordingOn()||offDuty()){stopWatch();return;}
  if(detectionEligible()||manual.trip)startWatch();else stopWatch();
}

// On open: settle an in-progress trip the app couldn't watch to the end,
// and notice a possible missed drive (parked anchor far behind us after
// a long gap). The missed drive is a prompt, never a fabricated record.
function settleOnOpen(){
  engineLoad();manualLoad();
  var now=Date.now();
  if(engine.phase==='driving'&&engine.trip){
    var lastAt=engine.trip.lastAt||0;
    if(now-lastAt>20*60000){
      var t=engine.trip;
      var finished={
        startedAt:t.startedAt,endedAt:new Date(lastAt).toISOString(),
        startLat:t.startLat,startLng:t.startLng,endLat:t.lastLat,endLng:t.lastLng,
        miles:t.miles,source:'auto',
        startLabel:endpointLabel(t.startLat,t.startLng),endLabel:endpointLabel(t.lastLat,t.lastLng)
      };
      engine.phase='idle';engine.anchor={lat:t.lastLat,lng:t.lastLng,at:now};engine.trip=null;engine.stillSince=0;engineSave();
      if(finished.miles>=0.2){
        closeTrip(finished,'The app was closed during this drive, so it ends at the last recorded point. Edit the miles if it went further.').catch(function(){});
      }
    }
  }
}
function checkMissedDrive(fix){
  if(!engine.anchor)return;
  var gap=Date.now()-engine.anchor.at;
  var away=haversineM(engine.anchor.lat,engine.anchor.lng,fix.lat,fix.lng);
  if(gap>20*60000&&away>500){
    var list=missedLoad();
    var anchorAt=engine.anchor.at;
    var dupe=list.some(function(item){return Math.abs(item.fromAt-anchorAt)<60000;});
    if(!dupe){
      list.push({
        id:newId('MISSED'),
        fromAt:anchorAt,toAt:Date.now(),
        fromLat:engine.anchor.lat,fromLng:engine.anchor.lng,
        toLat:fix.lat,toLng:fix.lng,
        fromLabel:endpointLabel(engine.anchor.lat,engine.anchor.lng),
        toLabel:endpointLabel(fix.lat,fix.lng),
        straightMiles:Math.round((away/MILE)*10)/10
      });
      missedSave(list);
      scheduleDecorate();
    }
    engine.anchor={lat:fix.lat,lng:fix.lng,at:Date.now()};
    engineSave();
  }
}

// ---------- manual trips ----------
var MANUAL_KEY=function(){return 'h38-mileage-manual-'+businessId()+'-'+(userId()||'anonymous');};
function manualSave(){lsSet(MANUAL_KEY(),manual.trip?JSON.stringify(manual.trip):null);}
function manualLoad(){
  try{var raw=lsGet(MANUAL_KEY());manual.trip=raw?JSON.parse(raw):null;}catch(_){manual.trip=null;}
}
function capturePositionOnce(){
  return new Promise(function(resolve){
    if(typeof navigator==='undefined'||!navigator.geolocation||typeof navigator.geolocation.getCurrentPosition!=='function'){resolve(null);return;}
    var settled=false;
    var finish=function(fix){if(!settled){settled=true;resolve(fix);}};
    try{
      navigator.geolocation.getCurrentPosition(function(position){finish(goodFix(position));},
        function(){finish(null);},{enableHighAccuracy:true,maximumAge:30000,timeout:12000});
    }catch(_){finish(null);}
    setTimeout(function(){finish(null);},13000);
  });
}
async function manualStart(){
  if(!enabled()){toast('Mileage Tracking is off for this business.',true);return;}
  if(manual.trip){toast('A manual trip is already running.');return;}
  var fix=await capturePositionOnce();
  manual.trip={
    startedAt:nowIso(),miles:0,
    startLat:fix?fix.lat:'',startLng:fix?fix.lng:'',
    lastFix:fix?{lat:fix.lat,lng:fix.lng,at:fix.at}:null
  };
  manualSave();syncWatch();scheduleDecorateSettled();
  toast(fix?'Trip started. Drive safe — end it whenever you arrive.':'Trip started without a location fix. You can type the miles when you sort it.');
}
async function manualEnd(){
  if(!manual.trip)return;
  var fix=await capturePositionOnce();
  var t=manual.trip;manual.trip=null;manualSave();
  if(fix&&t.lastFix){
    var seg=haversineM(t.lastFix.lat,t.lastFix.lng,fix.lat,fix.lng);
    if(seg>=8)t.miles+=seg/MILE;
  }
  var finished={
    startedAt:t.startedAt,endedAt:nowIso(),
    startLat:t.startLat,startLng:t.startLng,
    endLat:fix?fix.lat:t.startLat,endLng:fix?fix.lng:t.startLng,
    miles:t.miles,source:'manual',
    startLabel:t.startLat?endpointLabel(t.startLat,t.startLng):'',
    endLabel:fix?endpointLabel(fix.lat,fix.lng):(t.startLat?endpointLabel(t.startLat,t.startLng):'')
  };
  await closeTrip(finished,'Started and ended by hand'+(fix?'.':' — no location fix at the end, so check the miles.'));
  toast('Trip saved. Sort it whenever you\u2019re ready — nothing is filed until you say so, unless it\u2019s a sure match.');
  syncWatch();
}

// ---------- classification actions ----------
async function classifyTrip(row,choice){
  var before=tripObjectFromRow(row);
  var previous={
    classification:text(val(row,'Suggested Classification','suggestedClassification'))||(tripStatus(row)==='Auto-filed'?tripClass(row):''),
    jobId:text(val(row,'Suggested Job ID','suggestedJobId'))||(tripStatus(row)==='Auto-filed'?text(val(row,'Job ID','jobId')):''),
    placeId:text(val(row,'Filed Place ID','filedPlaceId'))
  };
  var stamp=nowIso();
  var updated=Object.assign({},row);
  updated['Status']='Classified';
  updated['Classification']=choice.classification;
  updated['Job ID']=choice.classification==='Business'?(choice.jobId||''):'';
  updated['Customer ID']=choice.classification==='Business'?(choice.customerId||''):'';
  if(choice.purpose!==undefined)updated['Purpose']=choice.purpose;
  if(choice.miles!==undefined&&choice.miles!==''&&Number.isFinite(Number(choice.miles))){
    updated['Miles']=Math.round(Number(choice.miles)*10)/10;
    updated['Miles Edited']=true;
  }
  updated['Classified At']=stamp;updated['Updated Time']=stamp;
  updated['Record Version']=num(val(row,'Record Version','recordVersion'))+1;
  await saveTripRecord(updated);
  await learnFromTrip({
    classification:choice.classification,
    jobId:updated['Job ID'],customerId:updated['Customer ID'],
    startLat:before.startLat,startLng:before.startLng,endLat:before.endLat,endLng:before.endLng,
    startLabel:before.startLabel,endLabel:before.endLabel
  },previous);
  scheduleDecorateSettled();
}
async function undoAutoFile(row){
  // Send an auto-filed trip back to the review queue and mark the place
  // that drove the filing as corrected-away, so it can't auto-file the
  // same wrong way again without fresh confirmations.
  var stamp=nowIso();
  var updated=Object.assign({},row);
  updated['Status']='Unreviewed';updated['Classification']='';updated['Job ID']='';updated['Customer ID']='';
  updated['Updated Time']=stamp;updated['Record Version']=num(val(row,'Record Version','recordVersion'))+1;
  await saveTripRecord(updated);
  var placeId=text(val(row,'Filed Place ID','filedPlaceId'));
  if(placeId){
    var place=myPlaces().filter(function(p){return placeIdOf(p)===placeId;})[0];
    if(place){
      var placeUpdated=Object.assign({},place);
      placeUpdated['Times Corrected Away']=num(val(place,'Times Corrected Away','timesCorrectedAway'))+1;
      placeUpdated['Updated Time']=stamp;placeUpdated['Record Version']=num(val(place,'Record Version','recordVersion'))+1;
      await savePlaceRecord(placeUpdated);
    }
  }
  scheduleDecorateSettled();
}
async function dismissTrip(row){
  var stamp=nowIso();
  var updated=Object.assign({},row);
  updated['Status']='Dismissed';updated['Updated Time']=stamp;
  updated['Record Version']=num(val(row,'Record Version','recordVersion'))+1;
  await saveTripRecord(updated);
  scheduleDecorateSettled();
}
async function confirmMissedDrive(item,editedMiles){
  var finished={
    startedAt:new Date(item.fromAt).toISOString(),endedAt:new Date(item.toAt).toISOString(),
    startLat:item.fromLat,startLng:item.fromLng,endLat:item.toLat,endLng:item.toLng,
    miles:editedMiles!==''&&Number.isFinite(Number(editedMiles))?Number(editedMiles):item.straightMiles,
    source:'manual',startLabel:item.fromLabel,endLabel:item.toLabel
  };
  await closeTrip(finished,'Added from a missed-drive prompt. The distance started as a straight-line estimate — the driver confirmed it.');
  missedSave(missedLoad().filter(function(x){return x.id!==item.id;}));
  scheduleDecorateSettled();
}
function dismissMissedDrive(item){
  missedSave(missedLoad().filter(function(x){return x.id!==item.id;}));
  scheduleDecorate();
}

// ---------- monthly totals ----------
function monthKeyOf(iso){return text(iso).slice(0,7);}
function monthlyTotals(monthKey){
  var mine={business:0,personal:0,businessTrips:0,personalTrips:0,unreviewed:0};
  var team={};
  allTrips().forEach(function(row){
    if(tripStatus(row)==='Dismissed')return;
    if(monthKeyOf(val(row,'Started At','startedAt'))!==monthKey)return;
    var uid=text(val(row,'User ID','userId'));
    var miles=num(val(row,'Miles','miles'));
    if(uid===userId()){
      if(tripStatus(row)==='Unreviewed')mine.unreviewed++;
      else if(tripClass(row)==='Business'){mine.business+=miles;mine.businessTrips++;}
      else if(tripClass(row)==='Personal'){mine.personal+=miles;mine.personalTrips++;}
    }
    if(isOwnerAdmin()&&uid!==userId()){
      // Privacy: owners total BUSINESS miles for the team. Personal and
      // unreviewed trip details never leave the driver's own views; only
      // the awaiting-review COUNT is shared (no where/when/miles).
      if(!team[uid])team[uid]={name:text(val(row,'User Name','userName'))||'Team member',business:0,businessTrips:0,unreviewed:0};
      if(tripStatus(row)==='Unreviewed')team[uid].unreviewed++;
      else if(tripClass(row)==='Business'){team[uid].business+=miles;team[uid].businessTrips++;}
    }
  });
  mine.business=Math.round(mine.business*10)/10;
  mine.personal=Math.round(mine.personal*10)/10;
  Object.keys(team).forEach(function(k){team[k].business=Math.round(team[k].business*10)/10;});
  return {mine:mine,team:team};
}

// ---------- presentation ----------
var styleInjected=false;
function ensureStyle(){
  if(styleInjected||typeof document==='undefined')return;
  styleInjected=true;
  var css=[
    '.h38-mileage-card,.h38-mileage-section{margin:0 0 16px}',
    '.h38-mileage-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}',
    '.h38-mileage-head h2{margin:0}',
    '.h38-mileage-kicker{font-size:.7rem;font-weight:900;letter-spacing:.08em;color:var(--blue,#174a70)}',
    '.h38-mileage-note{color:var(--muted,#5f6f7d);font-size:.9rem}',
    '.h38-mileage-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.h38-mileage-actions button,.h38-mileage-trip button{min-height:44px}',
    '.h38-mileage-status{display:flex;gap:8px;align-items:center;border:1px solid #9ccc9c;background:#edf8ed;border-radius:10px;padding:10px 12px;font-weight:700}',
    '.h38-mileage-status.off{border-color:#ddd;background:#f6f6f6}',
    '.h38-mileage-status .dot{width:11px;height:11px;border-radius:50%;background:#1d7a46;box-shadow:0 0 0 4px rgba(29,122,70,.15)}',
    '.h38-mileage-status.off .dot{background:#999;box-shadow:none}',
    '.h38-mileage-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}',
    '.h38-mileage-tabs button{border:1px solid var(--line,#d6e0e8);background:#fff;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer}',
    '.h38-mileage-tabs button.active{background:var(--blue,#174a70);color:#fff;border-color:var(--blue,#174a70)}',
    '.h38-mileage-trip{border-top:1px solid var(--line,#d6e0e8);padding:12px 0}',
    '.h38-mileage-trip:first-of-type{border-top:0}',
    '.h38-mileage-trip-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}',
    '.h38-mileage-suggest{border:1px dashed #9db8cc;background:#f2f8fc;border-radius:10px;padding:10px 12px;margin-top:8px}',
    '.h38-mileage-editor{border:1px solid var(--line,#d6e0e8);border-radius:10px;padding:12px;margin-top:8px;background:#fbfcfe}',
    '.h38-mileage-editor label{display:block;font-size:.82rem;font-weight:700;margin:8px 0 4px}',
    '.h38-mileage-editor select,.h38-mileage-editor input{width:100%;min-height:44px}',
    '.h38-mileage-badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.75rem;font-weight:800;background:#eef3f7;color:#174a70}',
    '.h38-mileage-badge.auto{background:#e7f4e9;color:#1d7a46}',
    '.h38-mileage-badge.personal{background:#f3eafd;color:#5b3a8e}',
    '.h38-mileage-table{width:100%;border-collapse:collapse}',
    '.h38-mileage-table td,.h38-mileage-table th{padding:6px 4px;border-bottom:1px solid var(--line,#e3ebf1);text-align:left;font-size:.92rem}',
    '.h38-mileage-table td.num,.h38-mileage-table th.num{text-align:right}'
  ].join('\n');
  var style=document.createElement('style');
  style.setAttribute('data-h38-mileage','1');
  style.textContent=css;
  document.head.appendChild(style);
}
var ui={tab:'review',month:monthKeyOf(nowIso()),editorFor:'',teamView:false,placesOpen:false};

function myUnreviewed(){return myTrips().filter(function(row){return tripStatus(row)==='Unreviewed';});}
function myAutoFiled(){return myTrips().filter(function(row){return tripStatus(row)==='Auto-filed';});}
function myFiled(){
  return myTrips().filter(function(row){return isFiled(row);})
    .sort(function(a,b){return new Date(val(b,'Started At','startedAt'))-new Date(val(a,'Started At','startedAt'));});
}
function sortByStart(rows){
  return rows.slice().sort(function(a,b){return new Date(val(a,'Started At','startedAt'))-new Date(val(b,'Started At','startedAt'));});
}
function tripRouteLine(row){
  var start=text(val(row,'Start Label','startLabel'))||'Start';
  var end=text(val(row,'End Label','endLabel'))||'End';
  return start+' \u2192 '+end;
}
function jobOptions(selectedId){
  var jobs=records('jobs').slice(0,200);
  var out='<option value="">No job</option>';
  jobs.forEach(function(job){
    var id=rowId(job,'Job ID','jobId');
    out+='<option value="'+esc(id)+'"'+(id===selectedId?' selected':'')+'>'+esc(jobLabel(job))+'</option>';
  });
  return out;
}
function editorHtml(row){
  var id=tripIdOf(row);
  var classification=tripClass(row)||text(val(row,'Suggested Classification','suggestedClassification'))||'Business';
  var jobId=text(val(row,'Job ID','jobId'))||text(val(row,'Suggested Job ID','suggestedJobId'))||'';
  return '<div class="h38-mileage-editor" data-h38-mileage-editor="'+esc(id)+'">'+
    '<label>Sort this trip as</label>'+
    '<select data-h38-mileage-field="classification"><option value="Business"'+(classification==='Business'?' selected':'')+'>Business</option><option value="Personal"'+(classification==='Personal'?' selected':'')+'>Personal</option></select>'+
    '<label>Job (business trips)</label>'+
    '<select data-h38-mileage-field="jobId">'+jobOptions(jobId)+'</select>'+
    '<label>Purpose (optional)</label>'+
    '<input data-h38-mileage-field="purpose" value="'+esc(text(val(row,'Purpose','purpose')))+'" placeholder="Supply run, estimate visit\u2026">'+
    '<label>Miles</label>'+
    '<input data-h38-mileage-field="miles" type="number" step="0.1" min="0" value="'+esc(fmtMiles(val(row,'Miles','miles')))+'">'+
    '<div class="h38-mileage-actions">'+
    '<button type="button" data-h38-mileage-save="'+esc(id)+'">Save</button>'+
    '<button type="button" class="secondary" data-h38-mileage-cancel="'+esc(id)+'">Cancel</button>'+
    (tripStatus(row)==='Unreviewed'?'<button type="button" class="secondary" data-h38-mileage-dismiss="'+esc(id)+'">Not a trip — remove</button>':'')+
    '</div></div>';
}
function suggestionHtml(row){
  var classification=text(val(row,'Suggested Classification','suggestedClassification'));
  if(!classification)return '';
  var jobId=text(val(row,'Suggested Job ID','suggestedJobId'));
  var job=jobById(jobId);
  var reason=text(val(row,'Suggestion Reason','suggestionReason'));
  return '<div class="h38-mileage-suggest"><strong>Looks like: '+esc(classification)+(job?' — '+esc(jobLabel(job)):'')+'</strong>'+
    (reason?'<br><small>'+esc(reason)+'</small>':'')+
    '<div class="h38-mileage-actions"><button type="button" data-h38-mileage-confirm="'+esc(tripIdOf(row))+'">Confirm</button>'+
    '<button type="button" class="secondary" data-h38-mileage-change="'+esc(tripIdOf(row))+'">Change</button></div></div>';
}
function tripRowHtml(row,mode){
  var id=tripIdOf(row);
  var classification=tripClass(row);
  var job=jobById(text(val(row,'Job ID','jobId')));
  var badge=mode==='auto'
    ?'<span class="h38-mileage-badge auto">Auto-filed</span>'
    :(classification==='Personal'?'<span class="h38-mileage-badge personal">Personal</span>':'<span class="h38-mileage-badge">Business</span>');
  var html='<div class="h38-mileage-trip" data-h38-mileage-trip="'+esc(id)+'">'+
    '<div class="h38-mileage-trip-top"><div><strong>'+esc(fmtDay(val(row,'Started At','startedAt')))+' · '+esc(fmtTime(val(row,'Started At','startedAt')))+'–'+esc(fmtTime(val(row,'Ended At','endedAt')))+'</strong><br>'+
    '<small>'+esc(tripRouteLine(row))+' · '+esc(fmtMiles(val(row,'Miles','miles')))+' mi'+(text(val(row,'Source','source'))==='manual'?' · added by hand':'')+'</small></div>'+
    '<div>'+(mode==='review'?'':badge)+'</div></div>';
  if(mode==='auto'||mode==='log'){
    if(job)html+='<small>Job: '+esc(jobLabel(job))+'</small>';
    if(text(val(row,'Purpose','purpose')))html+='<br><small>'+esc(text(val(row,'Purpose','purpose')))+'</small>';
    if(text(val(row,'Suggestion Reason','suggestionReason')))html+='<br><small>Why: '+esc(text(val(row,'Suggestion Reason','suggestionReason')))+'</small>';
  }
  if(mode==='review'){
    html+=suggestionHtml(row);
    html+='<div class="h38-mileage-actions">'+
      (text(val(row,'Suggested Classification','suggestedClassification'))?'':'<button type="button" data-h38-mileage-change="'+esc(id)+'">Sort this trip</button>')+
      '<button type="button" class="secondary" data-h38-mileage-dismiss="'+esc(id)+'">Not a trip</button></div>';
  }
  if(mode==='auto'){
    html+='<div class="h38-mileage-actions"><button type="button" class="secondary" data-h38-mileage-undo="'+esc(id)+'">Undo — back to review</button>'+
      '<button type="button" class="secondary" data-h38-mileage-change="'+esc(id)+'">Fix it</button></div>';
  }
  if(mode==='log'){
    html+='<div class="h38-mileage-actions"><button type="button" class="secondary" data-h38-mileage-change="'+esc(id)+'">Fix</button></div>';
  }
  if(ui.editorFor===id)html+=editorHtml(row);
  return html+'</div>';
}
function missedHtml(){
  var list=missedLoad();
  if(!list.length)return '';
  return list.map(function(item){
    return '<div class="h38-mileage-trip"><div class="h38-mileage-trip-top"><div><strong>Missed a drive?</strong><br>'+
      '<small>'+esc(fmtDay(new Date(item.fromAt).toISOString()))+' · '+esc(item.fromLabel)+' \u2192 '+esc(item.toLabel)+'</small></div>'+
      '<span class="h38-mileage-badge">App was closed</span></div>'+
      '<p class="h38-mileage-note">The Office was closed, so this drive wasn\u2019t recorded. If you drove it, add it with the real miles (the estimate below is straight-line).</p>'+
      '<div class="h38-mileage-actions"><input type="number" step="0.1" min="0" value="'+esc(item.straightMiles)+'" data-h38-mileage-missed-miles="'+esc(item.id)+'" style="width:110px;min-height:44px" aria-label="Miles">'+
      '<button type="button" data-h38-mileage-missed-add="'+esc(item.id)+'">Add as a trip</button>'+
      '<button type="button" class="secondary" data-h38-mileage-missed-dismiss="'+esc(item.id)+'">Dismiss</button></div></div>';
  }).join('');
}
function statusBlockHtml(){
  var on=recordingOn(),duty=offDuty();
  var active=on&&!duty&&(isOwnerAdmin()||clockedIn()||!!manual.trip);
  return '<div class="h38-mileage-status'+(active?'':' off')+'"><span class="dot"></span><span>'+
    (manual.trip?'Trip running — started '+esc(fmtTime(manual.trip.startedAt))+', '+esc(fmtMiles(manual.trip.miles))+' mi so far.'
      :esc(policyLine()))+'</span></div>'+
    '<div class="h38-mileage-actions">'+
    (manual.trip
      ?'<button type="button" data-h38-mileage-manual-end>End trip</button>'
      :'<button type="button" data-h38-mileage-manual-start>Start trip</button>')+
    (on?'<button type="button" class="secondary" data-h38-mileage-stop-day>Stop Day</button>':'<button type="button" data-h38-mileage-start-day>Start Day</button>')+
    (duty?'<button type="button" data-h38-mileage-duty-off>Off duty: On</button>':'<button type="button" class="secondary" data-h38-mileage-duty-on>Go off duty</button>')+
    '</div>'+
    (watch.error?'<p class="h38-mileage-note">'+esc(watch.error)+'</p>':'')+
    nativeStatusHtml();
}
function totalsHtml(){
  var totals=monthlyTotals(ui.month);
  var rate=ratePerMile();
  var html='<label style="display:block;font-size:.82rem;font-weight:700;margin:8px 0 4px">Month</label>'+
    '<input type="month" data-h38-mileage-month value="'+esc(ui.month)+'" style="min-height:44px">'+
    '<table class="h38-mileage-table"><tr><th></th><th class="num">Business</th><th class="num">Personal</th></tr>'+
    '<tr><td>Your miles</td><td class="num">'+esc(fmtMiles(totals.mine.business))+' mi ('+totals.mine.businessTrips+')</td><td class="num">'+esc(fmtMiles(totals.mine.personal))+' mi ('+totals.mine.personalTrips+')</td></tr></table>'+
    (rate>0
      ?'<p class="h38-mileage-note">Reimbursement at $'+esc(rate.toFixed(2))+'/mi: <strong>$'+esc((totals.mine.business*rate).toFixed(2))+'</strong> for your business miles this month.</p>'
      :'<p class="h38-mileage-note">No reimbursement rate set'+(isOwnerAdmin()?' yet — set one below.':' yet.')+'</p>')+
    (isOwnerAdmin()?ownerRateFormHtml(rate):'');
  if(isOwnerAdmin()){
    var keys=Object.keys(totals.team);
    if(keys.length){
      html+='<h3 style="margin:14px 0 6px">Team business miles</h3><table class="h38-mileage-table"><tr><th>Person</th><th class="num">Business miles</th><th class="num">To review</th></tr>'+
        keys.map(function(k){var t=totals.team[k];return '<tr><td>'+esc(t.name)+'</td><td class="num">'+esc(fmtMiles(t.business))+' mi</td><td class="num">'+t.unreviewed+'</td></tr>';}).join('')+
        '</table><p class="h38-mileage-note">Personal trips stay private to each driver — only business miles and the count of trips waiting for review show here.</p>';
    }
  }
  return html;
}
function ownerRateFormHtml(rate){
  return '<div class="h38-mileage-editor"><label>Reimbursement rate ($ per mile) — owner setting, blank means no rate</label>'+
    '<input type="number" step="0.01" min="0" data-h38-mileage-rate value="'+(rate>0?esc(rate):'')+'" placeholder="e.g. 0.67">'+
    '<div class="h38-mileage-actions"><button type="button" data-h38-mileage-rate-save>Save rate</button></div></div>';
}
function placesHtml(){
  var places=myPlaces();
  if(!places.length)return '<p class="h38-mileage-note">No saved places yet. Places are learned as you sort trips — customer sites, the shop, home.</p>';
  return places.map(function(place){
    var id=placeIdOf(place);
    return '<div class="h38-mileage-trip"><div class="h38-mileage-trip-top"><div><strong>'+esc(text(val(place,'Label','label'))||'Saved place')+'</strong><br>'+
      '<small>'+esc(text(val(place,'Classification','classification'))||'—')+' · filed '+num(val(place,'Times Confirmed','timesConfirmed'))+'×'+(num(val(place,'Times Corrected Away','timesCorrectedAway'))?' · corrected '+num(val(place,'Times Corrected Away','timesCorrectedAway'))+'×':'')+'</small></div></div>'+
      '<label style="display:block;font-size:.82rem;font-weight:700;margin:8px 0 4px">Place name</label>'+
      '<input type="text" data-h38-mileage-place-label="'+esc(id)+'" value="'+esc(text(val(place,'Label','label')))+'" style="width:100%;min-height:44px">'+
      '<div class="h38-mileage-actions"><button type="button" class="secondary" data-h38-mileage-place-save="'+esc(id)+'">Save name</button></div></div>';
  }).join('');
}
function sectionHtml(){
  var review=sortByStart(myUnreviewed());
  var auto=sortByStart(myAutoFiled()).reverse();
  var filed=myFiled().slice(0,50);
  var tabs=[['review','To review ('+(review.length+missedLoad().length)+')'],['auto','Auto-filed ('+auto.length+')'],['log','Mileage log'],['totals','Totals'],['places','Places']];
  var body='';
  if(ui.tab==='review')body=(missedHtml()+(review.length?review.map(function(row){return tripRowHtml(row,'review');}).join(''):'<p class="h38-mileage-note">Nothing waiting. New drives land here to sort — the sure ones file themselves.</p>'));
  else if(ui.tab==='auto')body=auto.length?auto.map(function(row){return tripRowHtml(row,'auto');}).join(''):'<p class="h38-mileage-note">Nothing auto-filed yet. When a drive matches your schedule or a place you always file the same way, it files itself and shows up here — always fixable.</p>';
  else if(ui.tab==='log')body=(filed.length?filed.map(function(row){return tripRowHtml(row,'log');}).join(''):'<p class="h38-mileage-note">No filed trips yet. This is your mileage log: date, route, miles, and what the drive was for.</p>')+(ui.teamView&&isOwnerAdmin()?teamTripsHtml():'');
  else if(ui.tab==='totals')body=totalsHtml();
  else if(ui.tab==='places')body=placesHtml();
  return '<div class="h38-mileage-head"><div><span class="h38-mileage-kicker">MILEAGE (PHONE)</span><h2>Mileage</h2>'+
    '<p class="h38-mileage-note">Press Start Day and every drive records itself — with the H38 Office app, even while the app is closed — until you press Stop Day. Trips are sorted later; nothing interrupts the drive. '+(isOwnerAdmin()?'':'Trips are recorded while you\u2019re clocked in. ')+'This is a mileage log: your trips stay yours.'+(isOwnerAdmin()?' Owner phones also show under Find my phone below.':'')+'</p></div></div>'+
    statusBlockHtml()+
    '<div class="h38-mileage-tabs" role="group" aria-label="Mileage views">'+tabs.map(function(tab){
      return '<button type="button" data-h38-mileage-tab="'+tab[0]+'" class="'+(ui.tab===tab[0]?'active':'')+'">'+esc(tab[1])+'</button>';
    }).join('')+
    (isOwnerAdmin()?'<button type="button" data-h38-mileage-team class="'+(ui.teamView?'active':'')+'">Team business trips</button>':'')+
    '</div>'+body+findMyPhoneHtml();
}
function teamTripsHtml(){
  var rows=allTrips().filter(function(row){
    return text(val(row,'User ID','userId'))!==userId()&&isFiled(row)&&tripClass(row)==='Business';
  }).sort(function(a,b){return new Date(val(b,'Started At','startedAt'))-new Date(val(a,'Started At','startedAt'));}).slice(0,50);
  if(!rows.length)return '<p class="h38-mileage-note">No team business trips filed yet.</p>';
  return '<h3 style="margin:14px 0 6px">Team business trips</h3>'+rows.map(function(row){
    var job=jobById(text(val(row,'Job ID','jobId')));
    return '<div class="h38-mileage-trip"><div class="h38-mileage-trip-top"><div><strong>'+esc(text(val(row,'User Name','userName'))||'Team member')+'</strong><br>'+
      '<small>'+esc(fmtDay(val(row,'Started At','startedAt')))+' · '+esc(tripRouteLine(row))+' · '+esc(fmtMiles(val(row,'Miles','miles')))+' mi'+(job?' · '+esc(jobLabel(job)):'')+'</small></div>'+
      '<span class="h38-mileage-badge">Business</span></div></div>';
  }).join('');
}
function bindSection(root){
  root.querySelectorAll('[data-h38-mileage-tab]').forEach(function(button){
    button.onclick=function(){ui.tab=button.dataset.h38MileageTab;ui.editorFor='';scheduleDecorate();};
  });
  var team=root.querySelector('[data-h38-mileage-team]');
  if(team)team.onclick=function(){ui.teamView=!ui.teamView;if(ui.teamView)ui.tab='log';scheduleDecorate();};
  root.querySelectorAll('[data-h38-mileage-confirm]').forEach(function(button){
    button.onclick=async function(){
      var row=myTrips().filter(function(r){return tripIdOf(r)===button.dataset.h38MileageConfirm;})[0];
      if(!row)return;
      button.disabled=true;
      try{
        var suggestedJob=jobById(text(val(row,'Suggested Job ID','suggestedJobId')));
        await classifyTrip(row,{
          classification:text(val(row,'Suggested Classification','suggestedClassification'))||'Business',
          jobId:text(val(row,'Suggested Job ID','suggestedJobId')),
          customerId:suggestedJob?text(val(suggestedJob,'Customer ID','customerId')):''});
        toast('Trip filed.');
      }catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  root.querySelectorAll('[data-h38-mileage-change]').forEach(function(button){
    button.onclick=function(){ui.editorFor=button.dataset.h38MileageChange;scheduleDecorate();};
  });
  root.querySelectorAll('[data-h38-mileage-cancel]').forEach(function(button){
    button.onclick=function(){ui.editorFor='';scheduleDecorate();};
  });
  root.querySelectorAll('[data-h38-mileage-save]').forEach(function(button){
    button.onclick=async function(){
      var id=button.dataset.h38MileageSave;
      var editor=root.querySelector('[data-h38-mileage-editor="'+id+'"]');
      var row=myTrips().filter(function(r){return tripIdOf(r)===id;})[0];
      if(!editor||!row)return;
      var classification=editor.querySelector('[data-h38-mileage-field="classification"]').value;
      var jobId=editor.querySelector('[data-h38-mileage-field="jobId"]').value;
      var job=jobById(jobId);
      button.disabled=true;
      try{
        await classifyTrip(row,{
          classification:classification,jobId:jobId,
          customerId:job?text(val(job,'Customer ID','customerId')):'',
          purpose:editor.querySelector('[data-h38-mileage-field="purpose"]').value,
          miles:editor.querySelector('[data-h38-mileage-field="miles"]').value});
        ui.editorFor='';toast('Trip filed.');
      }catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  root.querySelectorAll('[data-h38-mileage-dismiss]').forEach(function(button){
    button.onclick=async function(){
      var row=myTrips().filter(function(r){return tripIdOf(r)===button.dataset.h38MileageDismiss;})[0];
      if(!row)return;
      button.disabled=true;
      try{await dismissTrip(row);ui.editorFor='';toast('Removed from your trips.');}
      catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  root.querySelectorAll('[data-h38-mileage-undo]').forEach(function(button){
    button.onclick=async function(){
      var row=myTrips().filter(function(r){return tripIdOf(r)===button.dataset.h38MileageUndo;})[0];
      if(!row)return;
      button.disabled=true;
      try{await undoAutoFile(row);ui.tab='review';toast('Back in your review list.');}
      catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  root.querySelectorAll('[data-h38-mileage-missed-add]').forEach(function(button){
    button.onclick=async function(){
      var item=missedLoad().filter(function(x){return x.id===button.dataset.h38MileageMissedAdd;})[0];
      if(!item)return;
      var input=root.querySelector('[data-h38-mileage-missed-miles="'+item.id+'"]');
      button.disabled=true;
      try{await confirmMissedDrive(item,input?input.value:'');toast('Trip added. Sort it whenever you\u2019re ready.');}
      catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  root.querySelectorAll('[data-h38-mileage-missed-dismiss]').forEach(function(button){
    button.onclick=function(){
      var item=missedLoad().filter(function(x){return x.id===button.dataset.h38MileageMissedDismiss;})[0];
      if(item)dismissMissedDrive(item);
    };
  });
  root.querySelectorAll('[data-h38-mileage-place-save]').forEach(function(button){
    button.onclick=async function(){
      var id=button.dataset.h38MileagePlaceSave;
      var input=root.querySelector('[data-h38-mileage-place-label="'+id+'"]');
      var place=myPlaces().filter(function(p){return placeIdOf(p)===id;})[0];
      if(!place||!input)return;
      var updated=Object.assign({},place);
      updated['Label']=input.value;updated['Updated Time']=nowIso();
      updated['Record Version']=num(val(place,'Record Version','recordVersion'))+1;
      button.disabled=true;
      try{await savePlaceRecord(updated);toast('Place renamed.');}
      catch(error){toast(text(error&&error.message||error),true);}
      button.disabled=false;scheduleDecorateSettled();
    };
  });
  var monthInput=root.querySelector('[data-h38-mileage-month]');
  if(monthInput)monthInput.onchange=function(){if(monthInput.value)ui.month=monthInput.value;scheduleDecorate();};
  var rateSave=root.querySelector('[data-h38-mileage-rate-save]');
  if(rateSave)rateSave.onclick=async function(){
    var input=root.querySelector('[data-h38-mileage-rate]');
    var rate=input?Number(input.value):0;
    if(!Number.isFinite(rate)||rate<0){toast('Enter a rate like 0.67, or clear it for no rate.',true);return;}
    rateSave.disabled=true;
    try{await saveRate(rate);toast(rate>0?'Reimbursement rate saved.':'Reimbursement rate cleared.');}
    catch(error){toast(text(error&&error.message||error),true);}
    rateSave.disabled=false;scheduleDecorateSettled();
  };
  bindStatusButtons(root);
}
function bindStatusButtons(root){
  var start=root.querySelector('[data-h38-mileage-manual-start]');
  if(start)start.onclick=function(){manualStart();};
  var end=root.querySelector('[data-h38-mileage-manual-end]');
  if(end)end.onclick=function(){manualEnd();};
  var startDayBtn=root.querySelector('[data-h38-mileage-start-day]');
  if(startDayBtn)startDayBtn.onclick=function(){startDay();toast('Day started — every drive is recorded until you tap Stop Day.');scheduleDecorateSettled();};
  var stopDayBtn=root.querySelector('[data-h38-mileage-stop-day]');
  if(stopDayBtn)stopDayBtn.onclick=function(){stopDay();toast('Day stopped — recording is off.');scheduleDecorateSettled();};
  var dutyOn=root.querySelector('[data-h38-mileage-duty-on]');
  if(dutyOn)dutyOn.onclick=function(){setOffDuty(true);toast('Off duty — trips are not being recorded.');scheduleDecorateSettled();};
  var dutyOff=root.querySelector('[data-h38-mileage-duty-off]');
  if(dutyOff)dutyOff.onclick=function(){setOffDuty(false);toast('Back on duty.');syncWatch();scheduleDecorateSettled();};
  var nativeSetup=root.querySelector('[data-h38-mileage-native-setup]');
  if(nativeSetup)nativeSetup.onclick=function(){var b=nativeBridge();if(b){try{b.openSetup();}catch(_){}}};
  var nativeSettings=root.querySelector('[data-h38-mileage-native-settings]');
  if(nativeSettings)nativeSettings.onclick=function(){var b=nativeBridge();if(b){try{b.openAppSettings();}catch(_){}}};
}
async function saveRate(rate){
  if(typeof w.queueOperation!=='function')throw new Error('Open a business first.');
  var existing=settingsRow();
  var id=existing?rowId(existing,'Settings ID','settingsId','Mileage Settings ID'):'';
  if(!id)id='MSET-'+businessId().slice(0,8);
  var stamp=nowIso();
  var record=Object.assign({},existing||{},{
    'Settings ID':id,'Business ID':businessId(),
    'Rate Per Mile':rate>0?rate:'',
    'Updated Time':stamp,'Record Version':num(existing?val(existing,'Record Version','recordVersion'):0)+1
  });
  if(!existing)record['Created Time']=stamp;
  await w.queueOperation('SAVE_MILEAGE_SETTINGS','Mileage Settings',id,{settingsId:id,ratePerMile:rate},
    {collection:SETTINGS_COLLECTION,record:record,idKeys:['Settings ID']});
  try{w.dispatchEvent(new CustomEvent('h38:business-snapshot-updated',{detail:{source:'mileage',collection:SETTINGS_COLLECTION}}));}catch(_){}
}

// ---------- find my phone (owners only) ----------
// While an owner's tracking is on, their phone reports its latest
// location into the crewPositions store — one row per owner phone,
// updated in place (record id OWNERPOS-<userId>): from this web watch
// while the Office is open, and from the native app's heartbeat while
// the background runner is on (SyncEngine.reportOwnerPosition). Owners
// see their own phones at the bottom of this section ("Find my phone"):
// last-seen time + a map link, falling back to the end of their last
// trip when no position report exists yet. Employee phones are never
// reported by this path and never shown here.
var POSITION_COLLECTION='crewPositions';
var ownerPosReport={at:0,lat:0,lng:0};
function reportOwnerPosition(fix){
  if(!fix||!isOwnerAdmin()||!enabled()||!recordingOn()||offDuty())return;
  if(typeof w.queueOperation!=='function')return;
  var nowMs=Date.now();
  var moved=ownerPosReport.at?haversineM(ownerPosReport.lat,ownerPosReport.lng,fix.lat,fix.lng):Infinity;
  if(nowMs-ownerPosReport.at<10*60000&&moved<75)return;
  ownerPosReport={at:nowMs,lat:fix.lat,lng:fix.lng};
  var stamp=new Date(nowMs).toISOString();
  var id='OWNERPOS-'+userId();
  var record={'Crew Position ID':id,'Business ID':businessId(),'User ID':userId(),'User Name':userName(),
    'Lat':fix.lat,'Lng':fix.lng,'Accuracy':Math.round(fix.acc||0),'Timestamp':stamp,'Created Time':stamp,
    'Record Version':1,'Owner Phone':true,'Source':nativeBridge()?'owner-phone-app':'owner-phone-web'};
  try{
    w.queueOperation('SAVE_CREW_POSITION','Crew Position',id,
      {positionId:id,userId:userId(),lat:fix.lat,lng:fix.lng,accuracy:record.Accuracy,timestamp:stamp,ownerPhone:true},
      {collection:POSITION_COLLECTION,record:record,idKeys:['Crew Position ID']}).catch(function(){});
  }catch(_){}
}
function ownerUsers(){
  var map={};
  records('users').forEach(function(row){
    var role=text(val(row,'Role ID','roleId','Role','role')).toLowerCase();
    if(role==='owner'||role==='administrator'||role==='admin'){
      var id=text(val(row,'User ID','userId'));
      if(id)map[id]={id:id,name:text(val(row,'Display Name','displayName','Name','name','Email','email'))||'Owner'};
    }
  });
  if(isOwnerAdmin()&&userId())map[userId()]={id:userId(),name:userName()};
  return map;
}
function ownerPhones(){
  var owners=ownerUsers();
  var phones={};
  Object.keys(owners).forEach(function(id){phones[id]={id:id,name:owners[id].name,pos:null,tripEnd:null};});
  records(POSITION_COLLECTION).forEach(function(row){
    var flag=val(row,'Owner Phone','ownerPhone');
    if(!(flag===true||flag==='true'))return;
    var id=text(val(row,'User ID','userId'));
    if(!phones[id])return;
    var stamp=text(val(row,'Timestamp','timestamp'));
    if(!phones[id].pos||stamp>phones[id].pos.stamp){
      phones[id].pos={lat:num(val(row,'Lat','lat')),lng:num(val(row,'Lng','lng')),stamp:stamp};
      var nm=text(val(row,'User Name','userName'));if(nm)phones[id].name=nm;
    }
  });
  allTrips().forEach(function(row){
    var id=text(val(row,'User ID','userId'));
    if(!phones[id])return;
    var endLat=num(val(row,'End Lat','endLat')),endLng=num(val(row,'End Lng','endLng'));
    if(!endLat||!endLng)return;
    var ended=text(val(row,'Ended At','endedAt'));
    if(!phones[id].tripEnd||ended>phones[id].tripEnd.stamp)phones[id].tripEnd={lat:endLat,lng:endLng,stamp:ended};
  });
  return Object.keys(phones).map(function(id){return phones[id];})
    .sort(function(a,b){return a.name.localeCompare(b.name);});
}
function findMyPhoneHtml(){
  if(!isOwnerAdmin())return '';
  var phones=ownerPhones();
  var rowsHtml=phones.map(function(phone){
    var seen=phone.pos||phone.tripEnd;
    if(!seen||!seen.lat||!seen.lng){
      return '<div class="h38-mileage-trip"><div class="h38-mileage-trip-top"><div><strong>'+esc(phone.name)+'</strong><br>'+
        '<small>No location yet — it shows up after this phone\u2019s first drive, or while the Office is open on it.</small></div></div></div>';
    }
    var whenText=fmtDay(seen.stamp)+' · '+fmtTime(seen.stamp);
    var link='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(seen.lat+','+seen.lng);
    return '<div class="h38-mileage-trip"><div class="h38-mileage-trip-top"><div><strong>'+esc(phone.name)+'</strong><br>'+
      '<small>Last seen '+esc(whenText)+(phone.pos?'':' (end of last trip)')+'</small></div>'+
      '<a href="'+link+'" target="_blank" rel="noopener">See on map</a></div></div>';
  }).join('');
  return '<div style="margin-top:18px"><h3 style="margin:0 0 4px">Find my phone</h3>'+
    '<p class="h38-mileage-note">Owner phones only. While an owner\u2019s tracking is on, their phone reports where it is — so a lost phone can be found from here.</p>'+
    (rowsHtml||'<p class="h38-mileage-note">No owner phones yet.</p>')+'</div>';
}

// ---------- native app bridge (H38 Office Android app) ----------
// When the Office runs inside the native app, window.AndroidH38Office is
// present. The native layer detects drives in the background and delivers
// them into this same mileageTrips collection; this module stays the one
// classification engine. The bridge carries the session + recording policy
// down (this module is the policy source of truth) and the status back up.
function nativeBridge(){
  try{return (typeof w.AndroidH38Office!=='undefined'&&w.AndroidH38Office)?w.AndroidH38Office:null;}
  catch(_){return null;}
}
function nativeStatus(){
  var b=nativeBridge();
  if(!b)return null;
  try{return JSON.parse(b.getStatus());}catch(_){return null;}
}
var nativePushAt=0;
async function pushNativePolicy(force){
  var b=nativeBridge();
  if(!b)return;
  var nowMs=Date.now();
  if(!force&&nowMs-nativePushAt<15000)return;
  nativePushAt=nowMs;
  try{
    var cfg=w.H38_BUSINESS_OFFICE_SUPABASE||{};
    var session=null;
    try{
      var shared=w.H38_SUPABASE_SHARED_CLIENT;
      var client=shared&&typeof shared.ensure==='function'?shared.ensure():null;
      if(client&&client.auth&&typeof client.auth.getSession==='function'){
        var res=await client.auth.getSession();
        session=res&&res.data?res.data.session:null;
      }
    }catch(_){}
    if(!session||!userId())return; // sign-out is handled by h38:auth-cleared
    b.setSessionAndPolicy(JSON.stringify({
      supabaseUrl:text(cfg.url),publishableKey:text(cfg.publishableKey),
      accessToken:session.access_token||'',refreshToken:session.refresh_token||'',
      expiresAtMs:session.expires_at?session.expires_at*1000:0,
      authUserId:session.user&&session.user.id?session.user.id:'',
      userId:userId(),userName:userName(),businessId:businessId(),
      signedIn:true,
      pilotEnabled:pilotEnabled(),featureOn:enabled(),
      recordingOn:recordingOn(),offDuty:offDuty(),
      ownerAdmin:isOwnerAdmin(),clockedIn:clockedIn()
    }));
  }catch(_){}
}
// Native-delivered trips arrive Unreviewed with no suggestion (the native
// layer detects and delivers; it does not classify). Run them through the
// same suggest/auto-file path closeTrip() uses, exactly once each, marked
// with 'Engine Processed At'. Idempotent: stamped rows are never re-run.
var nativeProcessBusy=false;
async function processNativeTrips(){
  if(nativeProcessBusy)return;
  if(!enabled()||!userId()||!businessId())return;
  var rows=myTrips().filter(function(row){
    return val(row,'Native Delivered','nativeDelivered')===true
      &&tripStatus(row)==='Unreviewed'
      &&!text(val(row,'Engine Processed At','engineProcessedAt'));
  });
  if(!rows.length)return;
  nativeProcessBusy=true;
  try{
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      var trip=tripObjectFromRow(row);
      var s=suggest(trip);
      var stamp=nowIso();
      var record=Object.assign({},row);
      record['Start Label']=trip.startLat?endpointLabel(trip.startLat,trip.startLng):'';
      record['End Label']=trip.endLat?endpointLabel(trip.endLat,trip.endLng):'';
      record['Suggested Classification']=s.classification||'';
      record['Suggested Job ID']=s.jobId||'';
      record['Suggestion Reason']=s.reason||'';
      record['Suggestion Score']=s.score||0;
      if(s.autoFile){
        record['Status']='Auto-filed';
        record['Classification']=s.classification;
        record['Job ID']=s.jobId||'';
        record['Customer ID']=s.customerId||'';
        record['Filed Place ID']=s.placeId||'';
      }
      record['Engine Processed At']=stamp;
      record['Updated Time']=stamp;
      record['Record Version']=num(val(row,'Record Version','recordVersion'))+1;
      await saveTripRecord(record);
      if(s.autoFile){
        await learnFromTrip({
          classification:s.classification,jobId:s.jobId||'',customerId:s.customerId||'',
          startLat:trip.startLat,startLng:trip.startLng,endLat:trip.endLat,endLng:trip.endLng,
          startLabel:record['Start Label'],endLabel:record['End Label']
        },{classification:s.classification,jobId:s.jobId||'',placeId:s.placeId||''});
      }
    }
  }catch(_){/* the unstamped remainder is retried on the next pass */}
  nativeProcessBusy=false;
}
function nativeStatusHtml(){
  var st=nativeStatus();
  if(!st)return '';
  var line='';
  if(st.gate==='RECORDING')line='Background tracking is on (H38 Office app) — drives are recorded even with the app closed.';
  else if(st.gate==='WAITING_CLOCKIN')line='Background tracking is on (H38 Office app) — it records while you\u2019re clocked in.';
  else if(st.gate==='PAUSED_STALE')line='The H38 Office app is installed, but background tracking is paused — it checks in when you open the app.';
  else if(!st.backgroundLocation)line='The H38 Office app is installed, but location is not set to \u201cAllow all the time\u201d — background tracking can\u2019t run yet.';
  else line='The H38 Office app is installed. Background tracking is off right now — check the switches above.';
  if(st.pendingTrips)line+=' '+st.pendingTrips+' detected trip'+(st.pendingTrips===1?' is':'s are')+' waiting to sync.';
  return '<p class="h38-mileage-note">'+esc(line)+'</p>'+
    '<div class="h38-mileage-actions">'+
    '<button type="button" class="secondary" data-h38-mileage-native-setup>App setup</button>'+
    '<button type="button" class="secondary" data-h38-mileage-native-settings>Fix in Settings</button>'+
    '</div>';
}

// ---------- surfaces ----------
function cardSignature(){
  var review=myUnreviewed().length,missed=missedLoad().length;
  return JSON.stringify({
    page:text(w.state&&w.state.page),business:businessId(),user:userId(),
    on:recordingOn(),duty:offDuty(),clocked:clockedIn(),owner:isOwnerAdmin(),
    review:review,missed:missed,auto:myAutoFiled().length,
    manual:manual.trip?manual.trip.startedAt:'',watchErr:watch.error,
    phones:isOwnerAdmin()?ownerPhones().map(function(p){var s=p.pos||p.tripEnd;return p.id+':'+(s?s.stamp:'');}).join(','):'',
    miles:manual.trip?Math.round(manual.trip.miles*10)/10:0,
    latest:myTrips().length?text(val(myTrips()[myTrips().length-1],'Updated Time','updatedTime')):''
  });
}
function renderCard(){
  var page=text(w.state&&w.state.page);
  var host=document.getElementById(CARD_ID);
  if(!enabled()||!userId()||page!=='today'){
    if(host)host.remove();
    // If the workspace reserved a mileage slot but the feature is off after
    // all, release the reserved space instead of leaving a skeleton gap.
    try{if(w.H38FirstScreen&&typeof w.H38FirstScreen.release==='function')w.H38FirstScreen.release('mileage');}catch(_){}
    return;
  }
  ensureStyle();
  var main=document.getElementById('mainContent');
  if(!main)return;
  // Opening-bounce fix: never decorate the boot splash / sign-in gate. The
  // card used to prepend itself above the welcome screen, get wiped by the
  // real Today render, then re-insert above the painted screen and shove it
  // down. The page-rendered decorate pass retries once the workspace exists.
  if(!document.getElementById('h38MileageSlot')&&!main.querySelector('.h38-owner-home')&&(main.querySelector('.welcome')||document.getElementById('h38AuthEmail')))return;
  var signature=cardSignature();
  if(host&&host.dataset.h38MileageSignature===signature)return;
  if(!host){
    host=document.createElement('section');
    host.id=CARD_ID;host.className='card h38-mileage-card';
    host.setAttribute('data-h38-mileage','card');
    // Fill the reserved first-screen slot when the Today workspace painted
    // one; the card then lands in space that already exists (no shove).
    var filledSlot=false;
    try{filledSlot=!!(w.H38FirstScreen&&typeof w.H38FirstScreen.fill==='function'&&w.H38FirstScreen.fill('mileage',host));}catch(_){filledSlot=false;}
    if(!filledSlot){
      var grid=main.querySelector('.grid');
      if(grid)grid.insertAdjacentElement('beforebegin',host);else main.prepend(host);
    }
  }
  host.dataset.h38MileageSignature=signature;
  var review=myUnreviewed().length,missed=missedLoad().length;
  host.innerHTML='<div class="h38-mileage-head"><div><span class="h38-mileage-kicker">MILEAGE</span><h2>Trips</h2></div>'+
    (review||missed?'<span class="h38-mileage-badge">'+(review+missed)+' to sort out</span>':'')+'</div>'+
    statusBlockHtml()+
    (review||missed
      ?'<p class="h38-mileage-note">'+(missed?missed+' possible missed drive'+(missed===1?'':'s')+' and ':'')+(review?review+' trip'+(review===1?'':'s')+' waiting to sort.':'')+' Sorting takes a tap — do it whenever.</p>'
      :'<p class="h38-mileage-note">Drives you take are logged here and sorted later. The sure ones file themselves.</p>')+
    '<div class="h38-mileage-actions"><button type="button" data-h38-mileage-open>Review trips</button></div>';
  bindStatusButtons(host);
  var open=host.querySelector('[data-h38-mileage-open]');
  if(open)open.onclick=function(){
    if(typeof w.openPage==='function')w.openPage('fleet');
    setTimeout(function(){
      var section=document.getElementById(SECTION_ID);
      if(section)section.scrollIntoView({behavior:'smooth',block:'start'});
    },450);
  };
}
function renderSection(){
  var page=text(w.state&&w.state.page);
  var host=document.getElementById(SECTION_ID);
  if(!enabled()||!userId()||page!=='fleet'){
    if(host)host.remove();
    return;
  }
  ensureStyle();
  var main=document.getElementById('mainContent');
  if(!main)return;
  var signature=cardSignature()+'|'+ui.tab+'|'+ui.month+'|'+ui.editorFor+'|'+(ui.teamView?'team':'mine')+'|'+myPlaces().length+'|'+ratePerMile();
  if(host&&host.dataset.h38MileageSignature===signature)return;
  if(!host){
    host=document.createElement('section');
    host.id=SECTION_ID;host.className='card h38-mileage-section';
    host.setAttribute('data-h38-mileage','section');
    var grid=main.querySelector('.grid');
    if(grid)grid.insertAdjacentElement('beforebegin',host);else main.prepend(host);
  }
  host.dataset.h38MileageSignature=signature;
  host.innerHTML=sectionHtml();
  bindSection(host);
}
function renderReportCard(){
  var page=text(w.state&&w.state.page);
  var host=document.getElementById(REPORT_CARD_ID);
  if(!enabled()||!userId()||page!=='reports'){
    if(host)host.remove();
    return;
  }
  ensureStyle();
  var main=document.getElementById('mainContent');
  if(!main)return;
  var month=monthKeyOf(nowIso());
  var totals=monthlyTotals(month);
  var rate=ratePerMile();
  var signature=JSON.stringify({b:totals.mine.business,p:totals.mine.personal,rate:rate,team:Object.keys(totals.team).length});
  if(host&&host.dataset.h38MileageSignature===signature)return;
  if(!host){
    host=document.createElement('section');
    host.id=REPORT_CARD_ID;host.className='card h38-mileage-section';
    host.setAttribute('data-h38-mileage','report');
    var grid=main.querySelector('.grid');
    if(grid)grid.insertAdjacentElement('beforebegin',host);else main.appendChild(host);
  }
  host.dataset.h38MileageSignature=signature;
  host.innerHTML='<div class="h38-mileage-head"><div><span class="h38-mileage-kicker">MILEAGE & REIMBURSEMENT</span><h2>Mileage — this month</h2>'+
    '<p class="h38-mileage-note">Your business miles: <strong>'+esc(fmtMiles(totals.mine.business))+' mi</strong> · personal: '+esc(fmtMiles(totals.mine.personal))+' mi'+
    (rate>0?' · reimbursement at $'+esc(rate.toFixed(2))+'/mi: <strong>$'+esc((totals.mine.business*rate).toFixed(2))+'</strong>':' · no reimbursement rate set')+
    '. Full log and team totals live under Fleet \u2192 Mileage.</p></div></div>';
}
function removeSurfaces(){
  [CARD_ID,SECTION_ID,REPORT_CARD_ID].forEach(function(id){
    var node=document.getElementById(id);
    if(node)node.remove();
  });
}

// ---------- decorate / hooks ----------
function decorate(){
  registerFeature();
  pushNativePolicy(false);
  processNativeTrips().catch(function(){});
  if(!enabled()){
    stopWatch();
    removeSurfaces();
    return;
  }
  if(!userId()||!businessId())return;
  renderCard();
  renderSection();
  renderReportCard();
  syncWatch();
}
var decorateQueued=false;
function scheduleDecorate(){
  if(decorateQueued)return;
  decorateQueued=true;
  var run=function(){decorateQueued=false;decorate();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}
function scheduleDecorateSettled(){
  scheduleDecorate();
  setTimeout(scheduleDecorate,1200);
  setTimeout(scheduleDecorate,3000);
}
function installHooks(){
  if(typeof document==='undefined'||document.documentElement.dataset.h38MileageHooks==='1')return;
  document.documentElement.dataset.h38MileageHooks='1';
  w.addEventListener('h38:office-page-rendered',scheduleDecorate);
  w.addEventListener('h38:business-snapshot-updated',scheduleDecorate);
  w.addEventListener('pageshow',function(){settleOnOpen();scheduleDecorate();});
  w.addEventListener('focus',scheduleDecorate);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState!=='visible'){stopWatch();engineSave();}
    else{settleOnOpen();scheduleDecorate();}
  });
  w.addEventListener('pagehide',function(){stopWatch();engineSave();});
  w.addEventListener('h38:auth-cleared',function(){stopWatch();removeSurfaces();var b=nativeBridge();if(b){try{b.clearSession();}catch(_){}}});
  // Missed-drive check: the first good fix after the app opens tells us
  // whether the phone moved far from where it was parked while closed.
  if(typeof navigator!=='undefined'&&navigator.geolocation&&typeof navigator.geolocation.getCurrentPosition==='function'){
    setTimeout(function(){
      if(!enabled()||!recordingOn()||offDuty())return;
      try{
        navigator.geolocation.getCurrentPosition(function(position){
          var fix=goodFix(position);
          if(fix)checkMissedDrive(fix);
        },function(){},{enableHighAccuracy:false,maximumAge:60000,timeout:10000});
      }catch(_){}
    },2500);
  }
}

engineLoad();
manualLoad();
settleOnOpen();
registerFeature();
installHooks();
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleDecorate,{once:true});
  else scheduleDecorate();
}

w.H38Mileage=Object.freeze({
  build:BUILD,
  feature:FEATURE_DEF,
  enabled:enabled,
  pilotEnabled:pilotEnabled,
  recordingOn:recordingOn,
  startDay:startDay,
  stopDay:stopDay,
  ownerPhones:ownerPhones,
  offDuty:offDuty,
  detectionEligible:detectionEligible,
  policyLine:policyLine,
  manualStart:manualStart,
  manualEnd:manualEnd,
  classifyTrip:classifyTrip,
  undoAutoFile:undoAutoFile,
  suggest:suggest,
  monthlyTotals:monthlyTotals,
  myTrips:myTrips,
  myPlaces:myPlaces,
  decorate:decorate,
  collections:{trips:TRIP_COLLECTION,places:PLACE_COLLECTION,settings:SETTINGS_COLLECTION},
  foregroundOnly:!nativeBridge(),
  nativeStatus:nativeStatus,
  processNativeTrips:processNativeTrips,
  employeesRecordWhileClockedIn:true,
  manualFallbackNeverGates:true
});
})();
