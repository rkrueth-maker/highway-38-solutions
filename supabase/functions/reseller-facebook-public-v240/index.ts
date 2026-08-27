import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {normalizeMarketplaceRows,parseGuestHtml} from './core.mjs';
import {buildIndexQueries,listingFromSearch,parseBingRss,parseSearchHtml} from './public-index.mjs';
type Any=Record<string,any>;
const TOKEN=Deno.env.get('APIFY_API_TOKEN')||'';
const ACTOR='crowdpull~facebook-marketplace-scraper';
const ORIGINS=new Set(['https://appassets.androidplatform.net','https://highway38solutions.com','https://www.highway38solutions.com']);
function cors(r:Request){const o=r.headers.get('origin')||'';return{'access-control-allow-origin':ORIGINS.has(o)?o:'https://appassets.androidplatform.net','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'private, max-age=30','vary':'Origin'}}
function json(r:Request,s:number,b:any){return new Response(JSON.stringify(b),{status:s,headers:cors(r)})}
function txt(v:any){return String(v??'').trim()}
function where(body:Any){const label=txt(body.location_label).replace(/^ZIP\s+/i,'').trim();return label||[txt(body.city),txt(body.state)].filter(Boolean).join(', ')||txt(body.postal)}
function ctx(body:Any,provider:string,onlyVerified=true){return{radiusMiles:Number(body.radiusMiles||body.radius_miles||50),provider,locationLabel:where(body),lat:Number(body.lat),lon:Number(body.lon),onlyVerified}}
function ua(){return'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'}

async function apify(term:string,body:Any){
  const u=`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(TOKEN)}`,km=Math.max(1,Math.round(Number(body.radiusMiles||50)*1.60934)),input={location:where(body),searchQuery:term,maxListings:30,radiusKm:km,includeDetails:false};
  const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(50000)}),p=await r.json().catch(()=>[]);
  if(!r.ok)throw Error(`Apify Facebook HTTP ${r.status}`);
  const raw=Array.isArray(p)?p:[],rows=normalizeMarketplaceRows(raw,ctx(body,'CrowdPull public guest'));
  return{provider:'apify',term,rows,raw_count:raw.length,http_status:r.status,gated:false,query:where(body)};
}
async function direct(term:string,body:Any){
  const u=new URL('https://www.facebook.com/marketplace/search/');u.searchParams.set('query',term);u.searchParams.set('sortBy','creation_time_descend');u.searchParams.set('daysSinceListed','7');u.searchParams.set('deliveryMethod','local_pick_up');u.searchParams.set('radius',String(Math.max(25,Number(body.radiusMiles||50))));
  if(Number.isFinite(Number(body.lat))&&Number.isFinite(Number(body.lon))){u.searchParams.set('latitude',String(body.lat));u.searchParams.set('longitude',String(body.lon))}
  const r=await fetch(u,{headers:{'user-agent':ua(),'accept-language':'en-US,en;q=0.9',accept:'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(16000)}),html=await r.text().catch(()=> '');
  if(!r.ok)throw Error(`Facebook public HTTP ${r.status}`);
  const gated=/log in to facebook|login\/\?next=|checkpoint|confirm your identity/i.test(html),raw=parseGuestHtml(html,ctx(body,'facebook_public_ssr',false)),rows=normalizeMarketplaceRows(raw,ctx(body,'facebook_public_ssr'));
  return{provider:'facebook_guest',term,rows,raw_count:raw.length,http_status:r.status,gated,query:u.toString()};
}
function normalizeIndexed(raw:Any[],body:Any,provider:string){return normalizeMarketplaceRows(raw.map(listingFromSearch),ctx(body,provider))}
async function googleIndex(term:string,body:Any){
  const q=buildIndexQueries(term,where(body))[0],u=`https://www.google.com/search?q=${encodeURIComponent(q)}&num=30&hl=en&filter=0`;
  const r=await fetch(u,{headers:{'user-agent':ua(),'accept-language':'en-US,en;q=0.9',accept:'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(18000)}),html=await r.text().catch(()=> '');
  if(!r.ok)throw Error(`Google public index HTTP ${r.status}`);
  const raw=parseSearchHtml(html,30),rows=normalizeIndexed(raw,body,'google_public_index');
  return{provider:'google_index',term,rows,raw_count:raw.length,http_status:r.status,gated:false,query:q};
}
async function bingIndex(term:string,body:Any){
  const qs=buildIndexQueries(term,where(body)),q=qs[1]||qs[0],u=`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=30`;
  const r=await fetch(u,{headers:{'user-agent':ua(),'accept-language':'en-US,en;q=0.9',accept:'application/rss+xml,application/xml,text/xml,text/html'},redirect:'follow',signal:AbortSignal.timeout(18000)}),text=await r.text().catch(()=> '');
  if(!r.ok)throw Error(`Bing public index HTTP ${r.status}`);
  let raw=parseBingRss(text,30);if(!raw.length)raw=parseSearchHtml(text,30);
  const rows=normalizeIndexed(raw,body,'bing_public_index');
  return{provider:'bing_index',term,rows,raw_count:raw.length,http_status:r.status,gated:false,query:q};
}
async function duckIndex(term:string,body:Any){
  const qs=buildIndexQueries(term,where(body)),q=qs[2]||qs[0],u=`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const r=await fetch(u,{headers:{'user-agent':ua(),'accept-language':'en-US,en;q=0.9',accept:'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(18000)}),html=await r.text().catch(()=> '');
  if(!r.ok)throw Error(`DuckDuckGo public index HTTP ${r.status}`);
  const raw=parseSearchHtml(html,30),rows=normalizeIndexed(raw,body,'duckduckgo_public_index');
  return{provider:'duckduckgo_index',term,rows,raw_count:raw.length,http_status:r.status,gated:false,query:q};
}
function dedupe(rows:Any[],body:Any){return normalizeMarketplaceRows(rows,ctx(body,'public_multi_source')).slice(0,Math.max(1,Math.min(120,Number(body.max_results||120))))}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required'});
  if(!req.headers.get('authorization'))return json(req,401,{error:'Sign in required'});
  const started=Date.now(),body:Any=await req.json().catch(()=>({}));
  const termValues:string[]=(Array.isArray(body.terms)?body.terms:[]).map((x:any)=>txt(x)).filter((x:string)=>x.length>=2);
  const terms:string[]=[...new Set<string>(termValues)].slice(0,4),warnings:string[]=[];
  if(!terms.length)terms.push('tools','lawn mower','electronics','appliances');
  let rows:Any[]=[],directGated=false,attempts=0,successes=0,rawCandidates=0;
  const diagnostics:Any[]=[];
  const jobs:Promise<Any>[]=[];
  for(const term of terms){
    if(TOKEN)jobs.push(apify(term,body));
    jobs.push(direct(term,body),googleIndex(term,body),bingIndex(term,body),duckIndex(term,body));
  }
  attempts=jobs.length;
  const settled=await Promise.allSettled(jobs);
  for(const x of settled){
    if(x.status==='fulfilled'){
      successes++;const v=x.value;directGated=directGated||v.gated===true;rawCandidates+=Number(v.raw_count||0);rows.push(...v.rows.map((r:Any)=>({...r,term:v.term})));
      diagnostics.push({provider:v.provider,term:v.term,http_status:v.http_status,raw_count:Number(v.raw_count||0),verified_count:v.rows.length,gated:v.gated===true,query:v.query});
    }else warnings.push(txt(x.reason?.message||x.reason));
  }
  rows=dedupe(rows,body);
  const status=rows.length?'PASS':'PARTIAL';
  let providerStatus='PROVIDER_UNAVAILABLE';
  if(rows.length)providerStatus='LIVE';
  else if(rawCandidates>0)providerStatus='PUBLIC_LOCATION_UNPROVEN';
  else if(successes>0)providerStatus='PUBLIC_INDEX_EMPTY';
  const providers=[TOKEN?'Apify guest':null,'Facebook guest SSR','Google index','Bing RSS','DuckDuckGo index'].filter(Boolean).join(' + ');
  return json(req,200,{
    status,engine:'H38_FACEBOOK_PUBLIC_V264',provider_status:providerStatus,provider:`Public multi-source: ${providers}`,
    authentication:'NO_FACEBOOK_LOGIN',device_fallback_required:false,results:rows,count:rows.length,terms,location_query:where(body),attempts,successful_attempts:successes,raw_public_candidates:rawCandidates,direct_facebook_gated:directGated,
    diagnostics:diagnostics.slice(0,30),warnings:[...new Set(warnings)].slice(0,12),elapsed_ms:Date.now()-started,
    config_hint:rows.length?'':rawCandidates?'Public Marketplace URLs were found, but their returned snippets did not prove they were inside the selected Scout area. Scout kept them out of local ranking.':'Public search sources returned no indexable Marketplace item URLs in this pass. This remains unknown inventory, not zero local inventory.',
    truth:'Public-only Facebook discovery. Scout never needs a Facebook login, never reads Facebook cookies, and never treats search targeting alone as local proof. A listing is returned only when its distance or explicit city/state evidence matches the selected Scout area; missing, blocked, or unproven results remain unknown.'
  });
});
