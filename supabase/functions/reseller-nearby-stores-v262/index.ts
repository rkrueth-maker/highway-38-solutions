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
const OVERPASS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const RETAILER_PATTERN = "Home Depot|Lowe|Walmart|Target|Menards|Fleet Farm|L&M|L & M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O.Reilly|NAPA|Advance Auto Parts|Best Buy|Walgreens|Aldi|Runnings";
const RETAILER_RE = /Home Depot|Lowe'?s|Walmart|Target|Menards|Fleet Farm|L\s*(?:&|and)\s*M|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware|AutoZone|O'Reilly|NAPA|Advance Auto Parts|Best Buy|Walgreens|Aldi|Runnings/i;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(o) ? o : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
    signal: AbortSignal.timeout(12000),
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p?.id) throw new Error("Session expired.");
  return String(p.id);
}
function haversine(a:number,b:number,c:number,d:number){
  const R=3958.7613,rad=(x:number)=>x*Math.PI/180,dLat=rad(c-a),dLon=rad(d-b);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
function canonical(name:string){
  const s=name.toLowerCase();
  if(s.includes("home depot"))return"Home Depot";
  if(s.includes("dollar general"))return"Dollar General";
  if(s.includes("dollar tree"))return"Dollar Tree";
  if(s.includes("family dollar"))return"Family Dollar";
  if(s.includes("l&m")||s.includes("l & m")||s.includes("l and m"))return"L&M Fleet Supply";
  if(s.includes("fleet farm"))return"Fleet Farm";
  if(s.includes("harbor freight"))return"Harbor Freight";
  if(s.includes("tractor supply"))return"Tractor Supply";
  if(s.includes("lowe"))return"Lowe's";
  if(s.includes("walmart"))return"Walmart";
  if(s.includes("target"))return"Target";
  if(s.includes("menards"))return"Menards";
  if(s.includes("northern tool"))return"Northern Tool";
  if(s.includes("ace"))return"Ace Hardware";
  if(s.includes("autozone"))return"AutoZone";
  if(s.includes("o'reilly"))return"O'Reilly Auto Parts";
  if(s.includes("napa"))return"NAPA Auto Parts";
  if(s.includes("advance auto"))return"Advance Auto Parts";
  if(s.includes("best buy"))return"Best Buy";
  if(s.includes("walgreens"))return"Walgreens";
  if(s.includes("aldi"))return"Aldi";
  if(s.includes("runnings"))return"Runnings";
  return name;
}
function address(t:any){
  return [t["addr:housenumber"],t["addr:street"],t["addr:city"],t["addr:state"],t["addr:postcode"]]
    .filter(Boolean).join(" ").replace(/ (\d{5})$/,", $1");
}
function bbox(lat:number,lon:number,r:number){
  const dy=r/69,dx=r/(69.172*Math.max(.15,Math.cos(lat*Math.PI/180)));
  return `${(lat-dy).toFixed(5)},${(lon-dx).toFixed(5)},${(lat+dy).toFixed(5)},${(lon+dx).toFixed(5)}`;
}
function queryText(lat:number,lon:number,r:number){
  const a=bbox(lat,lon,r);
  return `[out:json][timeout:6];(nwr["name"~"${RETAILER_PATTERN}",i](${a});nwr["brand"~"${RETAILER_PATTERN}",i](${a}););out center tags qt;`;
}
async function queryOne(endpoint:string,query:string){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),7000);
  try{
    const r=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"H38-Private-Reseller-Scout/2.6.2"},
      body:`data=${encodeURIComponent(query)}`,
      signal:c.signal,
    });
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const p=await r.json();
    if(!Array.isArray(p?.elements))throw new Error("Invalid map response.");
    return {ok:true,payload:p,source:new URL(endpoint).host};
  }catch(e){
    return {ok:false,payload:{elements:[]},source:"",warning:e instanceof Error?e.message:String(e)};
  }finally{clearTimeout(timer)}
}
function parse(elements:any[],lat:number,lon:number,radius:number){
  const out=new Map<string,any>();
  for(const e of elements){
    const t=e.tags||{},name=String(t.name||t.brand||"").trim();
    const slat=Number(e.lat??e.center?.lat),slon=Number(e.lon??e.center?.lon);
    if(!name||!RETAILER_RE.test(name)||!Number.isFinite(slat)||!Number.isFinite(slon))continue;
    const d=Math.round(haversine(lat,lon,slat,slon)*10)/10;
    if(d>radius)continue;
    const retailer=canonical(name),addr=address(t);
    const key=[retailer.toLowerCase(),addr.toLowerCase()||`${slat.toFixed(4)},${slon.toFixed(4)}`].join("|");
    if(!out.has(key))out.set(key,{
      store_key:`osm:${e.type}:${e.id}`,
      store_name:name,
      retailer,
      store_address:addr,
      lat:slat,
      lon:slon,
      distance_miles:d,
      source:"openstreetmap",
    });
  }
  return [...out.values()].sort((a,b)=>a.distance_miles-b.distance_miles).slice(0,120);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,405,{error:"POST required."});
  const started=Date.now();
  try{
    const uid=await userId(req);
    if(!ALLOWED.has(uid))return json(req,403,{error:"Not authorized."});
    const body=await req.json().catch(()=>({}));
    const lat=Number(body.lat),lon=Number(body.lon);
    const requested=Math.min(150,Math.max(1,Number(body.radiusMiles||50)));
    const quick=Math.min(requested,Math.max(5,Number(body.quickRadiusMiles||20)));
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return json(req,400,{error:"Valid resolved location required."});

    const query=queryText(lat,lon,quick);
    const first=await Promise.any(OVERPASS.map(x=>queryOne(x,query).then(r=>{if(!r.ok)throw new Error(r.warning||"provider failed");return r}))).catch(()=>null);
    let result=first;
    if(!result){
      const tries=await Promise.all(OVERPASS.map(x=>queryOne(x,query)));
      result=tries.find(x=>x.ok)||tries[0];
    }
    const stores=parse(result?.payload?.elements||[],lat,lon,quick);
    return json(req,200,{
      status:stores.length?"PASS":"PARTIAL",
      provider:"central-nearby-bootstrap-v262",
      source:result?.source||"",
      radius_miles:requested,
      quick_radius_miles:quick,
      stores,
      store_count:stores.length,
      elapsed_ms:Date.now()-started,
      warning:stores.length?null:"Central quick scan returned no recognized retailers; the durable broader scan should continue.",
    });
  }catch(e){
    return json(req,200,{
      status:"PARTIAL",
      provider:"central-nearby-bootstrap-v262",
      stores:[],
      store_count:0,
      elapsed_ms:Date.now()-started,
      warning:e instanceof Error?e.message:String(e),
    });
  }
});
