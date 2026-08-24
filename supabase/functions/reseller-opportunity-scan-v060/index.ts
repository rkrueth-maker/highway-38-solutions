import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED=new Set(["ccf25333-47cd-42ca-a20b-cdbc63a8a695","6dd51b31-5974-4691-b8b8-83e5877528c0"]);
const U=Deno.env.get("SUPABASE_URL")||"",K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const UA="Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151 Safari/537.36 H38ResellerScout/0.1.60";
const DEFAULT_TERMS=["Milwaukee","DeWalt","Snap-on","generator","welder","toolbox","zero turn","pressure washer"];
const SELLING_FRICTION=.13,TRAVEL=.35,MIN_NET=25,MIN_ROI=30,TARGET=.25;
const COMP_CONCURRENCY=4;
function cors(r){const o=r.headers.get("origin")||"";return{"access-control-allow-origin":ORIGINS.has(o)?o:"https://appassets.androidplatform.net","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"no-store",vary:"Origin"}}
function json(r,s,b){return new Response(JSON.stringify(b),{status:s,headers:cors(r)})}
async function uid(r){const t=String(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!t)throw Error("Sign in required.");const x=await fetch(`${U}/auth/v1/user`,{headers:{authorization:`Bearer ${t}`,apikey:K}}),p=await x.json().catch(()=>({}));if(!x.ok||!p?.id)throw Error("Session expired.");return String(p.id)}
function dec(v){return String(v||"").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/&nbsp;|&#160;/gi," ").replace(/&ndash;/gi,"–").replace(/&mdash;/gi,"—")}
function strip(v){return dec(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function money(v){if(typeof v==="number"&&Number.isFinite(v))return v>0?v:0;const m=String(v||"").replace(/,/g,"").match(/\$\s*([0-9]{1,7}(?:\.\d{1,2})?)/);return m?Number(m[1]):0}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function abs(h,b){try{return new URL(dec(h),b).toString()}catch{return""}}
function meta(html,key){const e=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),a=html.match(new RegExp(`<meta\\b[^>]*(?:property|name|itemprop)=["']${e}["'][^>]*content=["']([^"']+)["']`,"i"))||html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${e}["']`,"i"));return a?dec(a[1]):""}
function friendly(v){return/tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|storage|toolbox|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|\btv\b|gaming|console|lego|heater|lighting|pump|welder|socket|wrench|ratchet|hammer|laser|level|zero turn|pressure washer|snowblower|stihl|husqvarna|milwaukee|dewalt|snap.?on/i.test(v)}
function matches(title,term){const a=title.toLowerCase(),b=term.toLowerCase(),p=b.split(/\s+/).filter(x=>x.length>2);return a.includes(b)||p.some(x=>a.includes(x))}
function titleClean(v){return strip(v).replace(/\s*[|\-–]\s*(craigslist|hibid).*$/i,"").trim().slice(0,220)}
async function get(url,timeout=7000){const c=new AbortController(),to=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:{"user-agent":UA,accept:"text/html,application/xhtml+xml,*/*;q=0.8","accept-language":"en-US,en;q=0.9"},redirect:"follow",signal:c.signal}),html=await r.text().catch(()=>"");if(!r.ok)throw Error(`HTTP ${r.status}`);return{url:r.url,html}}finally{clearTimeout(to)}}
function hav(a,b,c,d){const R=3958.7613,q=Math.PI/180,x=(c-a)*q,y=(d-b)*q,z=Math.sin(x/2)**2+Math.cos(a*q)*Math.cos(c*q)*Math.sin(y/2)**2;return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z))}
async function reversePostal(lat,lon){if(!Number.isFinite(lat)||!Number.isFinite(lon))return"";try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`,{headers:{"user-agent":UA,accept:"application/json"}}),p=await r.json().catch(()=>({}));return r.ok?String(p?.address?.postcode||"").match(/\d{5}/)?.[0]||"":""}catch{return""}}
async function geocode(q){q=strip(q).replace(/\b(?:pickup|location|auction|item)\b\s*:?/ig," ").replace(/\s+/g," ").trim().slice(0,100);if(q.length<3)return null;try{const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,{headers:{"user-agent":UA,accept:"application/json"}}),a=await r.json().catch(()=>[]),x=Array.isArray(a)&&a[0],lat=Number(x?.lat),lon=Number(x?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null}catch{return null}}
function discoverCL(html,base,term){const out=[],seen=new Set();for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){if(out.length>=12)break;const url=abs(m[1]||"",base),title=titleClean(m[2]||"");if(!url||seen.has(url)||title.length<5||(!/\.html(?:$|\?)/i.test(url)&&!/\/d\//i.test(url)))continue;if(!matches(title,term)&&!friendly(title))continue;seen.add(url);out.push({source:"Craigslist",term,title,url})}return out}
function discoverHB(html,base,term){const out=[],seen=new Set();for(const m of html.matchAll(/<a\b[^>]*href=["']([^"']*(?:\/lot\/|\/lot-information\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){if(out.length>=12)break;const url=abs(m[1]||"",base),title=titleClean(m[2]||"");if(!url||seen.has(url)||title.length<5||(!matches(title,term)&&!friendly(title)))continue;seen.add(url);out.push({source:"HiBid",term,title,url})}return out}
function clDetail(html,url,s){const plain=strip(html),title=titleClean(meta(html,"og:title")||html.match(/id=["']titletextonly["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||s.title||""),buy=money(meta(html,"product:price:amount"))||money(html.match(/class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||"")||money(plain.slice(0,4000)),image=meta(html,"og:image"),lat=Number(meta(html,"geo.position").split(/[;,]/)[0]||html.match(/latitude[^0-9-]*(-?\d+(?:\.\d+)?)/i)?.[1]),lon=Number(meta(html,"geo.position").split(/[;,]/)[1]||html.match(/longitude[^0-9-]*(-?\d+(?:\.\d+)?)/i)?.[1]),loc=strip(html.match(/class=["'][^"']*(?:mapaddress|postingtitletext)[^"']*["'][^>]*>([\s\S]{0,700}?)<\//i)?.[1]||"").replace(/^\(|\)$/g,"");if(title.length<5||!(buy>0))return null;return{...s,title,url,buy_price:buy,estimated_all_in:buy,image_url:image,lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,location_label:loc,detail_verified:true}}
function hbDetail(html,url,s){const plain=strip(html),title=titleClean(meta(html,"og:title")||html.match(/<h1\b[^>]*>([\s\S]{0,700}?)<\/h1>/i)?.[1]||s.title||""),bid=money(plain.match(/(?:Current Bid|High Bid|Winning Bid|Bid)\s*:?\s*(\$\s*[0-9,]+(?:\.\d{1,2})?)/i)?.[1]||""),pm=plain.match(/(?:buyer'?s?\s+premium|buyers? premium|\bBP\b)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i),premium=pm?clamp(Number(pm[1]),0,40):null,image=meta(html,"og:image"),loc=(plain.match(/(?:Pickup Location|Auction Location|Item Location|Location)\s*[:\-]\s*([^|]{4,100})/i)?.[1]||"").replace(/(?:Directions|Preview|Removal).*$/i,"").trim(),close=plain.match(/(?:Ends|Closing|Closes)\s*[:\-]?\s*([^|]{3,80})/i)?.[0]||"";if(title.length<5||!(bid>0))return null;return{...s,title,url,buy_price:bid,buyer_premium_pct:premium,buyer_premium_known:premium!==null,estimated_all_in:premium===null?null:Number((bid*(1+premium/100)).toFixed(2)),image_url:image,location_label:loc,closing_label:close,detail_verified:true}}
async function verifyLoc(row,ctx){if(!Number.isFinite(ctx.lat)||!Number.isFinite(ctx.lon))return{...row,distance_miles:null,location_verified:!!row.location_label};let d=null;if(Number.isFinite(Number(row.lat))&&Number.isFinite(Number(row.lon)))d=hav(ctx.lat,ctx.lon,Number(row.lat),Number(row.lon));else if(row.location_label){const g=await geocode(String(row.location_label));if(g)d=hav(ctx.lat,ctx.lon,g.lat,g.lon)}if(d==null||!Number.isFinite(d))return{...row,distance_miles:null,location_verified:false};if(d>ctx.radiusMiles*1.15)return null;return{...row,distance_miles:Number(d.toFixed(1)),location_verified:true}}
function fbSeeds(rows,terms){const out=[];for(const x of rows.slice(0,160)){const raw=`${x?.title||""} ${x?.text||""}`.trim(),title=titleClean(String(x?.title||x?.text||"")),buy=Number(x?.price||money(raw)),url=String(x?.url||"");if(title.length<4||!(buy>0)||!url.includes("facebook.com/marketplace/item/"))continue;if(!terms.some(t=>matches(raw,t))&&!friendly(raw))continue;out.push({source:"Facebook Marketplace",title,url,buy_price:buy,estimated_all_in:buy,image_url:String(x?.image_url||""),distance_miles:Number.isFinite(Number(x?.distance_miles))?Number(x.distance_miles):null,location_label:String(x?.location_label||""),detail_verified:true})}return out}
function compQuery(t){return t.replace(/\b(new|used|obo|firm|sale|for sale|lot|auction|pickup only|local pickup|sealed|brand new)\b/gi," ").replace(/[^a-z0-9+.# -]/gi," ").replace(/\s+/g," ").trim().slice(0,90)}
function fallbackQuery(t){const q=compQuery(t),models=q.match(/\b(?=[A-Z0-9-]{4,}\b)(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b/gi)||[],brand=q.match(/\b(Milwaukee|DeWalt|Makita|Ryobi|Bosch|Ridgid|Snap-on|Craftsman|Stihl|Husqvarna|Kobalt|Metabo|Festool|Nintendo|Sony|Microsoft|Apple|Samsung)\b/i)?.[0]||"";return[brand,...models.slice(0,2)].filter(Boolean).join(" ")||q.split(" ").slice(0,5).join(" ")}
function ebayPrices(html){const vals=[],push=v=>{const n=money(v);if(n>=5&&n<=25000)vals.push(n)};for(const card of html.matchAll(/<(?:li|div)\b[^>]*class=["'][^"']*(?:s-item|s-card)[^"']*["'][^>]*>([\s\S]{0,12000}?)<\/(?:li|div)>/gi)){const c=card[1]||"",m=c.match(/class=["'][^"']*(?:s-item__price|s-card__price)[^"']*["'][^>]*>([\s\S]{0,250}?)<\//i)||c.match(/itemprop=["']price["'][^>]*content=["']([0-9,.]+)["']/i);if(m)push(strip(m[1]||""))}if(vals.length<3){for(const m of html.matchAll(/class=["'][^"']*(?:s-item__price|s-card__price)[^"']*["'][^>]*>([\s\S]{0,250}?)<\//gi)){push(strip(m[1]||""));if(vals.length>=40)break}}return vals}
const compCache=new Map();
async function soldComp(title){const original=compQuery(title);if(!original)return{status:"no_query"};const key=original.toLowerCase();if(compCache.has(key))return compCache.get(key);const work=(async()=>{let blocked=false,lastSamples=0;for(const q of [...new Set([original,fallbackQuery(title)].filter(Boolean))]){try{const p=await get(`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`,7500);if(/pardon our interruption|captcha|robot check|verify you are human/i.test(p.html)){blocked=true;continue}const vals=ebayPrices(p.html);lastSamples=Math.max(lastSamples,vals.length);if(vals.length<3)continue;vals.sort((a,b)=>a-b);const lo=Math.floor(vals.length*.15),hi=Math.max(lo+1,Math.ceil(vals.length*.85)),a=vals.slice(lo,hi),mid=Math.floor(a.length/2),median=a.length%2?a[mid]:(a[mid-1]+a[mid])/2;return{status:"verified",median:Number(median.toFixed(2)),samples:vals.length,confidence:vals.length>=10?"high":vals.length>=5?"medium":"low",query:q,parser:"ebay_result_cards_v2"}}catch{}}return blocked?{status:"blocked",samples:lastSamples}:{status:"no_samples",samples:lastSamples}})();compCache.set(key,work);return work}
function economics(buy,c,travel=0){const resale=Number(c?.median||0),allIn=Number((buy+travel).toFixed(2)),proceeds=resale*(1-SELLING_FRICTION),net=Number((proceeds-allIn).toFixed(2)),roi=allIn>0?Number((net/allIn*100).toFixed(1)):0;return{resale,allIn,proceeds,net,roi}}
function summary(names){const o={};for(const n of names)o[n]={attempts:0,search_hits:0,detail_verified:0,location_verified:0,candidates:0,comp_verified:0,comp_blocked:0,comp_no_samples:0,qualified:0,rejected_location:0,rejected_profit:0,rejected_missing_premium:0,failed:0};return o}
function compUrl(title){const q=compQuery(title);return q?`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`:""}
async function mapLimit(rows,limit,work){const out=new Array(rows.length);let cursor=0;async function runner(){while(true){const i=cursor++;if(i>=rows.length)return;out[i]=await work(rows[i],i)}}await Promise.all(Array.from({length:Math.min(limit,rows.length)},runner));return out}
async function evaluate(rows,sum){
  const evaluated=await mapLimit(rows.slice(0,24),COMP_CONCURRENCY,async x=>{
    const s=sum[x.source];
    if(x.source==="HiBid"&&!x.buyer_premium_known){s.rejected_missing_premium++;return{candidate:{...x,stage:"needs_cost",profit_verified:false,comp_status:"not_checked",reason:"Buyer premium was not established.",comp_url:compUrl(x.title)}}}
    const c=await soldComp(x.title);
    if(c.status!=="verified"){
      if(c.status==="blocked")s.comp_blocked++;else s.comp_no_samples++;
      s.candidates++;
      return{candidate:{...x,stage:"needs_comp",profit_verified:false,comp_status:c.status,comp_samples:Number(c.samples||0),reason:c.status==="blocked"?"Automated sold-comp access was blocked; listing kept for manual review.":"Not enough dependable sold samples were returned; listing kept for manual review.",comp_url:compUrl(x.title)}};
    }
    s.comp_verified++;
    const d=Number(x.distance_miles),travel=Number.isFinite(d)?Number((d*2*TRAVEL).toFixed(2)):0,acq=x.source==="HiBid"?Number(x.estimated_all_in||0):Number(x.buy_price||0);
    if(!(acq>0)){s.rejected_missing_premium++;return{candidate:{...x,stage:"needs_cost",profit_verified:false,comp_status:"verified",comp_samples:c.samples,reason:"Acquisition cost is not established.",comp_url:compUrl(x.title)}}}
    const e=economics(acq,c,travel);
    if(e.net<MIN_NET||e.roi<MIN_ROI){s.rejected_profit++;return{rejected:{...x,stage:"not_profitable",comp_status:"verified",comp_samples:c.samples,resale_estimate:e.resale,net_profit:e.net,roi_pct:e.roi}}}
    let maxBid=null;
    if(x.source==="HiBid"){
      const premium=Number(x.buyer_premium_pct),target=Math.max(MIN_NET,e.resale*TARGET),maxAll=Math.max(0,e.proceeds-target-travel);maxBid=Number((maxAll/(1+premium/100)).toFixed(2));
      if(!(maxBid>0)||Number(x.buy_price)>maxBid){s.rejected_profit++;return{rejected:{...x,stage:"not_profitable",comp_status:"verified",comp_samples:c.samples,resale_estimate:e.resale,net_profit:e.net,roi_pct:e.roi}}}
    }
    const opportunity={...x,stage:"verified_deal",estimated_all_in:e.allIn,travel_cost:travel,resale_estimate:e.resale,comp_samples:c.samples,comp_confidence:c.confidence,comp_query:c.query,comp_status:"verified",comp_url:compUrl(x.title),net_profit:e.net,roi_pct:e.roi,max_bid:maxBid,profit_verified:true,opportunity_score:Math.round(clamp(45+e.roi*.32+e.net/15-(Number.isFinite(d)?d/5:0),1,99))};
    s.qualified++;return{opportunity};
  });
  const opportunities=evaluated.map(x=>x?.opportunity).filter(Boolean).sort((a,b)=>b.opportunity_score-a.opportunity_score).slice(0,28);
  const candidates=evaluated.map(x=>x?.candidate).filter(Boolean).sort((a,b)=>Number(a.distance_miles??9999)-Number(b.distance_miles??9999)||Number(a.buy_price||0)-Number(b.buy_price||0)).slice(0,32);
  return{opportunities,candidates,rejected_count:evaluated.filter(x=>x?.rejected).length};
}

Deno.serve(async r=>{
  if(r.method==="OPTIONS")return new Response(null,{status:204,headers:cors(r)});
  if(r.method!=="POST")return json(r,405,{error:"POST required"});
  try{
    const id=await uid(r);if(!ALLOWED.has(id))return json(r,403,{error:"Not authorized"});
    const b=await r.json().catch(()=>({}));
    if(String(b.mode||"")==="comp_only"){
      const title=String(b.item_title||b.upc||"").trim().slice(0,180),buy=Number(b.buy_price||0);
      if(!title||!(buy>0))return json(r,200,{status:"NEEDS_INPUT",engine:"discover_then_verify_v060",comp_status:"not_checked",verdict:"NEEDS INPUT"});
      const c=await soldComp(title);
      if(c.status!=="verified")return json(r,200,{status:"PASS",engine:"discover_then_verify_v060",comp_status:c.status,comp_samples:c.samples||0,comp_url:compUrl(title),verdict:"NEEDS COMP",message:c.status==="blocked"?"Sold-comp source blocked automated access on this check.":"Not enough dependable sold evidence was available."});
      const e=economics(buy,c),verdict=e.net>=MIN_NET&&e.roi>=MIN_ROI?"BUY":e.net>0?"MAYBE":"PASS";
      return json(r,200,{status:"PASS",engine:"discover_then_verify_v060",comp_status:"verified",comp_median:e.resale,comp_samples:c.samples,comp_confidence:c.confidence,comp_query:c.query,comp_parser:c.parser,comp_url:compUrl(title),estimated_all_in:e.allIn,estimated_net:e.net,roi_pct:e.roi,selling_friction_pct:SELLING_FRICTION*100,verdict});
    }
    let terms=Array.isArray(b.terms)?b.terms.map(x=>String(x||"").trim()).filter(x=>x.length>=2).slice(0,10):[];if(!terms.length)terms=DEFAULT_TERMS.slice();
    const wanted=new Set((Array.isArray(b.sources)?b.sources:[]).map(x=>String(x).toLowerCase())),use=n=>!wanted.size||wanted.has(n.toLowerCase());
    const lat=Number(b.lat),lon=Number(b.lon),radiusMiles=[25,50,100,150].includes(Number(b.radiusMiles))?Number(b.radiusMiles):50;
    let postal=String(b.postal||"").match(/\d{5}/)?.[0]||"";if(!postal&&Number.isFinite(lat)&&Number.isFinite(lon))postal=await reversePostal(lat,lon);
    const ctx={lat,lon,radiusMiles,postal},names=["Craigslist","HiBid","Facebook Marketplace"].filter(use),sum=summary(names),seeds=[];
    for(const term of terms.slice(0,4)){
      const q=encodeURIComponent(term),jobs=[];
      if(use("Craigslist"))jobs.push({source:"Craigslist",url:`https://www.craigslist.org/search/sss?query=${q}&sort=date${Number.isFinite(lat)&&Number.isFinite(lon)?`&lat=${lat}&lon=${lon}&search_distance=${radiusMiles}`:""}`});
      if(use("HiBid"))jobs.push({source:"HiBid",url:`https://hibid.com/lots?q=${q}${postal?`&zip=${postal}&miles=${radiusMiles}`:""}`});
      const got=await Promise.all(jobs.map(async j=>{sum[j.source].attempts++;try{const p=await get(j.url),a=j.source==="Craigslist"?discoverCL(p.html,p.url,term):discoverHB(p.html,p.url,term);sum[j.source].search_hits+=a.length;return a}catch{sum[j.source].failed++;return[]}}));
      got.forEach(a=>seeds.push(...a));
    }
    if(use("Facebook Marketplace")){
      const fb=fbSeeds(Array.isArray(b.facebookCandidates)?b.facebookCandidates:[],terms);sum["Facebook Marketplace"].attempts=1;sum["Facebook Marketplace"].search_hits=fb.length;seeds.push(...fb);
    }
    const uniq=new Map();for(const s of seeds)if(s.url&&!uniq.has(s.url))uniq.set(s.url,s);
    const by={Craigslist:[],HiBid:[],"Facebook Marketplace":[]};for(const x of uniq.values())by[x.source]?.push(x);
    const detail=[];
    for(const source of["Craigslist","HiBid"]){if(!use(source))continue;const ds=await Promise.all((by[source]||[]).slice(0,8).map(async s=>{try{const p=await get(s.url),d=source==="Craigslist"?clDetail(p.html,p.url,s):hbDetail(p.html,p.url,s);if(d)sum[source].detail_verified++;else sum[source].failed++;return d}catch{sum[source].failed++;return null}}));detail.push(...ds.filter(Boolean))}
    if(use("Facebook Marketplace")){sum["Facebook Marketplace"].detail_verified=(by["Facebook Marketplace"]||[]).length;detail.push(...(by["Facebook Marketplace"]||[]))}
    const located=[],locationCandidates=[];
    for(const row of detail.slice(0,24)){
      const v=await verifyLoc(row,ctx);
      if(v&&v.location_verified){sum[row.source].location_verified++;located.push(v)}
      else if(v&&row.source==="Craigslist"&&Number.isFinite(lat)&&Number.isFinite(lon)){sum[row.source].candidates++;locationCandidates.push({...v,stage:"needs_location",source_search_bound:true,reason:`Craigslist search was constrained to ${radiusMiles} mi, but exact listing distance could not be independently verified.`,comp_status:"not_checked",comp_url:compUrl(v.title),profit_verified:false})}
      else sum[row.source].rejected_location++;
    }
    const evaluated=await evaluate(located,sum),opportunities=evaluated.opportunities,candidates=[...evaluated.candidates,...locationCandidates].slice(0,40);
    const auction_candidates=located.filter(x=>x.source==="HiBid").map(x=>({title:x.title,url:x.url,current_bid:x.buy_price,buyer_premium_pct:x.buyer_premium_pct,buyer_premium_known:x.buyer_premium_known,distance_miles:x.distance_miles,location_label:x.location_label,closing_label:x.closing_label,image_url:x.image_url})).slice(0,20);
    return json(r,200,{status:"PASS",engine:"discover_then_verify_v060",candidate_policy:"Verified source listings remain visible when automatic sold comps are unavailable. BUY/MAYBE/PASS profitability still requires dependable sold evidence.",auction_premium_policy:"actual_only",location:{lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,postal:postal||null,radius_miles:radiusMiles},search_terms:terms,opportunities,candidates,candidate_count:candidates.length,rejected_profit_count:evaluated.rejected_count,auction_candidates,source_summary:sum,automatic:true,scanned_at:new Date().toISOString()});
  }catch(e){return json(r,200,{status:"PARTIAL",engine:"discover_then_verify_v060",opportunities:[],candidates:[],candidate_count:0,auction_candidates:[],source_summary:{},warning:e instanceof Error?e.message:String(e)})}
});
