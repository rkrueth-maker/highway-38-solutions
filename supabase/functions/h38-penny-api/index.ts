import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const txt=v=>String(v??'').trim();
const digits=v=>txt(v).replace(/\D/g,'');
const coord=v=>v===null||v===undefined||v===''?NaN:Number(v);
const validCoords=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
const cleanHtml=v=>String(v??'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/&ndash;|&#8211;/gi,'–').replace(/&mdash;|&#8212;/gi,'—').replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(Number(n))}catch{return' '}});
const stripTags=v=>cleanHtml(String(v??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|li|h[1-6]|tr|article|section|button|a|span|td|th)>/gi,'\n').replace(/<[^>]+>/g,' '));
const lines=v=>stripTags(v).split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);

async function invoke(url,anon,auth,fn,payload,timeoutMs=90000){
  try{
    const r=await fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{Authorization:auth,apikey:anon,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});
    const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}}
    return {ok:r.ok,status:r.status,text,data};
  }catch(e){return {ok:false,status:598,text:e instanceof Error?e.message:String(e),data:{error:e instanceof Error?e.message:String(e)}}}
}

async function fetchText(url,timeoutMs=7000){
  try{
    const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36 H38Deals/Penny','accept':'text/html,application/xhtml+xml,application/rss+xml;q=0.9,*/*;q=0.8','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(timeoutMs)});
    if(!r.ok)return {ok:false,status:r.status,text:''};
    return {ok:true,status:r.status,text:(await r.text()).slice(0,2_400_000)};
  }catch{return {ok:false,status:598,text:''}}
}

function usefulTitle(v){const s=txt(v).replace(/\s+/g,' ');return s.length>=4&&s.length<=260&&!/^(?:upc|sku|price|penny|clearance|image|home depot|family dollar|current weekly list|penny list|view product|details?)$/i.test(s)}
function safeImage(raw,base){try{const u=new URL(cleanHtml(raw),base).toString();if(!/^https:\/\//i.test(u)||/(?:logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer|avatar|badge|banner|loading)/i.test(u))return'';return u}catch{return''}}
function isoDate(v){const s=txt(v);if(!s)return'';if(/^today$/i.test(s))return new Date().toISOString().slice(0,10);if(/^yesterday$/i.test(s)){const d=new Date();d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}const ago=s.match(/^(\d+)\s+days?\s+ago$/i);if(ago){const d=new Date();d.setUTCDate(d.getUTCDate()-Number(ago[1]));return d.toISOString().slice(0,10)}const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):s}
function retailerKey(v){const s=txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(s.includes('home depot'))return'home depot';if(s.includes('family dollar'))return'family dollar';if(s.includes('dollar general'))return'dollar general';if(s.includes('dollar tree'))return'dollar tree';return s||'other'}
function itemKey(r){const retailer=retailerKey(r?.retailer||r?.store_name),upc=digits(r?.upc||r?.gtin||r?.barcode).replace(/^0+/,''),sku=digits(r?.sku||r?.store_sku||r?.internet_number).replace(/^0+/,''),title=txt(r?.title||r?.canonical_title||r?.product_name).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(retailer==='home depot'&&sku)return`${retailer}|s:${sku}`;if(upc)return`${retailer}|u:${upc}`;if(sku)return`${retailer}|s:${sku}`;return`${retailer}|t:${title.slice(0,180)}`}
function mergeLeadSets(...sets){const out=[],index=new Map();for(const set of sets){for(const raw of Array.isArray(set)?set:[]){if(!raw)continue;const k=itemKey(raw);if(!k||/\|t:$/.test(k))continue;if(!index.has(k)){index.set(k,out.length);out.push({...raw});continue}const i=index.get(k),old=out[i],incoming={...raw};out[i]={...old,...incoming,title:txt(incoming.title||incoming.canonical_title||old.title||old.canonical_title),canonical_title:txt(incoming.canonical_title||incoming.title||old.canonical_title||old.title),image_url:txt(incoming.image_url||old.image_url),source_url:txt(incoming.source_url||old.source_url),signal_sources:[...(Array.isArray(old.signal_sources)?old.signal_sources:[]),...(Array.isArray(incoming.signal_sources)?incoming.signal_sources:[])]};}}
  return out;
}

function parsePennyCentral(html){
  const x=lines(html),out=[],seen=new Set();
  for(let i=0;i<x.length;i++){
    const sm=x[i].match(/^SKU\s+([0-9-]{5,20})$/i);if(!sm)continue;const sku=digits(sm[1]);if(!sku||seen.has(sku))continue;
    let title='',brand='',last='',reports=0,states=0,ref=0;
    for(let j=i-1;j>=Math.max(0,i-9);j--){const row=x[j];const ps=[...row.matchAll(/\$\s*([0-9,.]+)/g)].map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>.01);if(ps.length)ref=Math.max(ref,...ps);if(!title&&!/^\$|^SKU\b|^Last seen:?$/i.test(row)&&usefulTitle(row)){title=row.replace(/^Image:\s*/i,'');if(j>0&&x[j-1].length<45&&!/^Image:|Fresh signal|Hot Right Now/i.test(x[j-1]))brand=x[j-1];}}
    for(let j=i+1;j<=Math.min(x.length-1,i+14);j++){if(/^Last seen:?$/i.test(x[j])&&x[j+1])last=x[j+1];const r=x[j].match(/^(\d+)\s+reports?$/i);if(r)reports=Number(r[1]);const st=x[j].match(/^(\d+)\s+states?$/i);if(st)states=Number(st[1]);}
    if(!title||!/\$\s*0\.01\b/.test(x.slice(Math.max(0,i-8),Math.min(x.length,i+4)).join(' ')))continue;
    const rawAt=html.toLowerCase().indexOf(`sku ${sm[1]}`.toLowerCase()),slice=rawAt>=0?html.slice(Math.max(0,rawAt-6500),Math.min(html.length,rawAt+1400)):'',imgs=[...slice.matchAll(/<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)],image_url=imgs.length?safeImage(imgs[imgs.length-1][1],'https://www.pennycentral.com/penny-list'):'';
    seen.add(sku);const date=isoDate(last);
    out.push({id:`home-depot:${sku}`,retailer:'Home Depot',title,canonical_title:title,brand,sku,buy_price:.01,reported_penny_price:.01,original_price:ref,discount_pct:ref>.01?Math.round((1-.01/ref)*100):99,deep_discount:true,deal_type:'penny',near_penny:false,posted_date:date,last_seen:date,last_seen_label:last,image_url,community_reports:reports,community_states:states,source_name:'PennyCentral',source_url:'https://www.pennycentral.com/penny-list',source_priority:170,signal_sources:[{name:'PennyCentral',domain:'pennycentral.com',url:'https://www.pennycentral.com/penny-list',kind:'penny',observed_price:.01,observed_at:date}],availability_label:'Home Depot community penny lead. Physical UPC/register scan remains final local truth.'});
  }
  return out.slice(0,180);
}

