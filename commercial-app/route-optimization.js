(function(){
'use strict';
// H38 Route Optimization — daily stop-order optimizer for the Schedule page.
// Engine: offline nearest-neighbor construction + 2-opt improvement on haversine
// distances (no API key, no network needed). Optional OSRM adapter for real
// road distances via the PUBLIC OSRM test server (rate-limited, test/dev only —
// NOT for production). Automatic fallback to offline on any fetch failure.
// Bounded to MAX_STOPS stops so route math never blocks the UI.
const BUILD='20261005-route-2';
// v2 adds: Nominatim geocoding for address-only stops, per-tech filtering,
// time-window-aware sequencing (ETA simulation + greedy repair), manual
// reorder after optimization, Google Maps link, and driver-list copy.
const MAX_STOPS=50;
const AVG_MPH=35;
const EARTH_MILES=3958.8;

// ---------------------------------------------------------------------------
// Feature toggle registration (id-guarded; never edits owner-controls.js)
// ---------------------------------------------------------------------------
function registerToggle(){
  try{
    const f=window.H38OwnerControls&&window.H38OwnerControls.FEATURES;
    if(!Array.isArray(f))return;
    if(!f.some(x=>x&&x.id==='route_optimization')){
      f.push({id:'route_optimization',title:'Route optimization',desc:'Optimize daily stop order for drive time. Free geocoding + offline math; online routing when reachable — no API key needed.',icon:'',default:false,category:'Schedule'});
    }
  }catch(e){}
}
registerToggle();

// Provider config. 'osrm' = try public OSRM test server first, fall back to
// 'offline' automatically on ANY fetch/network/parse failure.
if(typeof window!=='undefined')window.H38RouteConfig=window.H38RouteConfig||{provider:'osrm',osrmUrl:'https://router.project-osrm.org'};

// ---------------------------------------------------------------------------
// Pure math core (no DOM, no app globals) — also exported for node tests.
// ---------------------------------------------------------------------------
function toRad(d){return d*Math.PI/180;}
function haversineMiles(aLat,aLng,bLat,bLng){
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*EARTH_MILES*Math.asin(Math.sqrt(s));
}
function minutesFor(miles){return miles/AVG_MPH*60;}
function validCoords(lat,lng){
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&!(lat===0&&lng===0);
}
function distMatrix(stops){
  const n=stops.length,m=new Array(n);
  for(let i=0;i<n;i++){m[i]=new Array(n);
    for(let j=0;j<n;j++)m[i][j]=i===j?0:haversineMiles(stops[i].lat,stops[i].lng,stops[j].lat,stops[j].lng);}
  return m;
}
// Nearest-neighbor construction: start at stop 0, always go to the nearest
// unvisited stop. Fast O(n^2), gives a decent initial tour.
function nearestNeighbor(stops,matrix){
  const n=stops.length;
  if(n<=1)return stops.map((_,i)=>i);
  const m=matrix||distMatrix(stops);
  const seen=new Array(n).fill(false),order=[0];
  seen[0]=true;
  while(order.length<n){
    const last=order[order.length-1];let best=-1,bd=Infinity;
    for(let j=0;j<n;j++){if(seen[j])continue;if(m[last][j]<bd){bd=m[last][j];best=j;}}
    seen[best]=true;order.push(best);
  }
  return order;
}
function tourMiles(order,matrix){
  let t=0;
  for(let i=0;i+1<order.length;i++)t+=matrix[order[i]][order[i+1]];
  return t;
}
// 2-opt: reverse any segment that shortens the tour; repeat until no
// improvement. O(n^2) per sweep, bounded sweeps for UI safety.
function twoOpt(stops,matrix,order){
  const n=order.length;
  if(n<4)return order.slice();
  const m=matrix||distMatrix(stops);
  let cur=order.slice(),best=tourMiles(cur,m),improved=true,sweeps=0;
  while(improved&&sweeps<40){
    improved=false;sweeps++;
    for(let i=0;i<n-1&&!improved;i++){
      for(let j=i+2;j<n;j++){
        if(i===0&&j===n-1)continue; // open tour: keep first stop fixed
        const trial=cur.slice(0,i+1).concat(cur.slice(i+1,j+1).reverse(),cur.slice(j+1));
        const t=tourMiles(trial,m);
        if(t<best-1e-9){cur=trial;best=t;improved=true;}
      }
    }
  }
  return cur;
}
// Main optimizer entry. stops=[{id,lat,lng,label}]. Returns stop-id order,
// per-leg miles/minutes, and totals (minutes at AVG_MPH).
function optimize(stops){
  const clean=(stops||[]).filter(s=>s&&s.id&&validCoords(num(s.lat),num(s.lng)));
  if(clean.length>MAX_STOPS)clean.length=MAX_STOPS;
  const n=clean.length;
  if(!n)return{order:[],totalMiles:0,totalMinutes:0,legs:[],nnTotalMiles:0,provider:'offline'};
  const m=distMatrix(clean);
  const nn=nearestNeighbor(clean,m);
  const nnTotal=tourMiles(nn,m);
  const order=twoOpt(clean,m,nn);
  const total=tourMiles(order,m);
  const legs=[];
  for(let i=0;i+1<order.length;i++){
    const miles=m[order[i]][order[i+1]];
    legs.push({from:clean[order[i]].id,to:clean[order[i+1]].id,miles,minutes:minutesFor(miles)});
  }
  return{order:order.map(i=>clean[i].id),totalMiles:total,totalMinutes:minutesFor(total),legs,nnTotalMiles:nnTotal,provider:'offline'};
}
function num(x){const n=Number(x);return Number.isFinite(n)?n:0;}

// ---------------------------------------------------------------------------
// OSRM adapter — PUBLIC TEST SERVER ONLY (rate-limited). Real road distances.
// ---------------------------------------------------------------------------
function coordList(stops){return stops.map(s=>s.lng.toFixed(6)+','+s.lat.toFixed(6)).join(';');}
function osrmBase(){const c=gWindow().H38RouteConfig||{};return String(c.osrmUrl||'https://router.project-osrm.org').replace(/\/+$/,'');}
// Matrix request: one call returns all-pairs distance+duration.
function osrmTableUrl(stops){return osrmBase()+'/table/v1/driving/'+coordList(stops)+'?annotations=distance,duration';}
// Route request: one call returns the leg-by-leg geometry-free summary.
function osrmRouteUrl(stops){return osrmBase()+'/route/v1/driving/'+coordList(stops)+'?overview=false&annotations=false';}
// OSRM adapter: table + route API client for the public OSRM test server.
// TEST-ONLY: router.project-osrm.org is rate-limited and not for production.
// Any fetch/network/parse failure must fall back to the offline optimizer.
function osrmAdapter(baseUrl){
  const base=String(baseUrl||osrmBase()).replace(/\/+$/,'');
  const coords=stops=>stops.map(s=>s.lng.toFixed(6)+','+s.lat.toFixed(6)).join(';');
  return{
    baseUrl:base,
    tableUrl(stops){return base+'/table/v1/driving/'+coords(stops)+'?annotations=distance,duration';},
    routeUrl(stops){return base+'/route/v1/driving/'+coords(stops)+'?overview=false&annotations=false';},
    async matrix(stops){
      const res=await fetch(this.tableUrl(stops));
      if(!res.ok)throw new Error('OSRM table HTTP '+res.status);
      const j=await res.json();
      if(j.code!=='Ok'||!Array.isArray(j.distances))throw new Error('OSRM table: '+(j.code||'bad response'));
      return j;
    },
    async route(stops){
      const res=await fetch(this.routeUrl(stops));
      if(!res.ok)throw new Error('OSRM route HTTP '+res.status);
      const j=await res.json();
      if(j.code!=='Ok'||!j.routes||!j.routes[0])throw new Error('OSRM route: '+(j.code||'bad response'));
      return j.routes[0];
    },
    async optimize(stops){return osrmOptimizeWithBase(stops,this);}
  };
}
async function osrmOptimizeWithBase(stops,adapter){
  if(!stops.length)return{order:[],totalMiles:0,totalMinutes:0,legs:[],nnTotalMiles:0,provider:'osrm'};
  // 1) All-pairs road distance matrix (single request).
  const tJson=await adapter.matrix(stops);
  const n=stops.length;
  const matrix=tJson.distances.map(r=>r.map(d=>(Number.isFinite(d)?d:Infinity)/1609.344));
  const nn=nearestNeighbor(stops,matrix);
  const nnTotal=tourMiles(nn,matrix);
  const order=twoOpt(stops,matrix,nn);
  // 2) One route call on the optimized order for per-leg road miles/minutes.
  const ordered=order.map(i=>stops[i]);
  const route0=await adapter.route(ordered);
  const legs=(route0.legs||[]).map((leg,i)=>({from:ordered[i].id,to:ordered[i+1].id,miles:leg.distance/1609.344,minutes:leg.duration/60}));
  const totalMiles=route0.distance/1609.344,totalMinutes=route0.duration/60;
  return{order:ordered.map(s=>s.id),totalMiles,totalMinutes,legs,nnTotalMiles:nnTotal,provider:'osrm'};
}
async function osrmOptimize(stops){return osrmOptimizeWithBase(stops,osrmAdapter());}
async function optimizeWithProvider(stops,provider){
  const useOsrm=(provider||((gWindow().H38RouteConfig||{}).provider)||'osrm')==='osrm';
  if(useOsrm&&stops.length>1){
    try{return await osrmOptimize(stops);}
    catch(e){console.warn('[H38 route] OSRM failed, using offline fallback:',e&&e.message||e);}
  }
  return optimize(stops); // provider:'offline'
}

// ---------------------------------------------------------------------------
// Free geocoding — OpenStreetMap Nominatim (no API key). 1 request/second per
// the Nominatim usage policy. Fills customer Lat/Lng from real addresses.
// ---------------------------------------------------------------------------
async function geocodeAddress(query){
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q='+encodeURIComponent(query);
  const res=await fetch(url,{headers:{'Accept':'application/json'}});
  if(!res.ok)throw new Error('Geocode service HTTP '+res.status);
  const j=await res.json();
  if(!j||!j.length)throw new Error('No address match for: '+query);
  const lat=Number(j[0].lat),lng=Number(j[0].lon);
  if(!validCoords(lat,lng))throw new Error('Bad coordinates returned.');
  return{lat,lng};
}
async function geocodeMissingStops(plan,onProgress){
  let done=0,failed=0;
  for(const s of plan.stops){
    if(!s.needsCoords||!s.customerId)continue;
    const q=String(s.address||'').trim();
    if(!q){failed++;continue;}
    try{
      const g=await geocodeAddress(q);
      await setCustomerCoords(s.customerId,g.lat,g.lng,false);
      s.lat=g.lat;s.lng=g.lng;s.needsCoords=false;done++;
    }catch(e){failed++;}
    if(typeof onProgress==='function')try{onProgress(done,failed);}catch(e2){}
    await new Promise(r=>setTimeout(r,1100)); // Nominatim policy: max 1 req/sec
  }
  return{done,failed};
}

// ---------------------------------------------------------------------------
// Time-window layer — pure math. Each stop keeps its scheduled window
// [windowStart, windowEnd]. simulateETAs drives the order with the distance
// matrix; enforceTimeWindows greedily moves late stops earlier (bounded).
// ---------------------------------------------------------------------------
function stopWindow(stop){
  const s=stop.startTime?new Date(stop.startTime).getTime():NaN;
  const e=stop.endTime?new Date(stop.endTime).getTime():NaN;
  return{
    start:Number.isFinite(s)?s:NaN,
    end:Number.isFinite(e)?e:(Number.isFinite(s)?s+60*60000:NaN)
  };
}
function serviceMinutes(stop){
  const w=stopWindow(stop);
  if(Number.isFinite(w.start)&&Number.isFinite(w.end))
    return Math.max(15,Math.min(480,(w.end-w.start)/60000));
  return 60;
}
// orderedStops: array of stop objects; matrix: haversine-mile matrix over the
// same order; departMs: epoch ms when the driver leaves. If a stop has a
// scheduled start, the driver may wait for it — arriving early is fine,
// arriving after windowEnd is a violation.
function simulateETAs(orderedStops,matrix,departMs){
  const rows=[];let t=Number.isFinite(departMs)?departMs:Date.now();
  for(let i=0;i<orderedStops.length;i++){
    const legMin=i===0?0:minutesFor(matrix[i-1][i]);
    const arrival=t+legMin*60000;
    const w=stopWindow(orderedStops[i]);
    const svc=serviceMinutes(orderedStops[i])*60000;
    const depart=Math.max(arrival,Number.isFinite(w.start)?w.start:arrival)+svc;
    const lateMin=Number.isFinite(w.end)?Math.max(0,(arrival-w.end)/60000):0;
    rows.push({stop:orderedStops[i],arrival,depart,legMin,late:lateMin>0,lateMin});
    t=depart;
  }
  return rows;
}
function countLate(rows){return rows.filter(r=>r.late).length;}
function subMatrixFor(order,m){
  const n=order.length,r=new Array(n);
  for(let i=0;i<n;i++){r[i]=new Array(n);
    for(let j=0;j<n;j++)r[i][j]=m[order[i]][order[j]];}
  return r;
}
// Greedy repair: move the first late stop earlier until violations stop
// shrinking. Bounded to 25 iterations; remaining violations are flagged for
// the owner to reschedule (never silently dropped).
function enforceTimeWindows(stops,m,order,departMs){
  let cur=order.slice(),guard=0;
  const rowsFor=ord=>simulateETAs(ord.map(i=>stops[i]),subMatrixFor(ord,m),departMs);
  let best=rowsFor(cur);
  while(countLate(best)>0&&guard<25){
    guard++;
    const lateIdx=best.findIndex(r=>r.late);
    if(lateIdx<0)break;
    let improved=false;
    const baseMiles=tourMiles(cur,subMatrixFor(cur,m));
    for(let pos=0;pos<lateIdx;pos++){
      const trial=cur.slice();
      const mv=trial.splice(lateIdx,1)[0];
      trial.splice(pos,0,mv);
      const rows=rowsFor(trial);
      const lateNow=countLate(rows),lateBefore=countLate(best);
      if(lateNow<lateBefore||(lateNow===lateBefore&&tourMiles(trial,subMatrixFor(trial,m))<baseMiles-1e-9)){
        cur=trial;best=rows;improved=true;break;
      }
    }
    if(!improved)break;
  }
  return{order:cur,rows:best,late:countLate(best)};
}
function fmtClock(ms){
  try{return new Date(ms).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}catch(e){return'';}
}

// ---------------------------------------------------------------------------
// App data layer: planForDate / setCustomerCoords / applyPlan
// ---------------------------------------------------------------------------
// Test seams: injected stubs override app globals in node tests.
let R_records=null,R_queueOperation=null,R_newId=null,R_now=null,R_v=null,R_window=null;
function gWindow(){if(R_window)return R_window;if(typeof window!=='undefined')return window;return {};}
function gRec(name){if(R_records)return R_records(name)||[];return(typeof records==='function'?records(name):[])||[];}
function gV(row){if(R_v)return R_v.apply(null,arguments);if(typeof v==='function')return v.apply(null,arguments);return '';}
function gQueue(op){if(R_queueOperation)return R_queueOperation.apply(null,arguments);return queueOperation.apply(null,arguments);}
function gNewId(p){if(R_newId)return R_newId(p);return newId(p);}
function gNow(){if(R_now)return R_now();return now();}
function findRow(rows,idKey,id){const sid=String(id);return rows.find(r=>String(gV(r,idKey))===sid);}
function dayOf(iso){return String(iso||'').slice(0,10);}
function techName(uid){
  if(!uid)return'';
  const u=findRow(gRec('users'),'User ID',uid);
  return u?gV(u,'Display Name','Email'):'';
}
// planForDate(dateStr, techId?) — techId filters stops to one assigned user
// so each tech's route can be optimized separately.
function planForDate(dateStr,techId){
  const events=gRec('scheduleEvents').filter(e=>{
    if(String(gV(e,'Status')).toUpperCase()==='CANCELLED')return false;
    if(techId&&String(gV(e,'Assigned User ID'))!==String(techId))return false;
    return dayOf(gV(e,'Start Time'))===dateStr;
  }).sort((a,b)=>String(gV(a,'Start Time')).localeCompare(String(gV(b,'Start Time'))));
  const jobs=gRec('jobs'),customers=gRec('customers');
  const stops=events.map(e=>{
    const eventId=gV(e,'Schedule Event ID');
    const job=findRow(jobs,'Job ID',gV(e,'Related Record ID'))||null;
    const cust=job?findRow(customers,'Customer ID',gV(job,'Customer ID')):null;
    const custId=cust?String(gV(cust,'Customer ID')):'';
    const lat=Number(cust?gV(cust,'Lat','Latitude'):''),lng=Number(cust?gV(cust,'Lng','Longitude'): '');
    const has=validCoords(lat,lng);
    const assignedUserId=gV(e,'Assigned User ID');
    return{id:eventId,eventId,label:gV(e,'Title')||'(untitled)',startTime:gV(e,'Start Time'),endTime:gV(e,'End Time'),
      customerId:custId,customerName:cust?gV(cust,'Customer Name'):'',
      address:gV(e,'Location')||(cust?gV(cust,'Service Address','Address','Street Address'):''),
      assignedUserId,assignedName:techName(assignedUserId),
      lat:has?lat:null,lng:has?lng:null,needsCoords:!has,simulated:false,row:e};
  });
  return{date:dateStr,techId:techId||'',stops};
}
function techOptions(){
  const users=gRec('users')||[];
  return users.map(u=>({id:String(gV(u,'User ID')),name:gV(u,'Display Name','Email')||String(gV(u,'User ID'))}))
    .filter(x=>x.id&&x.name);
}
async function setCustomerCoords(customerId,lat,lng,simulated){
  const row=findRow(gRec('customers'),'Customer ID',customerId);
  if(!row)throw new Error('Customer not found.');
  if(!validCoords(lat,lng))throw new Error('Invalid coordinates.');
  const record=Object.assign({},row,{Lat:lat,Lng:lng,'Route Coords Simulated':simulated?'Yes':'', 'Updated Time':gNow(),'Record Version':num(gV(row,'Record Version'))+1});
  await gQueue('SAVE_ENTITY','Customer',customerId,{entity:'customers',record},{collection:'customers',record,idKeys:['Customer ID']});
  return record;
}
// Test helper: fill obviously-fake coordinates (labeled SIMULATED) for every
// stop whose customer lacks them.
async function fillSimulatedCoords(plan){
  const base={lat:47.2372,lng:-93.5302}; // Grand Rapids MN — simulated test coords
  let n=0;
  for(const s of plan.stops){
    if(!s.needsCoords||!s.customerId)continue;
    const lat=+(base.lat+(n*0.011)).toFixed(5),lng=+(base.lng+(n*0.017)).toFixed(5);
    await setCustomerCoords(s.customerId,lat,lng,true);
    s.lat=lat;s.lng=lng;s.needsCoords=false;s.simulated=true;n++;
  }
  return n;
}
async function applyPlan(plan,optResult,providerUsed){
  if(!plan||!optResult||!optResult.order.length)throw new Error('Nothing to apply.');
  const bid=gWindow().state&&gWindow().state.businessId;
  if(!bid)throw new Error('Open a business first.');
  const order=optResult.order;
  const writes=[];
  for(let i=0;i<order.length;i++){
    const stop=plan.stops.find(s=>s.id===order[i]);
    if(!stop)continue;
    const record=Object.assign({},stop.row,{'Route Order':i+1,'Updated Time':gNow(),'Record Version':num(gV(stop.row,'Record Version'))+1});
    writes.push(gQueue('SAVE_SCHEDULE','Schedule Event',stop.eventId,{scheduleEventId:stop.eventId,routeOrder:i+1},{collection:'scheduleEvents',record,idKeys:['Schedule Event ID']}));
  }
  await Promise.all(writes);
  const planId=gNewId('ROUTEPLAN');
  const rec={'Plan ID':planId,'Business ID':bid,'Date':plan.date,'Stop IDs':JSON.stringify(order),'Total Miles':+optResult.totalMiles.toFixed(2),'Total Minutes':Math.round(optResult.totalMinutes),'Provider':providerUsed||optResult.provider||'offline','Status':'Applied','Created Time':gNow(),'Record Version':1};
  await gQueue('SAVE_ENTITY','Route Plan',planId,{entity:'routePlans',record:rec},{collection:'routePlans',record:rec,idKeys:['Plan ID']});
  return{planId,stopCount:order.length};
}

// ---------------------------------------------------------------------------
// UI — route planner section on the Schedule page (toggle-gated)
// ---------------------------------------------------------------------------
function toggleOn(){
  try{return !!(window.H38OwnerControls&&window.H38OwnerControls.isEnabled('route_optimization'));}catch(e){return false;}
}
function tomorrowStr(){const d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
let uiState=null; // {plan, result}
function escht(s){const t=String(s==null?'':s);if(typeof esc==='function')return esc(t);return t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderRouteSection(){
  const host=document.getElementById('routePlannerMount');
  if(!host)return;
  const s=uiState,plan=s&&s.plan,result=s&&s.result;
  const techs=techOptions();
  const selTech=(plan&&plan.techId)||'',leaveAt=(s&&s.leaveAt)||'08:00';
  const techOpts='<option value="">Everyone</option>'+techs.map(t=>`<option value="${escht(t.id)}"${t.id===selTech?' selected':''}>${escht(t.name)}</option>`).join('');
  let body='';
  if(!plan){
    body=`<p class="muted">Pick a day (and optionally one tech), then build the stop list from scheduled jobs.</p>`;
  }else if(!plan.stops.length){
    body=`<div class="notice">No scheduled jobs on ${escht(plan.date)}${selTech?' for this tech':''}. Nothing to optimize.</div>`;
  }else{
    const stopRows=plan.stops.map(st=>{
      const badge=st.needsCoords?'<span class="pill bad">needs coordinates</span>':(st.simulated?'<span class="pill warn">simulated coords</span>':'<span class="pill">coords set</span>');
      return`<div class="row"><div class="row-top"><strong>${escht(st.label)}</strong>${badge}</div><small>${escht(st.customerName||'No linked customer')}${st.assignedName?` · ${escht(st.assignedName)}`:''}${st.lat!=null?` · ${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}`:''}${st.address?`<br>${escht(st.address)}`:''}</small>${st.needsCoords&&st.customerId?`<div class="h38-route-coords"><input inputmode="decimal" data-rc-lat="${escht(st.customerId)}" placeholder="Lat"><input inputmode="decimal" data-rc-lng="${escht(st.customerId)}" placeholder="Lng"><button type="button" class="secondary" data-rc-save="${escht(st.customerId)}">Save coords</button></div>`:''}</div>`;
    }).join('');
    body=`<h3>Stops (${plan.stops.length})</h3><div class="list">${stopRows}</div>`;
    const missing=plan.stops.filter(x=>x.needsCoords);
    if(result){
      const prov=result.provider==='osrm'?'OSRM road':(result.provider==='offline-manual'?'Offline (manual reorder)':'Offline calc');
      const etaById={};(result.etas||[]).forEach(r=>{etaById[r.stop.id]=r;});
      const orderRows=result.order.map((id,i)=>{
        const st=plan.stops.find(x=>x.id===id);
        const leg=result.legs[i-1];
        const eta=etaById[id];
        const lateTag=eta&&eta.late?`<span class="pill bad">arrives ${Math.round(eta.lateMin)} min late</span>`:'';
        const etaTag=eta?`<span class="pill">ETA ${escht(fmtClock(eta.arrival))}</span>`:'';
        return`<div class="row"><div class="row-top"><strong>${i+1}. ${escht(st?st.label:id)}</strong><span class="h38-route-mv"><button type="button" class="secondary" data-h38-route-up="${escht(id)}" title="Move earlier">↑</button><button type="button" class="secondary" data-h38-route-down="${escht(id)}" title="Move later">↓</button></span></div><small>${etaTag}${lateTag}${leg?` ${leg.miles.toFixed(1)} mi · ${Math.round(leg.minutes)} min from prior`:''}${st&&st.address?`<br>${escht(st.address)}`:''}</small></div>`;
      }).join('');
      const lateN=result.etas?result.etas.filter(r=>r.late).length:0;
      body+=`<h3>Optimized order <span class="pill">${prov}</span></h3>`;
      if(lateN>0)body+=`<div class="notice bad">${lateN} stop${lateN===1?'':'s'} may miss ${lateN===1?'its':'their'} scheduled time window. Consider rescheduling or reordering above.</div>`;
      body+=`<div class="list">${orderRows}</div><p><strong>Totals:</strong> ${result.totalMiles.toFixed(1)} miles · about ${Math.round(result.totalMinutes)} minutes driving</p><div class="actions"><button type="button" class="primary" id="h38RouteApply">Apply to schedule</button><button type="button" class="secondary" id="h38RouteDriver">Copy driver list</button><a class="secondary" id="h38RouteMaps" href="${escht(googleMapsUrl(plan,result.order))}" target="_blank" rel="noopener" style="text-decoration:none">Open in Google Maps</a></div><p class="muted small">Tip: use ↑ ↓ to fine-tune the order by hand after optimizing.</p>`;
    }else{
      body+=`<div class="actions"><button type="button" class="primary" id="h38RouteOptimize">Optimize</button>${missing.some(x=>x.customerId&&x.address)?'<button type="button" class="secondary" id="h38RouteGeo">Geocode addresses (free)</button>':''}${missing.some(x=>x.needsCoords&&x.customerId)?'<button type="button" class="secondary" id="h38RouteSim">Use simulated coordinates (test)</button>':''}</div><p class="muted small">Free geocoding looks up customer addresses via OpenStreetMap and saves the coordinates on the customer record (about 1 second per stop).</p>`;
    }
  }
  host.innerHTML=`
    <h2>Route planner</h2>
    <p class="muted">Order the day's stops to cut drive time. Free geocoding + offline math by default; OSRM test server when reachable (test-only, rate-limited).</p>
    <div class="h38-route-controls">
      <label>Date <input type="date" id="h38RouteDate" value="${escht((plan&&plan.date)||tomorrowStr())}"></label>
      <label>Tech <select id="h38RouteTech">${techOpts}</select></label>
      <label>Leave at <input type="time" id="h38RouteLeave" value="${escht(leaveAt)}"></label>
      <div class="actions"><button type="button" id="h38RouteBuild">Build route</button></div>
    </div>${body}`;
  const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
  const readControls=()=>({
    date:document.getElementById('h38RouteDate').value||tomorrowStr(),
    tech:document.getElementById('h38RouteTech').value||'',
    leave:document.getElementById('h38RouteLeave').value||'08:00'
  });
  on('h38RouteBuild',()=>{
    const c=readControls();
    uiState={plan:planForDate(c.date,c.tech),result:null,leaveAt:c.leave};
    renderRouteSection();
    toast(`Route plan built: ${uiState.plan.stops.length} stop(s) on ${c.date}${c.tech?' for '+techName(c.tech):''}.`);
  });
  // Rebuild a result object from an id-order using the local haversine matrix.
  const rebuild=(orderIds,label)=>{
    const ready=uiState.plan.stops.filter(x=>!x.needsCoords&&x.lat!=null);
    const byId={};ready.forEach(x=>{byId[x.id]=x;});
    const orderedIds=orderIds.filter(id=>byId[id]);
    const ordered=orderedIds.map(id=>byId[id]);
    const m=distMatrix(ordered);
    const idx=orderedIds.map((_,i)=>i);
    const total=tourMiles(idx,m);
    const legs=[];
    for(let i=0;i+1<orderedIds.length;i++)legs.push({from:orderedIds[i],to:orderedIds[i+1],miles:m[i][i+1],minutes:minutesFor(m[i][i+1])});
    const departMs=new Date(uiState.plan.date+'T'+uiState.leaveAt).getTime();
    const rows=simulateETAs(ordered,m,departMs);
    return{order:orderedIds,totalMiles:total,totalMinutes:minutesFor(total),legs,etas:rows,provider:label||'offline-manual'};
  };
  on('h38RouteOptimize',async()=>{
    if(!uiState||!uiState.plan)return;
    const btn=document.getElementById('h38RouteOptimize');
    if(btn){btn.disabled=true;btn.textContent='Optimizing…';}
    try{
      const ready=uiState.plan.stops.filter(x=>!x.needsCoords&&x.lat!=null);
      if(!ready.length){toast('No stops have coordinates yet. Geocode addresses or add coordinates first.',true);renderRouteSection();return;}
      const stops=ready.map(x=>({id:x.id,lat:x.lat,lng:x.lng,label:x.label}));
      const res=await optimizeWithProvider(stops);
      // Time-window sequencing: simulate ETAs, repair violations greedily.
      const byId={};ready.forEach(x=>{byId[x.id]=x;});
      const nnOrder=res.order.map(id=>ready.findIndex(x=>x.id===id)).filter(i=>i>=0);
      const m=distMatrix(ready);
      const departMs=new Date(uiState.plan.date+'T'+uiState.leaveAt).getTime();
      const fixed=enforceTimeWindows(ready,m,nnOrder,departMs);
      const orderedIds=fixed.order.map(i=>ready[i].id);
      const legs=[];const om=subMatrixFor(fixed.order,m);
      for(let i=0;i+1<orderedIds.length;i++)legs.push({from:orderedIds[i],to:orderedIds[i+1],miles:om[i][i+1],minutes:minutesFor(om[i][i+1])});
      const total=tourMiles(fixed.order,subMatrixFor(fixed.order,m));
      // Keep stops without coordinates at the end, flagged (never silently dropped).
      const missing=uiState.plan.stops.filter(x=>x.needsCoords).map(x=>x.id);
      uiState.result={order:orderedIds.concat(missing),totalMiles:total,totalMinutes:minutesFor(total),legs,etas:fixed.rows,provider:res.provider};
      renderRouteSection();
      const lateN=fixed.late;
      toast(`Optimized ${orderedIds.length} stop(s) via ${res.provider==='osrm'?'OSRM road data':'offline calculation'}${lateN?` — ${lateN} may miss a time window`:''}.`);
    }catch(e){toast('Optimization failed: '+(e&&e.message||e),true);renderRouteSection();}
  });
  on('h38RouteGeo',async()=>{
    if(!uiState||!uiState.plan)return;
    const btn=document.getElementById('h38RouteGeo');
    if(btn){btn.disabled=true;btn.textContent='Geocoding…';}
    try{
      const out=await geocodeMissingStops(uiState.plan,(d,f)=>{if(btn)btn.textContent=`Geocoding… ${d} ok / ${f} missed`;});
      uiState={plan:planForDate(uiState.plan.date,uiState.plan.techId),result:null,leaveAt:uiState.leaveAt};renderRouteSection();
      toast(out.done?`Geocoded ${out.done} address${out.done===1?'':'es'}${out.failed?`, ${out.failed} missed`:''}.`:'No addresses could be geocoded. Add coordinates manually.');
    }catch(e){toast('Geocoding failed: '+(e&&e.message||e),true);renderRouteSection();}
  });
  on('h38RouteSim',async()=>{
    if(!uiState||!uiState.plan)return;
    try{
      const n=await fillSimulatedCoords(uiState.plan);
      uiState={plan:planForDate(uiState.plan.date,uiState.plan.techId),result:null,leaveAt:uiState.leaveAt};renderRouteSection();
      toast(n?`Filled ${n} SIMULATED coordinate set(s) — test data only.`:'No stops needed simulated coordinates.');
    }catch(e){toast('Could not fill simulated coordinates: '+(e&&e.message||e),true);}
  });
  on('h38RouteApply',async()=>{
    if(!uiState||!uiState.plan||!uiState.result)return;
    try{
      const out=await applyPlan(uiState.plan,uiState.result,uiState.result.provider);
      toast(`Applied: ${out.stopCount} stop(s) reordered. Plan saved.`);
      if(typeof renderSchedule==='function')renderSchedule();
    }catch(e){toast('Apply failed: '+(e&&e.message||e),true);}
  });
  on('h38RouteDriver',()=>{
    if(!uiState||!uiState.plan||!uiState.result)return;
    const etaById={};(uiState.result.etas||[]).forEach(r=>{etaById[r.stop.id]=r;});
    const lines=uiState.result.order.map((id,i)=>{
      const st=uiState.plan.stops.find(x=>x.id===id)||{};
      const eta=etaById[id];
      return`${i+1}. ${st.label||id}${eta?` (ETA ${fmtClock(eta.arrival)})`:''}${st.customerName?` — ${st.customerName}`:''}${st.address?`\n   ${st.address}`:''}`;
    });
    const txt=`Route for ${uiState.plan.date}${uiState.plan.techId&&techName(uiState.plan.techId)?' — '+techName(uiState.plan.techId):''} (${uiState.result.totalMiles.toFixed(1)} mi, ~${Math.round(uiState.result.totalMinutes)} min driving):\n`+lines.join('\n');
    const done=()=>toast('Driver list copied — paste it into a text message.');
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,()=>toast('Copy failed.',true));}
    else{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){toast('Copy failed.',true);}ta.remove();}
  });
  host.querySelectorAll('[data-h38-route-up]').forEach(btn=>{
    btn.onclick=()=>{moveStop(btn.getAttribute('data-h38-route-up'),-1);};
  });
  host.querySelectorAll('[data-h38-route-down]').forEach(btn=>{
    btn.onclick=()=>{moveStop(btn.getAttribute('data-h38-route-down'),1);};
  });
  function moveStop(id,dir){
    if(!uiState||!uiState.result)return;
    const o=uiState.result.order.slice();
    const i=o.indexOf(id);const j=i+dir;
    if(i<0||j<0||j>=o.length)return;
    o[i]=o[j];o[j]=id;
    uiState.result=rebuild(o);
    renderRouteSection();
    toast('Order updated by hand — totals recalculated.');
  }
  host.querySelectorAll('[data-rc-save]').forEach(btn=>{
    btn.onclick=async()=>{
      const cid=btn.getAttribute('data-rc-save');
      const latEl=host.querySelector(`[data-rc-lat="${CSS.escape(cid)}"]`),lngEl=host.querySelector(`[data-rc-lng="${CSS.escape(cid)}"]`);
      const lat=Number(latEl&&latEl.value),lng=Number(lngEl&&lngEl.value);
      try{
        await setCustomerCoords(cid,lat,lng,false);
        uiState={plan:planForDate(uiState.plan.date,uiState.plan.techId),result:null,leaveAt:uiState.leaveAt};renderRouteSection();
        toast('Coordinates saved.');
      }catch(e){toast(e.message,true);}
    };
  });
}
function googleMapsUrl(plan,orderIds){
  const pts=orderIds.map(id=>plan.stops.find(x=>x.id===id)).filter(x=>x&&x.lat!=null);
  if(!pts.length)return'https://www.google.com/maps';
  return'https://www.google.com/maps/dir/'+pts.map(x=>x.lat.toFixed(6)+','+x.lng.toFixed(6)).join('/');
}

function mountRoutePlanner(){
  if(!toggleOn())return;
  let host=document.getElementById('routePlannerMount');
  if(!host){
    const main=document.getElementById('mainContent');
    if(!main)return;
    const grid=main.querySelector(':scope > .grid');
    host=document.createElement('section');
    host.className='card';host.id='routePlannerMount';
    (grid||main).insertAdjacentElement('afterend',host);
    const st=document.getElementById('h38RouteStyles');
    if(!st){
      const style=document.createElement('style');style.id='h38RouteStyles';
      style.textContent='.h38-route-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:10px}.h38-route-controls label{display:flex;flex-direction:column;gap:4px}.h38-route-controls input,.h38-route-controls select{min-height:42px}.h38-route-coords{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.h38-route-coords input{width:110px;min-height:40px}#routePlannerMount .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#routePlannerMount button{min-height:44px}.h38-route-mv{display:inline-flex;gap:4px;margin-left:8px}.h38-route-mv button{min-height:36px!important;min-width:40px;padding:2px 8px}#routePlannerMount .notice.bad{border-color:#b3261e;background:#fdeceb}@media(max-width:720px){.h38-route-controls{flex-direction:column;align-items:stretch}.h38-route-controls .actions{width:100%}.h38-route-controls .actions button{flex:1}}';
      document.head.appendChild(style);
    }
  }
  renderRouteSection();
}
// Wrap the canonical renderer (same pattern as office-scale-workflow) so the
// planner appears on the Schedule page only when the owner toggle is on.
function wire(){
  if(typeof window==='undefined'||typeof window.renderSchedule!=='function')return;
  const base=window.renderSchedule;
  if(base.__h38RouteWrapped)return;
  const wrapped=function(){
    const r=base.apply(this,arguments);
    try{mountRoutePlanner();}catch(e){console.warn('[H38 route] mount failed:',e);}
    return r;
  };
  wrapped.__h38RouteWrapped=true;
  window.renderSchedule=wrapped;
}
wire();
if(typeof window!=='undefined'){
  window.H38Route={optimize,optimizeWithProvider,osrmAdapter,planForDate,applyPlan,setCustomerCoords,fillSimulatedCoords,BUILD};
  window.H38Route.osrmTableUrl=osrmTableUrl;
  window.H38Route.osrmRouteUrl=osrmRouteUrl;
  window.H38RouteConfig=window.H38RouteConfig||{provider:'osrm',osrmUrl:'https://router.project-osrm.org'};
  window.H38_ROUTE_BUILD=BUILD;
}

// Node test export (browser-safe: guarded by typeof module).
if(typeof module!=='undefined'&&module.exports){
  module.exports={optimize,osrmAdapter,haversineMiles,nearestNeighbor,twoOpt,validCoords,osrmTableUrl,osrmRouteUrl,planForDate,applyPlan,setCustomerCoords,fillSimulatedCoords,optimizeWithProvider,stopWindow,serviceMinutes,simulateETAs,enforceTimeWindows,geocodeAddress,geocodeMissingStops,googleMapsUrl,MAX_STOPS,BUILD,
    __setGlobals(deps){ // test seam: inject stubs for records/queueOperation/newId/now/v/window
      if(deps.records)R_records=deps.records; if(deps.queueOperation)R_queueOperation=deps.queueOperation;
      if(deps.newId)R_newId=deps.newId; if(deps.now)R_now=deps.now;
      if(deps.v)R_v=deps.v; if(deps.window!==undefined)R_window=deps.window;
    }};
}
})();
