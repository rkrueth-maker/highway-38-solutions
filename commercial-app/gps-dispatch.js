(function(){
'use strict';
// H38 GPS Dispatch Board (2026-10-04, build 20261004-dispatch-1).
// Today's jobs on a dispatch board: crew/vehicle assignment, status flow
// (Assigned/Dispatched -> En Route -> On Site -> Done), live crew positions
// on a map, and on-my-way texts through the SMS gateway seam.
//
// Owner Controls: registered via id-guarded push to
// window.H38OwnerControls.FEATURES (id 'gps_dispatch', default OFF).
// Everything below is gated on isEnabled('gps_dispatch'). Live position
// capture additionally requires the existing 'gps_tracking' toggle.
var BUILD='20261004-dispatch-1';
var COLLECTION='dispatchAssignments';
var POSITION_COLLECTION='crewPositions';

// ---------- local helpers (fall back to app globals when present) ----------
var w=typeof window!=='undefined'?window:globalThis;
function text(v){return String(v==null?'':v).trim();}
function esc(s){if(typeof w.esc==='function')return w.esc(s);return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pill(t,kind){if(typeof w.pill==='function')return w.pill(t,kind);return '<span class="pill '+esc(kind||'')+'">'+esc(t||'Unknown')+'</span>';}
function v(row){var keys=Array.prototype.slice.call(arguments,1);if(typeof w.v==='function')return w.v.apply(w,[row].concat(keys));for(var i=0;i<keys.length;i++){var k=keys[i];if(row&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];}return '';}
function num(x){if(typeof w.num==='function')return w.num(x);var n=Number(x);return Number.isFinite(n)?n:0;}
function nowIso(){if(typeof w.now==='function')return w.now();return new Date().toISOString();}
function toast(msg,bad){if(typeof w.toast==='function')w.toast(msg,bad);else if(bad)console.warn(msg);else console.log(msg);}
function newId(prefix){if(typeof w.newId==='function')return w.newId(prefix);return prefix+'-'+Math.random().toString(36).slice(2,10).toUpperCase()+Date.now().toString(36).toUpperCase();}
function records(name){if(typeof w.records==='function')return w.records(name)||[];var s=w.state||{};return (s.snapshot&&s.snapshot[name])||[];}
function businessId(){return text((w.state&&w.state.businessId)||'');}
function businessName(){var s=w.state||{},b=(s.snapshot&&s.snapshot.business)||{};return text(v(b,'Business Name','Name','businessName')||'Highway 38');}
function ownerControls(){return w.H38OwnerControls||null;}
function ocEnabled(id){var oc=ownerControls();try{if(oc&&typeof oc.isEnabled==='function')return oc.isEnabled(id)===true;}catch(_){}return false;}

// ---------- feature registration (id-guarded; never edit owner-controls.js) ----------
var FEATURE_DEF={id:'gps_dispatch',title:'GPS dispatch board',desc:'Live dispatch board: crew assignment, status flow, on-my-way texts, crew map. Location sharing needs crew opt-in.',icon:'🛰️',default:false,category:'Fleet'};
function registerFeature(){
  var oc=ownerControls();
  if(!oc||!Array.isArray(oc.FEATURES))return false;
  var exists=oc.FEATURES.some(function(f){return f&&f.id==='gps_dispatch';});
  if(!exists)oc.FEATURES.push(FEATURE_DEF);
  return true;
}
function enabled(){return registerFeature()&&ocEnabled('gps_dispatch')&&!!businessId();}
function gpsTrackingEnabled(){return ocEnabled('gps_tracking');}

// ---------- styles (injected only when the dispatch UI is used) ----------
var styleInjected=false;
function ensureStyle(){
  if(styleInjected||typeof document==='undefined')return;styleInjected=true;
  var css=[
    '.h38-dispatch-card{margin-bottom:16px}',
    '.h38-dispatch-board{display:grid;gap:12px;grid-template-columns:1fr}',
    '@media(min-width:900px){.h38-dispatch-board{grid-template-columns:1fr 1fr}}',
    '.h38-dispatch-stop{border:1px solid var(--border,#e2e2e2);border-radius:12px;padding:14px;background:var(--card,#fff)}',
    '.h38-dispatch-stop .row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}',
    '.h38-dispatch-time{font-size:1.15em;font-weight:700}',
    '.h38-dispatch-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.h38-dispatch-actions button{min-height:44px;padding:10px 14px;font-size:1em;border-radius:10px}',
    '.h38-dispatch-map{height:340px;border-radius:12px;border:1px solid var(--border,#e2e2e2);background:#eef2f5}',
    '.h38-dispatch-crew{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}',
    '.h38-dispatch-crew label{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border,#ddd);border-radius:10px;padding:10px 12px;min-height:44px;cursor:pointer}',
    '.h38-dispatch-form label{display:block;margin:8px 0 4px;font-weight:600}',
    '.h38-dispatch-form select,.h38-dispatch-form input{min-height:44px;font-size:1em;width:100%}',
    '.h38-dispatch-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.h38-dispatch-modal{background:#fff;border-radius:14px;padding:18px;max-width:440px;width:100%}',
    '.h38-dispatch-modal textarea{width:100%;min-height:96px;font-size:1em}',
    '.h38-dispatch-modal .actions{display:flex;gap:8px;margin-top:12px}',
    '.h38-dispatch-modal .actions button{min-height:44px;flex:1}',
    '.h38-dispatch-note{font-size:.9em;color:#666;margin-top:6px}'
  ].join('\n');
  var el=document.createElement('style');el.setAttribute('data-h38-dispatch','1');el.textContent=css;document.head.appendChild(el);
}

// ---------- board state ----------
var board={open:false,date:'',map:null,markers:[],leafletPromise:null,simTimer:null};
var watch={id:null,lastLat:null,lastLng:null,lastAt:0};
var sim={on:false,timer:null,crews:[],stops:[],tick:0};

function todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dayKey(iso){var d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function fmtTime(iso){var d=new Date(iso);if(Number.isNaN(d.getTime()))return '—';return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
function isCancelled(status){return /cancel|void|delete/i.test(text(status));}

// Today's schedule events joined to jobs/customers. Bounded to 50 stops.
function dayEvents(dateStr){
  var ds=dateStr||todayStr();
  var events=records('scheduleEvents').filter(function(e){
    return dayKey(v(e,'Start Time'))===ds&&!isCancelled(v(e,'Status'));
  });
  var jobs=records('jobs'),customers=records('customers');
  return events.slice(0,50).map(function(e){
    var jn=text(v(e,'Job Number'));
    var job=jobs.find(function(j){return text(v(j,'Job Number'))===jn&&jn;})||jobs.find(function(j){return text(v(j,'Job ID'))===text(v(e,'Job ID','Related Record ID'));})||null;
    var custId=text(v(e,'Customer ID')||(job&&v(job,'Customer ID')));
    var cust=customers.find(function(c){return text(v(c,'Customer ID'))===custId&&custId;})||null;
    return {event:e,job:job,customer:cust};
  }).sort(function(a,b){return String(v(a.event,'Start Time')||'').localeCompare(String(v(b.event,'Start Time')||''));});
}

function eventIdOf(stop){return text(v(stop.event,'Schedule Event ID','Event ID','id'));}
function jobIdOf(stop){return text(v(stop.job,'Job ID')||v(stop.event,'Job ID'));}
function stopLabel(stop){
  return text(v(stop.event,'Title'))||text(v(stop.job,'Project Title','Job Number'))||'Stop';
}
function stopAddress(stop){
  return text(v(stop.event,'Location'))||text(v(stop.customer,'Service Address','Address','Street Address'))||'';
}
function stopCustomerName(stop){
  return text(v(stop.customer,'Customer Name'))||text(v(stop.event,'Customer Name'))||'—';
}
function stopPhone(stop){
  return text(v(stop.customer,'Mobile Phone')||v(stop.customer,'Phone'))||'';
}
function stopCoords(stop){
  var lat=num(v(stop.event,'Lat','Latitude')||v(stop.customer,'Lat','Latitude'));
  var lng=num(v(stop.event,'Lng','Longitude')||v(stop.customer,'Lng','Longitude'));
  if(lat&&lng)return{lat:lat,lng:lng,real:true};
  return null;
}
function crewName(id){
  if(!id)return 'Unassigned';
  var u=records('users').find(function(x){return text(v(x,'User ID','userId'))===text(id);});
  return text(v(u,'Display Name','displayName','Email'))||text(id);
}
function vehicleName(id){
  if(!id)return '—';
  var a=records('assets').find(function(x){return text(v(x,'Asset ID'))===text(id);});
  return text(v(a,'Description'))||text(v(a,'Asset Number'))||text(id);
}

// ---------- dispatchAssignments ----------
function assignments(){return records(COLLECTION)||[];}
function assignmentFor(eventId){
  var rows=assignments().filter(function(a){return text(v(a,'Schedule Event ID'))===text(eventId);});
  rows.sort(function(a,b){return num(b['Record Version'])-num(a['Record Version']);});
  return rows[0]||null;
}
function parseCrewIds(a){
  var raw=v(a,'Crew User IDs');
  if(Array.isArray(raw))return raw.map(text).filter(Boolean);
  try{var arr=JSON.parse(raw||'[]');return Array.isArray(arr)?arr.map(text).filter(Boolean):[];}catch(_){return raw?[text(raw)]:[];}
}
var NEXT_STATUS={'Assigned':'En Route','En Route':'On Site','On Site':'Done'};
var STATUS_AT={'En Route':'En Route At','On Site':'On Site At','Done':'Done At'};

function canWrite(){return typeof w.queueOperation==='function'&&!!businessId();}

// Create or update the assignment for a schedule event.
async function saveAssignment(eventId,jobId,crewIds,vehicleId){
  if(!canWrite())throw new Error('Open a business first.');
  var prior=assignmentFor(eventId);
  var stamp=nowIso();
  var record;
  if(prior){
    record=Object.assign({},prior,{
      'Job ID':jobId||v(prior,'Job ID'),
      'Crew User IDs':JSON.stringify(crewIds||[]),
      'Vehicle ID':vehicleId||'',
      'Updated Time':stamp,
      'Record Version':num(prior['Record Version'])+1
    });
    await w.queueOperation('UPDATE_DISPATCH_ASSIGNMENT','Dispatch Assignment',v(prior,'Assignment ID'),{
      assignmentId:v(prior,'Assignment ID'),jobId:record['Job ID'],crewUserIds:crewIds||[],vehicleId:record['Vehicle ID']
    },{collection:COLLECTION,record:record,idKeys:['Assignment ID']});
    toast('Dispatch assignment updated.');
    return record;
  }
  var id=newId('DISPATCH');
  record={
    'Assignment ID':id,
    'Business ID':businessId(),
    'Job ID':jobId||'',
    'Schedule Event ID':eventId,
    'Crew User IDs':JSON.stringify(crewIds||[]),
    'Vehicle ID':vehicleId||'',
    'Status':'Assigned',
    'Dispatched At':stamp,
    'En Route At':'','On Site At':'','Done At':'',
    'Created Time':stamp,'Updated Time':stamp,
    'Record Version':1
  };
  await w.queueOperation('SAVE_DISPATCH_ASSIGNMENT','Dispatch Assignment',id,{
    assignmentId:id,jobId:record['Job ID'],scheduleEventId:eventId,crewUserIds:crewIds||[],vehicleId:record['Vehicle ID']
  },{collection:COLLECTION,record:record,idKeys:['Assignment ID']});
  toast('Crew dispatched.');
  return record;
}

// Forward-only status transition with timestamp + Record Version bump.
async function setStatus(assignmentId,to){
  if(!canWrite())throw new Error('Open a business first.');
  var a=assignments().find(function(x){return text(v(x,'Assignment ID'))===text(assignmentId);});
  if(!a)throw new Error('Assignment not found.');
  var from=text(v(a,'Status'));
  var allowed=NEXT_STATUS[from];
  if(allowed!==to)throw new Error('Cannot move from '+from+' to '+to+'.');
  var stamp=nowIso();
  var record=Object.assign({},a,{'Status':to,'Updated Time':stamp,'Record Version':num(a['Record Version'])+1});
  if(STATUS_AT[to])record[STATUS_AT[to]]=stamp;
  await w.queueOperation('UPDATE_DISPATCH_ASSIGNMENT','Dispatch Assignment',v(a,'Assignment ID'),{
    assignmentId:v(a,'Assignment ID'),status:to,statusAt:stamp
  },{collection:COLLECTION,record:record,idKeys:['Assignment ID']});
  toast('Status: '+to+'.');
  return record;
}

// ---------- on-my-way text ----------
function normalizeE164(raw){
  var digits=text(raw).replace(/\D/g,'');
  if(digits.length===11&&digits.charAt(0)==='1')return '+'+digits;
  if(digits.length===10)return '+1'+digits;
  if(digits.charAt(0)==='+')return text(raw);
  return digits?'+'+digits:'';
}
function composeOnMyWay(stop,etaMin){
  var cust=stop.customer||{};
  var full=text(v(cust,'Customer Name'))||'there';
  var first=full.split(/\s+/)[0]||'there';
  var a=assignmentFor(eventIdOf(stop));
  var crew=parseCrewIds(a||{});
  var tech=crew.length?crewName(crew[0]).split(/\s+/)[0]:'your technician';
  return 'Hi '+first+', '+tech+' from '+businessName()+' is on the way — ETA ~'+num(etaMin||20)+' min.';
}
function sendOnMyWay(stop,etaMin){
  return new Promise(function(resolve,reject){
    if(!w.H38Sms||typeof w.H38Sms.sendSms!=='function'){
      toast('SMS module is not loaded — on-my-way text cannot be sent yet.',true);
      reject(new Error('H38Sms unavailable'));
      return;
    }
    var to=normalizeE164(stopPhone(stop));
    if(!to){toast('No customer phone number on file for this stop.',true);reject(new Error('No phone'));return;}
    var body=composeOnMyWay(stop,etaMin);
    var consent=text(v(stop.customer||{},'Consent Status','SMS Consent','Consent'));
    w.H38Sms.sendSms({to:to,body:body,consentStatus:consent||'Unknown',purpose:'Dispatch on-my-way text'})
      .then(function(r){toast('On-my-way text queued for owner approval.');resolve(r);})
      .catch(function(err){toast(text(err&&err.message||err),true);reject(err);});
  });
}

// ---------- map (Leaflet on demand, graceful fallback) ----------
function loadLeaflet(){
  if(board.leafletPromise)return board.leafletPromise;
  board.leafletPromise=new Promise(function(resolve,reject){
    if(w.L&&w.L.map){resolve(w.L);return;}
    if(typeof document==='undefined'){reject(new Error('No document'));return;}
    var css=document.querySelector('link[data-h38-dispatch-leaflet]');
    if(!css){css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.setAttribute('data-h38-dispatch-leaflet','1');document.head.appendChild(css);}
    var s=document.querySelector('script[data-h38-dispatch-leaflet]');
    if(s){s.addEventListener('load',function(){w.L&&w.L.map?resolve(w.L):reject(new Error('Leaflet failed to load'));},{once:true});s.addEventListener('error',function(){reject(new Error('Leaflet failed to load'));},{once:true});return;}
    s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.setAttribute('data-h38-dispatch-leaflet','1');
    s.onload=function(){w.L&&w.L.map?resolve(w.L):reject(new Error('Leaflet failed to load'));};
    s.onerror=function(){reject(new Error('Leaflet failed to load'));};
    document.head.appendChild(s);
  });
  return board.leafletPromise;
}

function latestCrewPositions(){
  // Latest crewPositions row per user.
  var byUser={},rows=records(POSITION_COLLECTION)||[];
  rows.forEach(function(r){
    var uid=text(v(r,'User ID'));
    if(!uid)return;
    var ts=String(v(r,'Timestamp')||'');
    if(!byUser[uid]||ts>String(v(byUser[uid],'Timestamp')||''))byUser[uid]=r;
  });
  return byUser;
}

async function initMap(stops){
  var node=typeof document!=='undefined'?document.getElementById('h38DispatchMap'):null;
  if(!node)return 'no-node';
  // Stop coordinates: real ones from records; simulated ones when sim is on.
  var points=stops.map(function(stop,i){
    var c=stopCoords(stop);
    if(!c&&sim.on&&sim.stops[i])c={lat:sim.stops[i].lat,lng:sim.stops[i].lng,real:false,sim:true};
    return c?{stop:stop,lat:c.lat,lng:c.lng,sim:!!c.sim}:null;
  }).filter(Boolean);
  var crews=crewMarkers();
  if(!points.length&&!crews.length){
    node.innerHTML='<div class="h38-dispatch-note" style="padding:16px">No map positions yet. Crew positions appear once location sharing starts (or turn on simulation below).</div>';
    return 'empty';
  }
  var L;
  try{L=await loadLeaflet();}
  catch(err){
    node.innerHTML='<div class="h38-dispatch-note" style="padding:16px">Map could not load (offline or CDN blocked). The ordered stop list below still works.<br><small>'+esc(text(err&&err.message||err))+'</small></div>';
    return 'unavailable';
  }
  if(!node.isConnected)return 'detached';
  try{
    if(board.map){try{board.map.remove();}catch(_){}board.map=null;}
    board.markers=[];
    node.innerHTML='';
    var map=L.map(node,{zoomControl:true});board.map=map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    var bounds=[];
    points.forEach(function(p,idx){
      var icon=L.divIcon({className:'',html:'<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:'+(p.sim?'#7c4dff':'#1976d2')+';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>',iconSize:[22,22],iconAnchor:[11,11]});
      var m=L.marker([p.lat,p.lng],{icon:icon}).addTo(map)
        .bindPopup('<strong>Stop '+(idx+1)+': '+esc(stopLabel(p.stop))+'</strong><br>'+esc(stopAddress(p.stop)||'')+'<br>'+esc(fmtTime(v(p.stop.event,'Start Time'))));
      board.markers.push(m);bounds.push([p.lat,p.lng]);
    });
    crews.forEach(function(c){
      var icon=L.divIcon({className:'',html:'<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#2e7d32;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>',iconSize:[22,22],iconAnchor:[11,11]});
      var m=L.marker([c.lat,c.lng],{icon:icon}).addTo(map)
        .bindPopup('<strong>'+esc(c.label)+'</strong><br>'+esc(c.sim?'Simulated position':'Crew position')+'<br><small>'+esc(c.at||'')+'</small>');
      board.markers.push(m);bounds.push([c.lat,c.lng]);
    });
    if(bounds.length===1)map.setView(bounds[0],14);
    else map.fitBounds(bounds,{padding:[30,30],maxZoom:15});
    return 'ok';
  }catch(err){
    node.innerHTML='<div class="h38-dispatch-note" style="padding:16px">Map failed to render. The ordered stop list below still works.<br><small>'+esc(text(err&&err.message||err))+'</small></div>';
    return 'error';
  }
}

// Markers for live crew: real crewPositions rows + the device watch + sim crews.
function crewMarkers(){
  var out=[];
  var live=latestCrewPositions();
  Object.keys(live).forEach(function(uid){
    var r=live[uid],lat=num(v(r,'Lat')),lng=num(v(r,'Lng'));
    if(lat&&lng)out.push({userId:uid,label:crewName(uid),lat:lat,lng:lng,at:text(v(r,'Timestamp')),sim:false});
  });
  sim.crews.forEach(function(c){
    out.push({userId:c.userId,label:c.label+' (sim)',lat:c.lat,lng:c.lng,at:'simulated',sim:true});
  });
  return out;
}

// ---------- live positions via device geolocation ----------
function haversineM(aLat,aLng,bLat,bLng){
  var R=6371000,toRad=function(d){return d*Math.PI/180;};
  var dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.sqrt(s));
}
function currentUserId(){
  var u=(w.state&&w.state.snapshot&&w.state.snapshot.user)||{};
  return text(v(u,'User ID','userId')||u.id||'');
}
async function writePosition(lat,lng,accuracy){
  if(!canWrite())return null;
  var uid=currentUserId()||'DEVICE';
  var id=newId('CREWPOS');
  var stamp=nowIso();
  var record={'Crew Position ID':id,'Business ID':businessId(),'User ID':uid,'Lat':lat,'Lng':lng,'Accuracy':accuracy==null?'':accuracy,'Timestamp':stamp,'Created Time':stamp,'Record Version':1};
  try{
    await w.queueOperation('SAVE_CREW_POSITION','Crew Position',id,{
      positionId:id,userId:uid,lat:lat,lng:lng,accuracy:accuracy,timestamp:stamp
    },{collection:POSITION_COLLECTION,record:record,idKeys:['Crew Position ID']});
  }catch(_){/* queue offline; never crash the watch */}
  watch.lastLat=lat;watch.lastLng=lng;watch.lastAt=Date.now();
  return record;
}
function watchCrewPositions(){
  if(!enabled()){
    if(watch.id!=null&&typeof navigator!=='undefined'&&navigator.geolocation)try{navigator.geolocation.clearWatch(watch.id);}catch(_){}
    watch.id=null;return false;
  }
  if(!gpsTrackingEnabled()){toast('Location sharing also needs Settings → Owner Controls → GPS location tracking.',true);return false;}
  if(typeof navigator==='undefined'||!navigator.geolocation||typeof navigator.geolocation.watchPosition!=='function'){
    toast('This device does not expose location.',true);return false;
  }
  if(watch.id!=null)return true; // already watching
  try{
    watch.id=navigator.geolocation.watchPosition(function(pos){
      var lat=pos.coords.latitude,lng=pos.coords.longitude,acc=pos.coords.accuracy;
      var moved=watch.lastLat==null||haversineM(watch.lastLat,watch.lastLng,lat,lng)>=50;
      var aged=Date.now()-watch.lastAt>=30000;
      if(moved||aged)writePosition(lat,lng,acc);
    },function(err){
      toast('Location unavailable: '+text(err&&err.message||err),true);
    },{enableHighAccuracy:true,maximumAge:15000,timeout:20000});
  }catch(err){toast('Location watch failed: '+text(err&&err.message||err),true);return false;}
  toast('Location sharing on — position shared while on shift.');
  return true;
}
function stopWatch(){
  if(watch.id!=null&&typeof navigator!=='undefined'&&navigator.geolocation){try{navigator.geolocation.clearWatch(watch.id);}catch(_){}}
  watch.id=null;watch.lastLat=null;watch.lastLng=null;watch.lastAt=0;
}

// ---------- simulation (for testing until crew devices share live GPS) ----------
// Deterministic fake stop coords around Grand Rapids, MN + crews moving between them.
var SIM_BASE={lat:47.2372,lng:-93.5302};
function simStopCoords(stops){
  return stops.map(function(stop,i){
    var real=stopCoords(stop);
    if(real)return{lat:real.lat,lng:real.lng};
    return{lat:SIM_BASE.lat+(i*0.011),lng:SIM_BASE.lng+(((i%3)-1)*0.017)};
  });
}
function simTick(){
  if(!sim.on||!sim.crews.length||sim.stops.length<1)return;
  sim.tick++;
  var wrote=false;
  sim.crews.forEach(function(c){
    var n=sim.stops.length;
    var from=sim.stops[c.leg%n],to=sim.stops[(c.leg+1)%n];
    c.t+=0.25; // quarter of a leg per tick
    if(c.t>=1){c.t=0;c.leg++;from=sim.stops[c.leg%n];to=sim.stops[(c.leg+1)%n];wrote=true;}
    c.lat=from.lat+(to.lat-from.lat)*c.t;
    c.lng=from.lng+(to.lng-from.lng)*c.t;
  });
  // Persist a crewPositions row on each leg change so the whole write path is exercised.
  if(wrote&&canWrite()){
    sim.crews.forEach(function(c){
      var id=newId('CREWPOS'),stamp=nowIso();
      var record={'Crew Position ID':id,'Business ID':businessId(),'User ID':c.userId,'Lat':c.lat,'Lng':c.lng,'Accuracy':25,'Timestamp':stamp,'Created Time':stamp,'Record Version':1,'Simulated':true};
      try{w.queueOperation('SAVE_CREW_POSITION','Crew Position',id,{positionId:id,userId:c.userId,lat:c.lat,lng:c.lng,accuracy:25,timestamp:stamp,simulated:true},{collection:POSITION_COLLECTION,record:record,idKeys:['Crew Position ID']}).catch(function(){});}catch(_){}
    });
  }
  // Move live markers if the map is up.
  refreshSimMarkers();
}
function refreshSimMarkers(){/* markers re-render on next initMap; live refresh below when Leaflet present */}
function simulate(on){
  if(on){
    if(sim.on)return true;
    var stops=dayEvents(board.date||todayStr());
    if(!stops.length){toast('No stops today to simulate.',true);return false;}
    sim.stops=simStopCoords(stops);
    // One simulated crew per assigned crew member across today's stops; fall back to a test driver.
    var crewIds={};
    stops.forEach(function(stop){parseCrewIds(assignmentFor(eventIdOf(stop))||{}).forEach(function(id){crewIds[id]=1;});});
    var ids=Object.keys(crewIds);
    if(!ids.length)ids=['SIM-DRIVER'];
    sim.crews=ids.map(function(id,i){
      var p=sim.stops[i%sim.stops.length];
      return{userId:id,label:crewName(id)==='Unassigned'?'Test driver':crewName(id),lat:p.lat,lng:p.lng,leg:i%sim.stops.length,t:0};
    });
    sim.on=true;sim.tick=0;
    sim.timer=setInterval(simTick,4000);
    toast('Simulation on: crews moving between today\'s stops.');
    return true;
  }
  sim.on=false;
  if(sim.timer){clearInterval(sim.timer);sim.timer=null;}
  sim.crews=[];sim.stops=[];
  return true;
}

// ---------- assignment dialog ----------
function openAssignDialog(stop){
  if(typeof document==='undefined')return;
  ensureStyle();
  var users=records('users').slice(0,50);
  var assets=records('assets').slice(0,100);
  var a=assignmentFor(eventIdOf(stop));
  var crew=parseCrewIds(a||{});
  var veh=text(v(a||{},'Vehicle ID'));
  var overlay=document.createElement('div');overlay.className='h38-dispatch-overlay';
  overlay.innerHTML='<div class="h38-dispatch-modal" role="dialog" aria-label="Assign crew"><h2>Assign crew</h2>'+
    '<p class="h38-dispatch-note"><strong>'+esc(stopLabel(stop))+'</strong> · '+esc(fmtTime(v(stop.event,'Start Time')))+'<br>'+esc(stopAddress(stop)||stopCustomerName(stop))+'</p>'+
    '<div class="h38-dispatch-form"><label>Crew (tap to select)</label><div class="h38-dispatch-crew">'+
    (users.length?users.map(function(u){var id=text(v(u,'User ID','userId'));var checked=crew.indexOf(id)>=0;
      return '<label><input type="checkbox" name="crew" value="'+esc(id)+'"'+(checked?' checked':'')+'> '+esc(v(u,'Display Name','displayName','Email')||id)+'</label>';}).join(''):'<span class="h38-dispatch-note">No team members found.</span>')+
    '</div><label>Vehicle</label><select name="vehicle"><option value="">No vehicle</option>'+
    assets.map(function(x){var id=text(v(x,'Asset ID'));return '<option value="'+esc(id)+'"'+(veh===id?' selected':'')+'>'+esc(v(x,'Description')||v(x,'Asset Number')||id)+'</option>';}).join('')+'</select></div>'+
    '<div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="button" data-save>Save assignment</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').onclick=function(){overlay.remove();};
  overlay.querySelector('[data-save]').onclick=async function(){
    var crewIds=Array.prototype.slice.call(overlay.querySelectorAll('input[name="crew"]:checked')).map(function(i){return i.value;});
    var vehicle=overlay.querySelector('select[name="vehicle"]').value;
    try{
      await saveAssignment(eventIdOf(stop),jobIdOf(stop),crewIds,vehicle);
      overlay.remove();
      renderDispatch(board.date);
    }catch(err){toast(text(err&&err.message||err),true);}
  };
}

// ---------- on-my-way compose dialog ----------
function openOnMyWayDialog(stop){
  if(typeof document==='undefined')return;
  ensureStyle();
  var overlay=document.createElement('div');overlay.className='h38-dispatch-overlay';
  overlay.innerHTML='<div class="h38-dispatch-modal" role="dialog" aria-label="Send on-my-way text"><h2>On-my-way text</h2>'+
    '<p class="h38-dispatch-note">To '+esc(stopCustomerName(stop))+' · '+esc(stopPhone(stop)||'no number on file')+'</p>'+
    '<label>Message</label><textarea name="body">'+esc(composeOnMyWay(stop,20))+'</textarea>'+
    '<label>ETA (minutes)</label><input name="eta" type="number" min="1" max="240" value="20" style="min-height:44px;width:100%">'+
    '<div class="actions"><button type="button" class="secondary" data-close>Cancel</button><button type="button" data-send>Queue text</button></div>'+
    '<p class="h38-dispatch-note">Goes through the SMS gateway seam — queued for owner approval, consent enforced.</p></div>';
  document.body.appendChild(overlay);
  var etaInput=overlay.querySelector('input[name="eta"]'),bodyInput=overlay.querySelector('textarea[name="body"]');
  etaInput.oninput=function(){bodyInput.value=composeOnMyWay(stop,num(etaInput.value)||20);};
  overlay.querySelector('[data-close]').onclick=function(){overlay.remove();};
  overlay.querySelector('[data-send]').onclick=async function(){
    try{
      await w.H38Dispatch.sendOnMyWay(stop,num(etaInput.value)||20,bodyInput.value);
      overlay.remove();
    }catch(_){/* toast already shown */}
  };
}

// ---------- board render ----------
function statusPill(status){
  var s=text(status)||'Unassigned';
  var label=s==='Assigned'?'Dispatched':s;
  var kind=/done/i.test(s)?'good':/en route|on site/i.test(s)?'warn':'';
  return pill(label,kind);
}
function nextAction(a){
  var from=text(v(a,'Status'));
  var to=NEXT_STATUS[from];
  if(!to)return '';
  var label=to==='En Route'?'Mark en route':to==='On Site'?'Mark on site':'Mark done';
  return '<button type="button" data-status="'+esc(v(a,'Assignment ID'))+'" data-to="'+esc(to)+'">'+esc(label)+'</button>';
}
function renderDispatch(dateStr){
  if(!enabled()){
    toast('GPS dispatch board is OFF. Enable it in Settings → Owner Controls.',true);
    return false;
  }
  ensureStyle();
  board.open=true;board.date=dateStr||todayStr();
  var main=typeof document!=='undefined'?document.getElementById('mainContent'):null;
  if(!main)return false;
  var stops=dayEvents(board.date);
  var dateInput='<input type="date" id="h38DispatchDate" value="'+esc(board.date)+'" style="min-height:44px;font-size:1em">';
  var cards=stops.map(function(stop,idx){
    var eid=eventIdOf(stop),a=assignmentFor(eid),crew=parseCrewIds(a||{});
    return '<article class="h38-dispatch-stop" data-stop="'+esc(eid)+'">'+
      '<div class="row-top"><div><span class="h38-dispatch-time">'+esc(fmtTime(v(stop.event,'Start Time')))+'</span> '+
      '<strong>'+esc(stopLabel(stop))+'</strong><br><small>'+esc(stopCustomerName(stop))+
      (stopAddress(stop)?' · '+esc(stopAddress(stop)):'')+'</small></div>'+
      (a?statusPill(v(a,'Status')):pill('Unassigned'))+'</div>'+
      '<div class="h38-dispatch-note">Crew: '+esc(crew.length?crew.map(crewName).join(', '):'—')+
      ' · Vehicle: '+esc(vehicleName(text(v(a||{},'Vehicle ID'))))+'</div>'+
      '<div class="h38-dispatch-actions">'+
      '<button type="button" class="secondary" data-assign="'+esc(eid)+'">Assign crew</button>'+
      (a?nextAction(a):'')+
      '<button type="button" class="secondary" data-sms="'+esc(eid)+'">📱 On-my-way text</button>'+
      '</div></article>';
  }).join('');
  main.innerHTML=
    '<header class="page-head"><div><h1>Dispatch board</h1><p>'+esc(stops.length)+' stop'+(stops.length===1?'':'s')+' · '+esc(board.date)+'</p></div>'+
    '<div class="page-tools"><button type="button" class="secondary" id="h38DispatchBack">← Fleet</button></div></header>'+
    '<div class="grid"><section class="card span12 h38-dispatch-card"><div class="row-top" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
    '<label style="margin:0">Date '+dateInput+'</label>'+
    '<button type="button" id="h38DispatchShare" class="secondary" style="min-height:44px">📍 Share my location (on shift)</button>'+
    '<button type="button" id="h38DispatchSim" class="secondary" style="min-height:44px">'+(sim.on?'⏹ Stop simulation':'▶ Simulate crews')+'</button>'+
    (gpsTrackingEnabled()?'':'<small class="h38-dispatch-note">Live location sharing needs Settings → Owner Controls → GPS location tracking.</small>')+
    '</div><div id="h38DispatchMap" class="h38-dispatch-map" style="margin-top:10px"><div class="h38-dispatch-note" style="padding:16px">Loading map…</div></div></section>'+
    '<section class="card span12"><h2>Stops</h2><div class="h38-dispatch-board">'+
    (cards||'<p class="h38-dispatch-note">No scheduled stops for this date.</p>')+
    '</div></section></div>';
  // wire
  document.getElementById('h38DispatchBack').onclick=function(){closeDispatch();if(typeof w.openPage==='function')w.openPage('fleet');};
  document.getElementById('h38DispatchDate').onchange=function(e){stopWatch();simulate(false);renderDispatch(e.target.value);};
  document.getElementById('h38DispatchShare').onclick=function(){watchCrewPositions();};
  document.getElementById('h38DispatchSim').onclick=function(){simulate(!sim.on);renderDispatch(board.date);};
  main.querySelectorAll('[data-assign]').forEach(function(b){b.onclick=function(){var s=stops.find(function(x){return eventIdOf(x)===b.getAttribute('data-assign');});if(s)openAssignDialog(s);};});
  main.querySelectorAll('[data-status]').forEach(function(b){b.onclick=async function(){
    try{await setStatus(b.getAttribute('data-status'),b.getAttribute('data-to'));renderDispatch(board.date);}catch(err){toast(text(err&&err.message||err),true);}
  };});
  main.querySelectorAll('[data-sms]').forEach(function(b){b.onclick=function(){var s=stops.find(function(x){return eventIdOf(x)===b.getAttribute('data-sms');});if(s)openOnMyWayDialog(s);};});
  // map loads on demand (never blocks the board)
  initMap(stops).catch(function(){});
  return true;
}
function closeDispatch(){
  board.open=false;stopWatch();simulate(false);
  if(board.map){try{board.map.remove();}catch(_){}board.map=null;board.markers=[];}
}
function openDispatch(dateStr){return renderDispatch(dateStr||todayStr());}

// ---------- Fleet page entry (toggle-gated card; no second nav tree) ----------
function fleetHook(){
  if(typeof document==='undefined')return;
  var onFleet=text(w.state&&w.state.page)==='fleet';
  var card=document.getElementById('h38GpsDispatchEntry');
  if(!onFleet||!enabled()){if(card)card.remove();return;}
  ensureStyle();
  var main=document.getElementById('mainContent');
  if(!main)return;
  if(!card){
    card=document.createElement('section');
    card.id='h38GpsDispatchEntry';card.className='card h38-dispatch-card';
    var grid=main.querySelector('.grid');
    (grid||main).prepend(card);
  }
  var stops=dayEvents(todayStr());
  var counts={assigned:0,enroute:0};
  stops.forEach(function(s){var a=assignmentFor(eventIdOf(s));var st=text(v(a,'Status'));if(st==='Assigned')counts.assigned++;if(st==='En Route')counts.enroute++;});
  card.innerHTML='<div class="row-top" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'+
    '<div><h2 style="margin:0">🛰️ Dispatch board</h2><small>'+esc(stops.length)+' stop'+(stops.length===1?'':'s')+' today · '+counts.assigned+' dispatched · '+counts.enroute+' en route</small></div>'+
    '<button type="button" id="h38GpsDispatchOpen" style="min-height:48px;padding:10px 18px">Open dispatch board</button></div>';
  document.getElementById('h38GpsDispatchOpen').onclick=function(){openDispatch();};
}

// ---------- install ----------
registerFeature();
if(typeof w!=='undefined'&&w.addEventListener){
  w.addEventListener('h38:office-page-rendered',function(e){if(e&&e.detail&&e.detail.page==='fleet')setTimeout(fleetHook,0);});
  w.addEventListener('h38:business-snapshot-updated',function(){if(board.open)setTimeout(function(){renderDispatch(board.date);},0);else setTimeout(fleetHook,0);});
  w.addEventListener('pageshow',function(){setTimeout(fleetHook,0);});
  if(w.document&&(w.document.readyState==='loading'))w.document.addEventListener('DOMContentLoaded',function(){setTimeout(fleetHook,0);},{once:true});
  else setTimeout(fleetHook,0);
}

w.H38Dispatch=Object.freeze({
  build:BUILD,
  enabled:enabled,
  gpsTrackingEnabled:gpsTrackingEnabled,
  openDispatch:openDispatch,
  closeDispatch:closeDispatch,
  renderDispatch:renderDispatch,
  dayEvents:dayEvents,
  assignmentFor:assignmentFor,
  saveAssignment:saveAssignment,
  setStatus:setStatus,
  composeOnMyWay:composeOnMyWay,
  sendOnMyWay:function(stop,etaMin,bodyOverride){
    // bodyOverride lets tests/dialogs supply the composed text directly.
    if(bodyOverride!==undefined&&w.H38Sms&&typeof w.H38Sms.sendSms==='function'){
      var to=normalizeE164(stopPhone(stop));
      if(!to){toast('No customer phone number on file for this stop.',true);return Promise.reject(new Error('No phone'));}
      var consent=text(v(stop.customer||{},'Consent Status','SMS Consent','Consent'));
      return w.H38Sms.sendSms({to:to,body:String(bodyOverride),consentStatus:consent||'Unknown',purpose:'Dispatch on-my-way text'})
        .then(function(r){toast('On-my-way text queued for owner approval.');return r;})
        .catch(function(err){toast(text(err&&err.message||err),true);throw err;});
    }
    return sendOnMyWay(stop,etaMin);
  },
  watchCrewPositions:watchCrewPositions,
  stopWatch:stopWatch,
  latestCrewPositions:latestCrewPositions,
  initMap:initMap,
  simulate:simulate,
  simTick:simTick,
  simState:function(){return{on:sim.on,crews:sim.crews.map(function(c){return{userId:c.userId,label:c.label,lat:c.lat,lng:c.lng};}),tick:sim.tick};},
  normalizeE164:normalizeE164,
  FEATURE:FEATURE_DEF
});
})();