function parseFamilyDollarDirect(html){
  const x=lines(html),out=[],seen=new Set();
  for(let i=0;i<x.length;i++){
    const m=x[i].match(/\bSKU\s+(?:FD)?\s*([0-9-]{4,20})(?:\s+UPC\s+(\d{7,14}))?/i);if(!m)continue;const sku=digits(m[1]),upc=digits(m[2]||'');if(!sku||seen.has(sku))continue;
    const block=x.slice(Math.max(0,i-8),Math.min(x.length,i+8)).join(' ');if(!/\$\s*0\.01\b|\bPenny\b/i.test(block))continue;
    let title='';for(let j=i-1;j>=Math.max(0,i-7);j--){const t=x[j].replace(/^\$\s*\d+(?:\.\d{1,2})?\s*/,'').trim();if(usefulTitle(t)&&!/^(?:Other \/ Misc|Penny|Online markdown|Family Dollar)/i.test(t)){title=t;break}}
    if(!title)title=`Family Dollar SKU ${sku}`;
    const prices=[...block.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map(z=>Number(z[1])).filter(Number.isFinite),original=prices.filter(p=>p>.01).sort((a,b)=>b-a)[0]||0;
    const rawAt=Math.max(html.toLowerCase().indexOf(`fd${sku}`.toLowerCase()),html.toLowerCase().indexOf(`fd%3a${sku}`.toLowerCase())),slice=rawAt>=0?html.slice(Math.max(0,rawAt-3500),Math.min(html.length,rawAt+1800)):'',imgs=[...slice.matchAll(/<img\b[^>]*?(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)],image_url=imgs.length?safeImage(imgs[imgs.length-1][1],'https://pennytree.org/'):'',source_item_url=`https://pennytree.org/item.php?sku=${encodeURIComponent('fd:'+sku)}`;
    seen.add(sku);out.push({id:`family-dollar:${sku}`,retailer:'Family Dollar',title,canonical_title:title,sku,upc,buy_price:.01,reported_penny_price:.01,original_price:original,discount_pct:original>.01?Math.round((1-.01/original)*100):99,deep_discount:true,deal_type:'penny',near_penny:false,image_url,source_name:'Penny Tree',source_url:'https://pennytree.org/?sort=new&store=familydollar&view=cheap',source_item_url,source_item_scope:'exact_product',source_priority:166,signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:source_item_url,kind:'penny',observed_price:.01}],availability_label:'Family Dollar catalog penny lead. Verify in the Family Dollar app or at the register; local price and stock are not guaranteed.'});
  }
  return out.slice(0,180);
}

