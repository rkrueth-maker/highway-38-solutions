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

const RETAILER_PATTERN = "Home Depot|Lowe|Walmart|Target|Menards|Fleet Farm|L&M|L & M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O.Reilly|NAPA|Advance Auto Parts|Carquest|Auto Value|Parts City|Bumper to Bumper";
const RETAILER_RE = /Home Depot|Lowe'?s|Walmart|Target|Menards|Fleet Farm|L\s*(?:&|and)\s*M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O'Reilly|NAPA|Advance Auto Parts|Carquest|Auto Value|Parts City|Bumper to Bumper/i;
const OVERPASS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const CACHE_TTL_MS = 15 * 60 * 1000;
const PARTIAL_CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const SAME_AREA_MILES = 5;

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
  return name;
}
function address(t:any){return [t["addr:housenumber"],t["addr:street"],t["addr:city"],t["addr:state"],t["addr:postcode"]].filter(Boolean).join(" ").replace(/ (\d{5})$/,", $1");}
function cacheKey(lat:number,lon:number,radius:number){return `${lat.toFixed(2)}|${lon.toFixed(2)}|${radius}`;}
function findNearbyPrior(lat:number,lon:number,radius:number){
  let best:CacheEntry|null=null;
  for(const entry of cache.values()){
    if(entry.radius!==radius)continue;
    if(Date.now()-entry.at>STALE_TTL_MS)continue;
    if(haversine(lat,lon,entry.lat,entry.lon)>SAME_AREA_MILES)continue;
    if(!best||entry.at>best.at)best=entry;
  }
  return best;
}
function rebasePayload(entry:CacheEntry,lat:number,lon:number,extra:Record<string,unknown>={}){
  const stores=Array.isArray(entry.payload?.stores)?entry.payload.stores.map((s:any)=>({...s,distance_miles:Math.round(haversine(lat,lon,Number(s.lat),Number(s.lon))*10)/10})).sort((a:any,b:any)=>a.distance_miles-b.distance_miles):[];
  return {...entry.payload,stores,cached:true,...extra};
}
function storeId(s:any){return String(s.store_key||[s.retailer||s.store_name||"",s.store_address||"",Number(s.lat||0).toFixed(4),Number(s.lon||0).toFixed(4)].join("|"));}
function mergeStores(previous:any[],current:any[]){
  const merged=new Map<string,any>();
  for(const s of previous||[])merged.set(storeId(s),s);
  for(const s of current||[])merged.set(storeId(s),s);
  return [...merged.values()];
}
function region(lat:number,lon:number,radiusMiles:number):Box {
  const latDelta=radiusMiles/69.0;
  const cos=Math.max(0.15,Math.cos(lat*Math.PI/180));
  const lonDelta=radiusMiles/(69.172*cos);
  return {south:lat-latDelta,west:lon-lonDelta,north:lat+latDelta,east:lon+lonDelta};
}
function splitFour(box:Box,lat:number,lon:number):Box[]{
  return [
    {south:box.south,west:box.west,north:lat,east:lon},
    {south:box.south,west:lon,north:lat,east:box.east},
    {south:lat,west:box.west,north:box.north,east:lon},
    {south:lat,west:lon,north:box.north,east:box.east},
  ];
}
function bbox(b:Box){return `${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)}`;}
function tileQuery(b:Box){
  const area=bbox(b);
  return `[out:json][timeout:7];(nwr["shop"]["name"~"${RETAILER_PATTERN}",i](${area});nwr["shop"]["brand"~"${RETAILER_PATTERN}",i](${area});nwr["shop"="car_parts"](${area}););out center tags qt;`;
}
async function queryTile(query:string,preferred:number){
  const failures:string[]=[];
  for(let step=0;step<OVERPASS.length;step++){
    const endpoint=OVERPASS[(preferred+step)%OVERPASS.length];
    try{
      const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"H38-Private-Reseller-Scout/0.1.17"},body:`data=${encodeURIComponent(query)}`,signal:AbortSignal.timeout(9000)});
      if(!r.ok){failures.push(`${new URL(endpoint).host}:${r.status}`);continue;}
      const payload=await r.json();
      return {ok:true,payload,source:new URL(endpoint).host,failures};
    }catch(e){failures.push(`${new URL(endpoint).host}:${e instanceof Error?e.message:String(e)}`);}
  }
  return {ok:false,payload:{elements:[]},source:"",failures};
}
function parseStores(elements:any[],lat:number,lon:number,radiusMiles:number){
  const seen=new Set<string>();
  return elements.map((e:any)=>{
    const t=e.tags||{}, name=String(t.name||t.brand||"").trim();
    const slat=Number(e.lat ?? e.center?.lat), slon=Number(e.lon ?? e.center?.lon);
    const isParts=String(t.shop||"").toLowerCase()==="car_parts";
    if(!name || (!RETAILER_RE.test(name)&&!isParts) || !Number.isFinite(slat) || !Number.isFinite(slon)) return null;
    const key=`osm:${e.type}:${e.id}`;
    if(seen.has(key)) return null;
    seen.add(key);
    return {store_key:key,store_name:name,retailer:canonical(name),store_address:address(t),lat:slat,lon:slon,distance_miles:Math.round(haversine(lat,lon,slat,slon)*10)/10,store_category:isParts?"Auto parts":null};
  }).filter(Boolean).filter((x:any)=>x.distance_miles<=radiusMiles).sort((a:any,b:any)=>a.distance_miles-b.distance_miles).slice(0,320);
}
async function buildPayload(lat:number,lon:number,radiusMiles:number){
  const tiles=splitFour(region(lat,lon,radiusMiles),lat,lon);
  const results=await Promise.all(tiles.map((tile,i)=>queryTile(tileQuery(tile),i%OVERPASS.length)));
  const good=results.filter(x=>x.ok);
  if(!good.length){
    const failures=results.flatMap(x=>x.failures).slice(0,8).join(", ");
    throw new Error(`Nearby store services unavailable (${failures || "all regional queries failed"}).`);
  }
  const elements=good.flatMap(x=>Array.isArray(x.payload?.elements)?x.payload.elements:[]);
  const stores=parseStores(elements,lat,lon,radiusMiles);
  const partial=good.length<tiles.length;
  return {status:"PASS",radius_miles:radiusMiles,stores,source:[...new Set(good.map(x=>x.source).filter(Boolean))].join(","),cached:false,partial,regions_ok:good.length,regions_total:tiles.length,discovery_version:"all-stores-parts-lm-v1"};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if (req.method !== "POST") return json(req,405,{error:"POST required."});
  try {
    const uid = await userId(req);
    if (!ALLOWED.has(uid)) return json(req,403,{error:"Not authorized."});
    const body = await req.json().catch(()=>({}));
    const lat = Number(body.lat), lon = Number(body.lon);
    const radiusMiles = Math.min(150, Math.max(1, Number(body.radiusMiles || 150)));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json(req,400,{error:"Valid phone location required."});

    const key=cacheKey(lat,lon,radiusMiles);
    const exact=cache.get(key);
    const prior=exact || findNearbyPrior(lat,lon,radiusMiles);
    const now=Date.now();
    if(prior && now-prior.at<prior.ttl) return json(req,200,rebasePayload(prior,lat,lon,{same_area_cache:prior!==exact}));

    const active=inflight.get(key);
    if(active){
      try {
        const payload=await active;
        return json(req,200,{...payload,coalesced:true});
      } catch(e) {
        const last=cache.get(key) || findNearbyPrior(lat,lon,radiusMiles);
        if(last) return json(req,200,rebasePayload(last,lat,lon,{stale:true,coalesced:true,warning:"Using last successful store list while live store service recovers."}));
        throw e;
      }
    }

    const work=buildPayload(lat,lon,radiusMiles).then(payload=>{
      const previous=findNearbyPrior(lat,lon,radiusMiles);
      if(previous&&Date.now()-previous.at<STALE_TTL_MS){
        payload.stores=mergeStores(previous.payload?.stores||[],payload.stores||[]).map((s:any)=>({...s,distance_miles:Math.round(haversine(lat,lon,Number(s.lat),Number(s.lon))*10)/10})).filter((s:any)=>s.distance_miles<=radiusMiles).sort((a:any,b:any)=>a.distance_miles-b.distance_miles).slice(0,320);
        payload.merged_previous=true;
      }
      cache.set(key,{at:Date.now(),payload,ttl:payload.partial?PARTIAL_CACHE_TTL_MS:CACHE_TTL_MS,lat,lon,radius:radiusMiles});
      return payload;
    }).finally(()=>inflight.delete(key));
    inflight.set(key,work);

    try {
      return json(req,200,await work);
    } catch(e) {
      const last=cache.get(key) || findNearbyPrior(lat,lon,radiusMiles);
      if(last) return json(req,200,rebasePayload(last,lat,lon,{stale:true,warning:"Using last successful store list while live store service recovers."}));
      throw e;
    }
  } catch (e) { return json(req,503,{error:e instanceof Error?e.message:String(e)}); }
});
