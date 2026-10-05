(function(){
'use strict';
// H38 Repair — vehicle bulletins for the Diagnose step.
//
// Toggle-gated: inherits the Repair Guide Owner Control (default OFF) — no
// separate toggle. Vehicles only (NHTSA data). The curated failure-chain
// warnings (repair-failure-chains.js) cover all equipment and work offline.
//
// - Recalls: NHTSA recalls API (free, no key). A safety recall the customer
//   does not know about is a service win and a trust builder.
// - Complaints: NHTSA complaints API — top complaint patterns for the vehicle.
// - TSBs: NHTSA's manufacturer-communications API is dead (403), so we do not
//   call it. Instead: one-tap web TSB search (general + site:nhtsa.gov) and a
//   deep link to NHTSA's own manufacturer-communications search.
// - VIN decode: vPIC decodes a 17-char VIN into year/make/model (auto-fill).
// Works offline gracefully: the NHTSA check is skipped with a note; the
// curated warnings are unaffected.
const BUILD='20261005-repair-bulletins-1';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STOP=new Set(('a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i,you,he,she,it,we,they,them,his,her,its,our,their,this,that,these,those,am,as,my,mine,your,yours,his,hers,ours,theirs,me,him,us,what,which,who,whom,how,why,where,because,until,since,without,within,along,among,between,beyond,during,except,like,near,toward,under,until,upon,versus,via,per,vs,etc').split(','));

// ---- session cache (don't hammer NHTSA) ----
const memCache={};
function cacheKey(o){return [text(o.year),text(o.make).toUpperCase(),text(o.model).toUpperCase()].join('|');}
function cacheGet(o){
  const k=cacheKey(o);
  if(memCache[k])return memCache[k];
  try{const raw=sessionStorage.getItem('h38-bulletins-'+k);if(raw){const v=JSON.parse(raw);memCache[k]=v;return v;}}catch(e){}
  return null;
}
function cacheSet(o,v){
  const k=cacheKey(o);memCache[k]=v;
  try{sessionStorage.setItem('h38-bulletins-'+k,JSON.stringify(v));}catch(e){}
}
function online(){try{return navigator.onLine!==false;}catch(e){return true;}}

async function fetchJson(url){
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),15000);
  try{
    const r=await fetch(url,{signal:ctl.signal});
    if(!r.ok)throw new Error('NHTSA request failed ('+r.status+')');
    return await r.json();
  }finally{clearTimeout(t);}
}

// ---- NHTSA lookups ----
async function checkVehicleBulletins(o){
  const v={year:text(o&&o.year),make:text(o&&o.make),model:text(o&&o.model)};
  if(!v.year||!v.make||!v.model)throw new Error('Year, make, and model are needed to check bulletins.');
  const hit=cacheGet(v);
  if(hit)return Object.assign({cached:true},hit);
  if(!online()){const err=new Error('offline');err.offline=true;throw err;}
  const q='make='+encodeURIComponent(v.make)+'&model='+encodeURIComponent(v.model)+'&modelYear='+encodeURIComponent(v.year);
  const [rec,comp]=await Promise.all([
    fetchJson('https://api.nhtsa.gov/recalls/recallsByVehicle?'+q).catch(()=>({results:[]})),
    fetchJson('https://api.nhtsa.gov/complaints/complaintsByVehicle?'+q).catch(()=>({results:[]}))
  ]);
  const recalls=(rec.results||[]).map(r=>({campaign:text(r.NHTSACampaignNumber),component:text(r.Component),summary:text(r.Summary)}));
  // top complaint patterns: group by component, keep the most-reported
  const byComp={};
  (comp.results||[]).forEach(c=>{
    const k=text(c.components)||'General';
    if(!byComp[k])byComp[k]={component:k,count:0,sample:''};
    byComp[k].count++;
    if(!byComp[k].sample)byComp[k].sample=text(c.summary).slice(0,160);
  });
  const complaints=Object.values(byComp).sort((a,b)=>b.count-a.count).slice(0,5);
  const out={vehicle:v,recalls:recalls,complaints:complaints,checkedAt:new Date().toISOString()};
  cacheSet(v,out);
  return Object.assign({cached:false},out);
}
async function decodeVin(vin){
  const v=text(vin).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'');
  if(v.length!==17)throw new Error('A VIN is 17 characters.');
  if(!online()){const err=new Error('offline');err.offline=true;throw err;}
  const d=await fetchJson('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/'+encodeURIComponent(v)+'?format=json');
  const get=name=>{const r=(d.Results||[]).find(x=>text(x.Variable)===name);return text(r&&r.Value);};
  return {year:get('Model Year'),make:get('Make'),model:get('Model')};
}

// ---- one-tap web TSB search (pragmatic fallback where the API has nothing) ----
function symptomKeywords(symptoms){
  const words=text(symptoms).toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w&&w.length>2&&!STOP.has(w));
  const seen=[];words.forEach(w=>{if(seen.indexOf(w)<0)seen.push(w);});
  return seen.slice(0,8).join(' ');
}
function tsbSearchUrls(o){
  const v={year:text(o&&o.year),make:text(o&&o.make),model:text(o&&o.model)};
  const base=[v.year,v.make,v.model].filter(Boolean).join(' ');
  const kw=symptomKeywords(o&&o.symptoms);
  const general='https://www.google.com/search?q='+encodeURIComponent([base,'TSB',kw].filter(Boolean).join(' '));
  const nhtsa='https://www.google.com/search?q='+encodeURIComponent(['site:nhtsa.gov',base,'manufacturer communications',kw].filter(Boolean).join(' '));
  return {general:general,nhtsa:nhtsa,query:[base,'TSB',kw].filter(Boolean).join(' ')};
}
const NHTSA_RECALLS_PAGE='https://www.nhtsa.gov/recalls';