function parseFamilyDollarRss(xml){
  const out=[],seen=new Set();for(const item of String(xml||'').split(/<item>/i).slice(1)){
    const link=cleanHtml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]||''),dm=link.match(/[?&]sku=fd(?:%3A|:)(\d+)/i);if(!dm)continue;const sku=digits(dm[1]);if(!sku||seen.has(sku))continue;let title=cleanHtml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+[—-]\s+\$?0\.01\s+at\s+Family Dollar.*$/i,'').replace(/\s+[—-]\s+Family Dollar.*$/i,'').trim();if(!usefulTitle(title))title=`Family Dollar SKU ${sku}`;seen.add(sku);out.push({id:`family-dollar:${sku}`,retailer:'Family Dollar',title,canonical_title:title,sku,buy_price:.01,reported_penny_price:.01,discount_pct:99,deep_discount:true,deal_type:'penny',near_penny:false,source_name:'Penny Tree public index',source_url:link,source_item_url:link,source_priority:150,signal_sources:[{name:'Penny Tree public index',domain:'pennytree.org',url:link,kind:'penny',observed_price:.01}],availability_label:'Family Dollar public penny lead. Verify in the Family Dollar app or at the register.'});if(out.length>=60)break;
  }return out;
}

async function retailerSupplements(){
  const fdMain='https://pennytree.org/?store=familydollar',fdCheap='https://pennytree.org/?sort=new&store=familydollar&view=cheap',fdQ='site:pennytree.org/item.php?sku=fd "Family Dollar" "$0.01"',fdRss=`https://www.bing.com/search?format=rss&q=${encodeURIComponent(fdQ)}`;
  const [hd,fd1,fd2,rss]=await Promise.all([fetchText('https://www.pennycentral.com/penny-list',7000),fetchText(fdMain,7000),fetchText(fdCheap,7000),fetchText(fdRss,7000)]);
  const homeDepot=hd.ok?parsePennyCentral(hd.text):[],familyDirect=mergeLeadSets(fd1.ok?parseFamilyDollarDirect(fd1.text):[],fd2.ok?parseFamilyDollarDirect(fd2.text):[]),familyRss=parseFamilyDollarRss(rss.text),familyDollar=mergeLeadSets(familyDirect,familyRss);
  return {leads:mergeLeadSets(homeDepot,familyDollar),home_depot_count:homeDepot.length,family_dollar_count:familyDollar.length,status:{home_depot:hd.ok?'AVAILABLE':'UNAVAILABLE',family_dollar_direct:(fd1.ok||fd2.ok)?'AVAILABLE':'UNAVAILABLE',family_dollar_index:rss.ok?'AVAILABLE':'UNAVAILABLE'}};
}

