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
const RETAILER_RE = /Home Depot|Lowe'?s|Walmart|Target|Menards|Fleet Farm|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware/i;

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
function canonical(name:string){const s=name.toLowerCase();if(s.includes("home depot"))return "Home Depot";if(s.includes("lowe"))return "Lowe's";if(s.includes("walmart"))return "Walmart";if(s.includes("target"))return "Target";if(s.includes("menards"))return "Menards";if(s.includes("fleet farm"))return "Fleet Farm";if(s.includes("harbor freight"))return "Harbor Freight";if(s.includes("tractor supply"))return "Tractor Supply";if(s.includes("dollar general"))return "Dollar General";if(s.includes("dollar tree"))return "Dollar Tree";if(s.includes("family dollar"))return "Family Dollar";if(s.includes("northern tool"))return "Northern Tool";if(s.includes("ace"))return "Ace Hardware";return name;}
function address(t:any){return [t["addr:housenumber"],t["addr:street"],t["addr:city"],t["addr:state"],t["addr:postcode"]].filter(Boolean).join(" ").replace(/ (\d{5})$/,", $1");}

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
    const meters = Math.round(radiusMiles * 1609.344);
    const q = `[out:json][timeout:25];(nwr(around:${meters},${lat},${lon})["name"~"Home Depot|Lowe|Walmart|Target|Menards|Fleet Farm|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware",i];nwr(around:${meters},${lat},${lon})["brand"~"Home Depot|Lowe|Walmart|Target|Menards|Fleet Farm|Harbor Freight|Tractor Supply|Dollar General|Dollar Tree|Family Dollar|Northern Tool|Ace Hardware",i];);out center tags;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded","user-agent":"H38-Private-Reseller-Scout/0.1.1"}, body:`data=${encodeURIComponent(q)}`, signal:AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Nearby store lookup returned ${r.status}.`);
    const p:any = await r.json();
    const seen = new Set<string>();
    const stores = (Array.isArray(p.elements)?p.elements:[]).map((e:any)=>{
      const t=e.tags||{}, name=String(t.name||t.brand||"").trim();
      const slat=Number(e.lat ?? e.center?.lat), slon=Number(e.lon ?? e.center?.lon);
      if(!name || !RETAILER_RE.test(name) || !Number.isFinite(slat) || !Number.isFinite(slon)) return null;
      const key=`osm:${e.type}:${e.id}`; if(seen.has(key)) return null; seen.add(key);
      return {store_key:key,store_name:name,retailer:canonical(name),store_address:address(t),lat:slat,lon:slon,distance_miles:Math.round(haversine(lat,lon,slat,slon)*10)/10};
    }).filter(Boolean).filter((x:any)=>x.distance_miles<=radiusMiles).sort((a:any,b:any)=>a.distance_miles-b.distance_miles).slice(0,120);
    return json(req,200,{status:"PASS",radius_miles:radiusMiles,stores});
  } catch (e) { return json(req,502,{error:e instanceof Error?e.message:String(e)}); }
});