// ---- panel HTML (called by site-visit-diagnose.js) ----
function bulletinsCard(d){
  const isVehicle=/vehicle/i.test(text(d&&d.equipType));
  if(!isVehicle)return '';
  const cached=cacheGet({year:d.year,make:d.make,model:d.model});
  const idOk=/vin/i.test(text(d.idType))&&text(d.identifier).replace(/[^A-HJ-NPR-Z0-9]/gi,'').length===17;
  const sym=text(d.symptoms)+' '+text(d.knownIssue);
  const tsb=tsbButtonsHtml({year:d.year,make:d.make,model:d.model},sym);
  return `<div class="field-card"><strong>Recalls &amp; bulletins</strong>`+
  `<span class="dx-hint">Safety recalls are free fixes at the dealer — if one is open, tell the customer. Complaint patterns show what else fails on this vehicle.</span>`+
  `<div class="dx-row"><button type="button" id="dxCheckBulletins" class="field-secondary">Check recalls &amp; bulletins</button>`+
  (idOk?`<button type="button" id="dxDecodeVin" class="field-secondary">Decode VIN to fill year/make/model</button>`:'')+`</div>`+
  `<div id="dxBulletinsResult" class="dx-bulletins-result">${cached?resultHtml(cached,sym):(tsb||'<p class="dx-hint">Enter the year, make, and model (or decode the VIN), then check for recalls.</p>')}</div></div>`;
}
function resultHtml(res,symptoms){
  const v=res.vehicle||{};
  const head=`<p class="dx-hint"><strong>${esc([v.year,v.make,v.model].filter(Boolean).join(' '))}</strong>`+
    (res.cached?' — checked earlier this session.':' — checked just now.')+`</p>`;
  const rec=res.recalls&&res.recalls.length
    ?`<div class="dx-recall-card"><div class="dx-warn-head"><span class="dx-recall-badge">OPEN RECALLS: ${res.recalls.length}</span></div>`+
      res.recalls.slice(0,5).map(r=>`<p><strong>${esc(r.component||'Recall')}</strong> (${esc(r.campaign)})<br>${esc(r.summary.slice(0,220))}${r.summary.length>220?'…':''}<br><em>Free fix at the dealer — tell the customer.</em></p>`).join('')+`</div>`
    :'<p class="dx-hint">No open recalls found for this vehicle.</p>';
  const comp=res.complaints&&res.complaints.length
    ?'<p class="dx-hint"><strong>Top complaint patterns</strong></p><ul class="dx-hint">'+res.complaints.map(c=>`<li><strong>${esc(c.component)}</strong> — ${c.count} report${c.count===1?'':'s'}. ${esc(c.sample)}${c.sample.length>=160?'…':''}</li>`).join('')+'</ul>'
    :'<p class="dx-hint">No complaint patterns found.</p>';
  return head+rec+comp+tsbButtonsHtml(v,symptoms);
}
function tsbButtonsHtml(v,symptoms){
  const vv={year:text(v&&v.year),make:text(v&&v.make),model:text(v&&v.model)};
  const sym=text(symptoms);
  if(!vv.year&&!vv.make&&!vv.model&&!sym)return '';
  const u=tsbSearchUrls({year:vv.year,make:vv.make,model:vv.model,symptoms:sym});
  return `<div class="dx-row"><span class="dx-hint" style="width:100%">Technical service bulletins live on the open web — search them directly:</span>`+
  `<a href="${esc(u.general)}" target="_blank" rel="noopener"><button type="button" class="field-secondary">Search TSBs online</button></a>`+
  `<a href="${esc(u.nhtsa)}" target="_blank" rel="noopener"><button type="button" class="field-secondary">Search NHTSA bulletins</button></a>`+
  `<a href="${esc(NHTSA_RECALLS_PAGE)}" target="_blank" rel="noopener"><button type="button" class="field-secondary">Open NHTSA recalls page</button></a></div>`;
}

// ---- styles (scoped, injected once) ----
function injectStyle(){
  if(document.getElementById('dxBulletinsStyle'))return;
  const st=document.createElement('style');
  st.id='dxBulletinsStyle';
  st.textContent=`
.dx-bulletins-result ul{margin:.3rem 0 .3rem 1.1rem}
.dx-bulletins-result li{margin:.25rem 0}
.dx-recall-card{border:1px solid #a33;border-left:6px solid #a33;background:#fff5f5;border-radius:10px;padding:.7rem .9rem;margin:.6rem 0}
.dx-recall-card p{margin:.4rem 0;font-size:.92rem;line-height:1.45}
.dx-recall-badge{font-size:.72rem;font-weight:900;padding:.15rem .5rem;border-radius:999px;background:#a33;color:#fff}
.dx-warn-head{display:flex;gap:.5rem;align-items:center;font-weight:900;margin-bottom:.25rem}
`;
  document.head.appendChild(st);
}
injectStyle();

window.H38RepairBulletins={
  BUILD:BUILD,
  checkVehicleBulletins:checkVehicleBulletins,
  decodeVin:decodeVin,
  tsbSearchUrls:tsbSearchUrls,
  symptomKeywords:symptomKeywords,
  bulletinsCard:bulletinsCard,
  resultHtml:resultHtml,
  tsbButtonsHtml:tsbButtonsHtml,
  cachedFor:function(o){return cacheGet(o);},
  isOnline:online
};
})();