function storesFrom(data){if(Array.isArray(data))return data;if(data&&Array.isArray(data.stores))return data.stores;if(data&&data.data&&Array.isArray(data.data.stores))return data.data.stores;return []}
function storeIdentity(s){const direct=txt(s?.store_key);if(direct)return direct;const retailer=retailerKey(s?.retailer||s?.store_name),address=txt(s?.store_address||s?.address).toLowerCase().replace(/\s+/g,' '),lat=txt(s?.lat??s?.latitude),lon=txt(s?.lon??s?.longitude);return `${retailer}|${address}|${lat}|${lon}`}
function mergeStores(...sets){const seen=new Set(),out=[];for(const set of sets)for(const s of set){const k=storeIdentity(s);if(k&&!seen.has(k)){seen.add(k);out.push(s)}}return out}

async function authenticatedUserId(sb,token){
  try{
    const claims=await sb.auth.getClaims(token),sub=String(claims?.data?.claims?.sub||'').trim();
    if(!claims?.error&&sub)return sub;
  }catch{}
  for(let attempt=0;attempt<2;attempt++){
    try{const {data:{user},error}=await sb.auth.getUser(token);if(!error&&user?.id)return String(user.id)}catch{}
    if(attempt===0)await new Promise(resolve=>setTimeout(resolve,200));
  }
  return '';
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization')||'',token=auth.replace(/^Bearer\s+/i,'');if(!token)return json({error:'AUTH_REQUIRED'},401);
    const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY');
    const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}}),userId=await authenticatedUserId(sb,token);if(!userId)return json({error:'AUTH_REQUIRED'},401);const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';const admin=service?createClient(url,service):sb;
    const {data:ent}=await sb.from('h38_product_entitlements').select('active,expires_at').eq('user_id',userId).eq('product_key','penny').maybeSingle();if(!ent?.active||(ent.expires_at&&Date.parse(ent.expires_at)<=Date.now()))return json({error:'PRODUCT_LOCKED',product:'penny'},403);
    const body=await req.json().catch(()=>({})),action=String(body.action||'hunt_fast'),input={...(body.payload||{})};

    if(action==='stores'){
      let lat=coord(input.lat),lon=coord(input.lon);const zip=String(input.zip||input.postal||'').match(/\b\d{5}\b/)?.[0]||'';
      if(!validCoords(lat,lon)){if(!zip)return json({error:'VALID_LOCATION_REQUIRED',product:'penny',source:'reseller-nearby-stores-v262'},400);const geo=await invoke(url,anon,auth,'reseller-location-geocode',{zip},15000),location=geo.data?.location;lat=coord(location?.lat);lon=coord(location?.lon);if(!geo.ok||!validCoords(lat,lon))return json({error:'LOCATION_RESOLUTION_FAILED',product:'penny',source:'reseller-location-geocode',detail:`${geo.status}:${geo.text.slice(0,250)}`},502)}
      const radius=Number(input.radiusMiles??input.radius_miles??input.radius??50),safeRadius=Number.isFinite(radius)&&radius>0?radius:50,storesPayload={...input,zip:zip||input.zip,lat,lon,radiusMiles:safeRadius,quickRadiusMiles:Math.min(safeRadius,50)};
      const quick=await invoke(url,anon,auth,'reseller-nearby-stores-v262',storesPayload,18000),quickStores=storesFrom(quick.data);if(quick.ok&&quickStores.length>=12)return json({ok:true,product:'penny',source:'reseller-nearby-stores-v262',resolved_location:{lat,lon,zip},data:{...quick.data,stores:quickStores,store_count:quickStores.length}});
      const latSpan=Math.max(.22,safeRadius/69),lonSpan=Math.max(.25,safeRadius/(69*Math.max(.25,Math.cos(lat*Math.PI/180))));
      const cache=await admin.from('reseller_store_discovery_tiles').select('stores,updated_at,lat,lon,radius_miles').gte('lat',lat-latSpan).lte('lat',lat+latSpan).gte('lon',lon-lonSpan).lte('lon',lon+lonSpan).order('updated_at',{ascending:false}).limit(80);
      const cachedStores=cache.error?[]:mergeStores(...(cache.data||[]).map(t=>storesFrom(t.stores)));
      if(cachedStores.length>=12){const stores=mergeStores(quickStores,cachedStores);return json({ok:true,product:'penny',source:'reseller-store-discovery-cache',resolved_location:{lat,lon,zip},data:{stores,store_count:stores.length,quick_store_count:quickStores.length,cached_store_count:cachedStores.length,cache_fallback:true}})}
      let durable=null,durableStores=[];for(let pass=0;pass<2;pass++){durable=await invoke(url,anon,auth,'reseller-nearby-stores',{lat,lon,radiusMiles:safeRadius,zip:zip||input.zip},22000);if(durable.ok){durableStores=storesFrom(durable.data);if(durableStores.length>=12||durable.data?.scan_complete)break}else break}
      const merged=mergeStores(quickStores,cachedStores,durableStores);if(merged.length)return json({ok:true,product:'penny',source:durableStores.length?'reseller-nearby-stores-v262+cache+reseller-nearby-stores':(cachedStores.length?'reseller-store-discovery-cache':'reseller-nearby-stores-v262'),resolved_location:{lat,lon,zip},data:{...(durable?.data||{}),stores:merged,store_count:merged.length,quick_store_count:quickStores.length,cached_store_count:cachedStores.length,durable_store_count:durableStores.length,cache_fallback:cachedStores.length>0}});
      return json({error:'STORE_DISCOVERY_EMPTY',product:'penny',resolved_location:{lat,lon,zip}},502);
    }

    if(action==='retailer_supplements'){
      const s=await retailerSupplements();return json({ok:true,product:'penny',source:'penny-retailer-supplements-v7',data:{leads:s.leads,count:s.leads.length,home_depot_count:s.home_depot_count,family_dollar_count:s.family_dollar_count,source_status:s.status}});
    }

    if(action==='hunt_fast'){
      const base=await invoke(url,anon,auth,'reseller-auto-leads-v061-fast',input,12000);if(!base.ok)return json({ok:true,product:'penny',source:'reseller-auto-leads-v061-fast',data:{leads:[],count:0,partial:true,warning:`Fast base delayed: ${base.status}:${base.text.slice(0,160)}`}});
      return json({ok:true,product:'penny',source:'reseller-auto-leads-v061-fast',data:base.data});
    }

    if(action==='hunt_full'){
      const [full,sup]=await Promise.all([invoke(url,anon,auth,'reseller-auto-leads-v065',input,90000),retailerSupplements()]);const fullRows=full.ok?(Array.isArray(full.data?.leads)?full.data.leads:[]):[],leads=mergeLeadSets(fullRows,sup.leads);if(!leads.length&&!full.ok)return json({error:'SOURCE_UNAVAILABLE',detail:`reseller-auto-leads-v065:${full.status}:${full.text.slice(0,250)}`},502);return json({ok:true,product:'penny',source:'reseller-auto-leads-v065+retailer-supplements-v7',data:{...(full.ok?full.data:{}),leads,count:leads.length,home_depot_supplement_count:sup.home_depot_count,family_dollar_supplement_count:sup.family_dollar_count,retailer_supplement_status:sup.status}});
    }

    if(action==='remodel'){const res=await invoke(url,anon,auth,'reseller-dg-remodel-radar-v240',input,45000);if(res.ok)return json({ok:true,product:'penny',source:'reseller-dg-remodel-radar-v240',data:res.data});return json({error:'SOURCE_UNAVAILABLE',detail:`reseller-dg-remodel-radar-v240:${res.status}:${res.text.slice(0,250)}`},502)}
    return json({error:'UNKNOWN_ACTION'},400);
  }catch(e){return json({error:'PENNY_API_ERROR',detail:e instanceof Error?e.message:String(e)},500)}
});
