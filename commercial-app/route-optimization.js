(function(){
'use strict';
// H38 Route Optimization — daily stop-order optimizer for the Schedule page.
// Engine: offline nearest-neighbor construction + 2-opt improvement on haversine
// distances (no API key, no network needed). Optional OSRM adapter for real
// road distances via the PUBLIC OSRM test server (rate-limited, test/dev only —
// NOT for production). Automatic fallback to offline on any fetch failure.
// Bounded to MAX_STOPS stops so route math never blocks the UI.
const BUILD='20261004-route-1';
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
      f.push({id:'route_optimization',title:'Route optimization',desc:'Optimize daily stop order for drive time. Uses OSRM test server or offline calculation — no API key needed.',icon:'🗺️',default:false,category:'Schedule'});
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
function planForDate(dateStr){
  const events=gRec('scheduleEvents').filter(e=>{
    if(String(gV(e,'Status')).toUpperCase()==='CANCELLED')return false;
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
    return{id:eventId,eventId,label:gV(e,'Title')||'(untitled)',startTime:gV(e,'Start Time'),
      customerId:custId,customerName:cust?gV(cust,'Customer Name'):'',
      lat:has?lat:null,lng:has?lng:null,needsCoords:!has,simulated:false,row:e};
  });
  return{date:dateStr,stops};
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
  let body='';
  if(!plan){
    body=`<p class="muted">Pick a day, then build the stop list from scheduled jobs.</p>`;
  }else if(!plan.stops.length){
    body=`<div class="notice">No scheduled jobs on ${escht(plan.date)}. Nothing to optimize.</div>`;
  }else{
    const stopRows=plan.stops.map(st=>{
      const badge=st.needsCoords?'<span class="pill bad">needs coordinates</span>':(st.simulated?'<span class="pill warn">simulated coords</span>':'<span class="pill">coords ✓</span>');
      return`<div class="row"><div class="row-top"><strong>${escht(st.label)}</strong>${badge}</div><small>${escht(st.customerName||'No linked customer')}${st.lat!=null?` · ${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}`:''}</small>${st.needsCoords&&st.customerId?`<div class="h38-route-coords"><input inputmode="decimal" data-rc-lat="${escht(st.customerId)}" placeholder="Lat"><input inputmode="decimal" data-rc-lng="${escht(st.customerId)}" placeholder="Lng"><button type="button" class="secondary" data-rc-save="${escht(st.customerId)}">Save coords</button></div>`:''}</div>`;
    }).join('');
    body=`<h3>Stops (${plan.stops.length})</h3><div class="list">${stopRows}</div>`;
    if(result){
      const prov=result.provider==='osrm'?'OSRM road':'Offline calc';
      const orderRows=result.order.map((id,i)=>{
        const st=plan.stops.find(x=>x.id===id);
        const leg=result.legs[i-1];
        return`<div class="row"><div class="row-top"><strong>${i+1}. ${escht(st?st.label:id)}</strong></div><small>${leg?`${leg.miles.toFixed(1)} mi · ${Math.round(leg.minutes)} min from prior`:escht(st?st.startTime:'')}</small></div>`;
      }).join('');
      body+=`<h3>Optimized order <span class="pill">${prov}</span></h3><div class="list">${orderRows}</div><p><strong>Totals:</strong> ${result.totalMiles.toFixed(1)} miles · about ${Math.round(result.totalMinutes)} minutes driving</p><div class="actions"><button type="button" class="primary" id="h38RouteApply">Apply to schedule</button></div>`;
    }else{
      body+=`<div class="actions"><button type="button" class="primary" id="h38RouteOptimize">Optimize</button>${plan.stops.some(x=>x.needsCoords&&x.customerId)?'<button type="button" class="secondary" id="h38RouteSim">Use simulated coordinates (test)</button>':''}</div>`;
    }
  }
  host.innerHTML=`
    <h2>🗺️ Route planner</h2>
    <p class="muted">Order the day's stops to cut drive time. Offline calculation by default; OSRM test server when reachable (test-only, rate-limited).</p>
    <div class="h38-route-controls">
      <label>Date <input type="date" id="h38RouteDate" value="${escht((plan&&plan.date)||tomorrowStr())}"></label>
      <div class="actions"><button type="button" id="h38RouteBuild">Build route</button></div>
    </div>${body}`;
  const on=(id,fn)=>{const el=document.getElementById(id);if(el)el.onclick=fn;};
  on('h38RouteBuild',()=>{
    const d=document.getElementById('h38RouteDate').value||tomorrowStr();
    uiState={plan:planForDate(d),result:null};
    renderRouteSection();
    toast(`Route plan built: ${uiState.plan.stops.length} stop(s) on ${d}.`);
  });
  on('h38RouteOptimize',async()=>{
    if(!uiState||!uiState.plan)return;
    const btn=document.getElementById('h38RouteOptimize');
    if(btn){btn.disabled=true;btn.textContent='Optimizing…';}
    try{
      const ready=uiState.plan.stops.filter(x=>!x.needsCoords&&x.lat!=null);
      if(!ready.length){toast('No stops have coordinates yet. Add coordinates first.',true);renderRouteSection();return;}
      const stops=ready.map(x=>({id:x.id,lat:x.lat,lng:x.lng,label:x.label}));
      const res=await optimizeWithProvider(stops);
      // Keep stops without coordinates at the end, flagged (never silently dropped).
      const missing=uiState.plan.stops.filter(x=>x.needsCoords).map(x=>x.id);
      uiState.result=Object.assign({},res,{order:res.order.concat(missing)});
      renderRouteSection();
      toast(`Optimized ${res.order.length} stop(s) via ${res.provider==='osrm'?'OSRM road data':'offline calculation'}.`);
    }catch(e){toast('Optimization failed: '+(e&&e.message||e),true);renderRouteSection();}
  });
  on('h38RouteSim',async()=>{
    if(!uiState||!uiState.plan)return;
    try{
      const n=await fillSimulatedCoords(uiState.plan);
      uiState.result=null;renderRouteSection();
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
  host.querySelectorAll('[data-rc-save]').forEach(btn=>{
    btn.onclick=async()=>{
      const cid=btn.getAttribute('data-rc-save');
      const latEl=host.querySelector(`[data-rc-lat="${CSS.escape(cid)}"]`),lngEl=host.querySelector(`[data-rc-lng="${CSS.escape(cid)}"]`);
      const lat=Number(latEl&&latEl.value),lng=Number(lngEl&&lngEl.value);
      try{
        await setCustomerCoords(cid,lat,lng,false);
        uiState={plan:planForDate(uiState.plan.date),result:null};renderRouteSection();
        toast('Coordinates saved.');
      }catch(e){toast(e.message,true);}
    };
  });
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
      style.textContent='.h38-route-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:10px}.h38-route-controls label{display:flex;flex-direction:column;gap:4px}.h38-route-controls input{min-height:42px}.h38-route-coords{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.h38-route-coords input{width:110px;min-height:40px}#routePlannerMount .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#routePlannerMount button{min-height:44px}@media(max-width:720px){.h38-route-controls{flex-direction:column;align-items:stretch}.h38-route-controls .actions{width:100%}.h38-route-controls .actions button{flex:1}}';
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
  module.exports={optimize,osrmAdapter,haversineMiles,nearestNeighbor,twoOpt,validCoords,osrmTableUrl,osrmRouteUrl,planForDate,applyPlan,setCustomerCoords,fillSimulatedCoords,optimizeWithProvider,MAX_STOPS,BUILD,
    __setGlobals(deps){ // test seam: inject stubs for records/queueOperation/newId/now/v/window
      if(deps.records)R_records=deps.records; if(deps.queueOperation)R_queueOperation=deps.queueOperation;
      if(deps.newId)R_newId=deps.newId; if(deps.now)R_now=deps.now;
      if(deps.v)R_v=deps.v; if(deps.window!==undefined)R_window=deps.window;
    }};
}
})();
