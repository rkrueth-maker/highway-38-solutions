import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED = new Set([
  "ccf25333-47cd-42ca-a20b-cdbc63a8a695",
  "6dd51b31-5974-4691-b8b8-83e5877528c0",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ORIGINS = new Set([
  "https://appassets.androidplatform.net",
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
]);

const RETAILER_PATTERN = "Home Depot|Lowe|Walmart|Target|Menards|Fleet Farm|L&M|L & M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O.Reilly|NAPA|Advance Auto Parts|Carquest|Auto Value|Parts City|Bumper to Bumper|Best Buy|Walgreens|CVS|Kohl|JCPenney|TJ Maxx|T.J. Maxx|Marshalls|Ross Dress|Burlington|Five Below|Aldi|Costco|Sam.s Club|PetSmart|Petco|Michaels|Hobby Lobby|JOANN|Dunham|Runnings|HomeGoods";
const RETAILER_RE = /Home Depot|Lowe'?s|Walmart|Target|Menards|Fleet Farm|L\s*(?:&|and)\s*M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O'Reilly|NAPA|Advance Auto Parts|Carquest|Auto Value|Parts City|Bumper to Bumper|Best Buy|Walgreens|CVS|Kohl|JCPenney|TJ Maxx|T\.J\. Maxx|Marshalls|Ross Dress|Burlington|Five Below|Aldi|Costco|Sam'?s Club|PetSmart|Petco|Michaels|Hobby Lobby|JOANN|Dunham|Runnings|HomeGoods/i;
const RELEVANT_SHOPS = new Set(["car_parts","hardware","doityourself","department_store","variety_store","discount","electronics"]);
const OVERPASS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const CACHE_TTL_MS = 15 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const SAME_AREA_MILES = 5;
const HEDGE_DELAY_MS = 450;
const OVERPASS_CLIENT_TIMEOUT_MS = 10000;
const MIN_COVERAGE_RATIO = 0.80;
const DISCOVERY_VERSION = "wide-store-coverage-v3";

type Box = { south:number; west:number; north:number; east:number };
type CacheEntry = { at:number; payload:any; ttl:number; lat:number; lon:number; radius:number };
const cache = new Map<string,CacheEntry>();
const inflight = new Map<string,Promise<any>>();

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(o) ? o : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY } });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p?.id) throw new Error("Session expired.");
  return String(p.id);
}
function haversine(a:number,b:number,c:number,d:number){const R=3958.7613,toRad=(x:number)=>x*Math.PI/180;const dLat=toRad(c-a),dLon=toRad(d-b);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function canonical(name:string){
  const s=name.toLowerCase();
  if(s.includes("l&m")||s.includes("l & m")||s.includes("l and m"))return "L&M Fleet Supply";
  if(s.includes("autozone"))return "AutoZone";
  if(s.includes("o'reilly"))return "O'Reilly Auto Parts";
  if(s.includes("napa"))return "NAPA Auto Parts";
  if(s.includes("advance auto"))return "Advance Auto Parts";
  if(s.includes("carquest"))return "Carquest";
  if(s.includes("auto value"))return "Auto Value";
  if(s.includes("parts city"))return "Parts City";
  if(s.includes("bumper to bumper"))return "Bumper to Bumper";
  if(s.includes("home depot"))return "Home Depot";
  if(s.includes("lowe"))return "Lowe's";
  if(s.includes("walmart"))return "Walmart";
  if(s.includes("target"))return "Target";
  if(s.includes("menards"))return "Menards";
  if(s.includes("fleet farm"))return "Fleet Farm";
  if(s.includes("harbor freight"))return "Harbor Freight";
  if(s.includes("tractor supply"))return "Tractor Supply";
  if(s.includes("dollar general"))return "Dollar General";
  if(s.includes("dollar tree"))return "Dollar Tree";
  if(s.includes("family dollar"))return "Family Dollar";
  if(s.includes("northern tool"))return "Northern Tool";
  if(s.includes("ace"))return "Ace Hardware";
  if(s.includes("best buy"))return "Best Buy";
  if(s.includes("walgreens"))return "Walgreens";
  if(s==="cvs"||s.includes("cvs pharmacy"))return "CVS";
  if(s.includes("kohl"))return "Kohl's";
  if(s.includes("jcpenney"))return "JCPenney";
  if(s.includes("tj maxx")||s.includes("t.j. maxx"))return "TJ Maxx";
  if(s.includes("marshalls"))return "Marshalls";
  if(s.includes("ross dress"))return "Ross";
  if(s.includes("burlington"))return "Burlington";
  if(s.includes("five below"))return "Five Below";
  if(s.includes("aldi"))return "Aldi";
  if(s.includes("costco"))return "Costco";
  if(s.includes("sam's club")||s.includes("sams club"))return "Sam's Club";
  if(s.includes("petsmart"))return "PetSmart";
  if(s.includes("petco"))return "Petco";
  if(s.includes("michaels"))return "Michaels";
  if(s.includes("hobby lobby"))return "Hobby Lobby";
  if(s.includes("joann"))return "JOANN";
  if(s.includes("dunham"))return "Dunham's";
  if(s.includes("runnings"))return "Runnings";
  if(s.includes("homegoods"))return "HomeGoods";
  return name;
}
function address(t:any){return [t["addr:housenumber"],t["addr:street"],t["addr:city"],t["addr:state"],t["addr:postcode"]].filter(Boolean).join(" ").replace(/ (\d{5})$/,", $1");}
function cacheKey(lat:number,lon:number,radius:number){return `${lat.toFixed(2)}|${lon.toFixed(2)}|${radius}`;}
function findNearbyPrior(lat:number,lon:number,radius:number){let best:CacheEntry|null=null;for(const entry of cache.values()){if(entry.radius!==radius)continue;if(Date.now()-entry.at>STALE_TTL_MS)continue;if(haversine(lat,lon,entry.lat,entry.lon)>SAME_AREA_MILES)continue;if(!best||entry.at>best.at)best=entry;}return best;}
function rebasePayload(entry:CacheEntry,lat:number,lon:number,extra:Record<string,unknown>={}){const stores=Array.isArray(entry.payload?.stores)?entry.payload.stores.map((s:any)=>({...s,distance_miles:Math.round(haversine(lat,lon,Number(s.lat),Number(s.lon))*10)/10})).sort((a:any,b:any)=>a.distance_miles-b.distance_miles):[];return {...entry.payload,stores,cached:true,...extra};}
function storeId(s:any){return String(s.store_key||[s.retailer||s.store_name||"",s.store_address||"",Number(s.lat||0).toFixed(4),Number(s.lon||0).toFixed(4)].join("|"));}
function mergeStores(previous:any[],current:any[]){const merged=new Map<string,any>();for(const s of previous||[])merged.set(storeId(s),s);for(const s of current||[])merged.set(storeId(s),s);return [...merged.values()];}
function region(lat:number,lon:number,radiusMiles:number):Box {const latDelta=radiusMiles/69.0;const cos=Math.max(0.15,Math.cos(lat*Math.PI/180));const lonDelta=radiusMiles/(69.172*cos);return {south:lat-latDelta,west:lon-lonDelta,north:lat+latDelta,east:lon+lonDelta};}
function splitGrid(box:Box,n:number):Box[]{const out:Box[]=[];const latStep=(box.north-box.south)/n,lonStep=(box.east-box.west)/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++)out.push({south:box.south+y*latStep,west:box.west+x*lonStep,north:box.south+(y+1)*latStep,east:box.west+(x+1)*lonStep});return out;}
function bbox(b:Box){return `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;}
function tileQuery(b:Box){const area=bbox(b);return `[out:json][timeout:8];(nwr["name"~"${RETAILER_PATTERN}",i](${area});nwr["brand"~"${RETAILER_PATTERN}",i](${area});nwr["shop"="car_parts"](${area});nwr["shop"="hardware"](${area});nwr["shop"="doityourself"](${area});nwr["shop"="department_store"](${area});nwr["shop"="variety_store"](${area});nwr["shop"="discount"](${area});nwr["shop"="electronics"](${area}););out center tags qt;`;}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms));}
function payloadValid(payload:any){if(!payload||!Array.isArray(payload.elements))return false;const remark=String(payload.remark||"").toLowerCase();return !remark.includes("runtime error")&&!remark.includes("timed out")&&!remark.includes("timeout")&&!remark.includes("out of memory");}
async function queryTile(query:string,preferred:number){const ordered=[OVERPASS[preferred%OVERPASS.length],OVERPASS[(preferred+1)%OVERPASS.length]];const failures:string[]=[];const controllers=ordered.map(()=>new AbortController());return await new Promise<any>(resolve=>{let finished=0,settled=false;ordered.forEach((endpoint,index)=>{(async()=>{try{if(index>0)await sleep(HEDGE_DELAY_MS);if(settled)return;const controller=controllers[index];const timeout=setTimeout(()=>controller.abort(),OVERPASS_CLIENT_TIMEOUT_MS);try{const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"H38-Private-Reseller-Scout/0.1.18"},body:`data=${encodeURIComponent(query)}`,signal:controller.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);const payload=await r.json();if(!payloadValid(payload))throw new Error(`invalid/partial Overpass payload${payload?.remark?`: ${String(payload.remark).slice(0,90)}`:""}`);if(settled)return;settled=true;controllers.forEach((c,i)=>{if(i!==index)c.abort();});resolve({ok:true,payload,source:new URL(endpoint).host,failures,hedged:index>0});}finally{clearTimeout(timeout);}}catch(e){if(!settled)failures.push(`${new URL(endpoint).host}:${e instanceof Error?e.message:String(e)}`);}finally{finished++;if(!settled&&finished===ordered.length){settled=true;resolve({ok:false,payload:{elements:[]},source:"",failures,hedged:true});}}})();});});}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>):Promise<R[]>{const out=new Array<R>(items.length);let next=0;async function worker(){while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));return out;}
function parseStores(elements:any[],lat:number,lon:number,radiusMiles:number){const byLogical=new Map<string,any>();for(const e of elements){const t=e.tags||{},name=String(t.name||t.brand||"").trim(),shop=String(t.shop||"").toLowerCase();const slat=Number(e.lat ?? e.center?.lat),slon=Number(e.lon ?? e.center?.lon);const relevant=RETAILER_RE.test(name)||RELEVANT_SHOPS.has(shop);if(!name||!relevant||!Number.isFinite(slat)||!Number.isFinite(slon))continue;const distance=Math.round(haversine(lat,lon,slat,slon)*10)/10;if(distance>radiusMiles)continue;const retailer=canonical(name),addr=address(t);const logical=[retailer.toLowerCase(),addr.toLowerCase()||`${slat.toFixed(3)},${slon.toFixed(3)}`].join("|");const item={store_key:`osm:${e.type}:${e.id}`,store_name:name,retailer,store_address:addr,lat:slat,lon:slon,distance_miles:distance,store_category:shop||null};const prior=byLogical.get(logical);if(!prior||(!prior.store_address&&addr))byLogical.set(logical,item);}return [...byLogical.values()].sort((a:any,b:any)=>a.distance_miles-b.distance_miles).slice(0,500);}
async function buildPayload(lat:number,lon:number,radiusMiles:number){const grid=radiusMiles<=25?3:radiusMiles<=50?4:radiusMiles<=100?5:6;const tiles=splitGrid(region(lat,lon,radiusMiles),grid);const started=Date.now();let results=await mapLimit(tiles,6,(tile,i)=>queryTile(tileQuery(tile),i%OVERPASS.length));const failed:number[]=[];results.forEach((r,i)=>{if(!r.ok)failed.push(i);});if(failed.length){const retry=await mapLimit(failed,4,(idx,j)=>queryTile(tileQuery(tiles[idx]),(idx+1+j)%OVERPASS.length));retry.forEach((r,j)=>{if(r.ok)results[failed[j]]=r;});}const good=results.filter(x=>x.ok),coverage=good.length/tiles.length;if(!good.length||coverage<MIN_COVERAGE_RATIO){const failures=results.filter(x=>!x.ok).flatMap(x=>x.failures).slice(0,8).join(", ");throw new Error(`Nearby store coverage incomplete (${good.length}/${tiles.length} regions). ${failures}`.trim());}const elements=good.flatMap(x=>Array.isArray(x.payload?.elements)?x.payload.elements:[]),stores=parseStores(elements,lat,lon,radiusMiles),partial=good.length<tiles.length;return {status:"PASS",radius_miles:radiusMiles,stores,store_count:stores.length,source:[...new Set(good.map(x=>x.source).filter(Boolean))].join(","),cached:false,partial,coverage_ratio:Math.round(coverage*1000)/1000,regions_ok:good.length,regions_total:tiles.length,hedged_regions:good.filter(x=>x.hedged).length,elapsed_ms:Date.now()-started,discovery_version:DISCOVERY_VERSION};}

Deno.serve(async (req: Request) => {if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});if(req.method!=="POST")return json(req,405,{error:"POST required."});try{const uid=await userId(req);if(!ALLOWED.has(uid))return json(req,403,{error:"Not authorized."});const body=await req.json().catch(()=>({}));const lat=Number(body.lat),lon=Number(body.lon),radiusMiles=Math.min(150,Math.max(1,Number(body.radiusMiles||150)));if(!Number.isFinite(lat)||!Number.isFinite(lon))return json(req,400,{error:"Valid phone location required."});const key=cacheKey(lat,lon,radiusMiles),exact=cache.get(key),prior=exact||findNearbyPrior(lat,lon,radiusMiles),now=Date.now();if(prior&&now-prior.at<prior.ttl)return json(req,200,rebasePayload(prior,lat,lon,{same_area_cache:prior!==exact}));const active=inflight.get(key);if(active){try{return json(req,200,{...(await active),coalesced:true});}catch(e){const last=cache.get(key)||findNearbyPrior(lat,lon,radiusMiles);if(last)return json(req,200,rebasePayload(last,lat,lon,{stale:true,coalesced:true,warning:"Using last successful store list while live store service recovers."}));throw e;}}const work=buildPayload(lat,lon,radiusMiles).then(payload=>{const previous=findNearbyPrior(lat,lon,radiusMiles);if(previous&&Date.now()-previous.at<STALE_TTL_MS){payload.stores=mergeStores(previous.payload?.stores||[],payload.stores||[]).map((s:any)=>({...s,distance_miles:Math.round(haversine(lat,lon,Number(s.lat),Number(s.lon))*10)/10})).filter((s:any)=>s.distance_miles<=radiusMiles).sort((a:any,b:any)=>a.distance_miles-b.distance_miles).slice(0,500);payload.store_count=payload.stores.length;payload.merged_previous=true;}cache.set(key,{at:Date.now(),payload,ttl:payload.partial?PARTIAL_CACHE_TTL_MS:CACHE_TTL_MS,lat,lon,radius:radiusMiles});return payload;}).finally(()=>inflight.delete(key));inflight.set(key,work);try{return json(req,200,await work);}catch(e){const last=cache.get(key)||findNearbyPrior(lat,lon,radiusMiles);if(last)return json(req,200,rebasePayload(last,lat,lon,{stale:true,warning:"Using last successful store list while live store service recovers."}));throw e;}}catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),discovery_version:DISCOVERY_VERSION});}});
