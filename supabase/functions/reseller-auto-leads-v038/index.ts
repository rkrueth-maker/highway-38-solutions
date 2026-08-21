import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const BASE=Deno.env.get("SUPABASE_URL")||"";
const UA="Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/0.1.42 penny-signal";
const SIGNAL_VERSION="penny-signal-v042";
const CACHE_MS=8*60*1000;
let extraCache=null;

const EXTRA_SOURCES=[
  {id:"kcl-dg",retailer:"Dollar General",name:"Krazy Coupon Lady",domain:"thekrazycouponlady.com",url:"https://thekrazycouponlady.com/tips/store-hacks/dollar-general-penny-list",kind:"penny",parser:"upc-list",priority:122},
  {id:"freebie-dg",retailer:"Dollar General",name:"The Freebie Guy",domain:"thefreebieguy.com",url:"https://thefreebieguy.com/dollar-general-penny-shopping-master-list/",kind:"penny",parser:"upc-list",priority:121},
  {id:"pt-dg-penny",retailer:"Dollar General",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/?store=dollargeneral",kind:"penny",parser:"pennytree-upc",priority:118},
  {id:"pt-dg-near",retailer:"Dollar General",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/?sort=new&store=dollargeneral&view=cheap",kind:"near_penny",parser:"pennytree-upc",priority:112,max_price:.50},
  {id:"pt-dt-penny",retailer:"Dollar Tree",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/?page=1&sort=new&view=pennies",kind:"penny",parser:"pennytree-upc-or-item",priority:118},
  {id:"pt-dt-near",retailer:"Dollar Tree",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/print-list.php?view=clearance",kind:"near_penny",parser:"pennytree-item",priority:112,max_price:.75},
  {id:"pt-fd-penny",retailer:"Family Dollar",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/?store=familydollar",kind:"penny",parser:"pennytree-upc",priority:116},
  {id:"pt-fd-near",retailer:"Family Dollar",name:"Penny Tree",domain:"pennytree.org",url:"https://pennytree.org/?sort=new&store=familydollar&view=cheap",kind:"near_penny",parser:"pennytree-upc",priority:111,max_price:.97}
];

function cors(req){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":ORIGINS.has(origin)?origin:"https://appassets.androidplatform.net",
    "access-control-allow-headers":"authorization, apikey, content-type",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "content-type":"application/json; charset=utf-8",
    "cache-control":"private, max-age=120",
    "vary":"Origin"
  };
}
function json(req,status,body){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
function clean(v){return String(v??"").replace(/\s+/g," ").trim()}
function decode(v){
  return String(v??"")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#0*39;|&apos;/gi,"'")
    .replace(/&ndash;|&#8211;/gi,"–")
    .replace(/&mdash;|&#8212;/gi,"—")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi,'"')
    .replace(/&#x2F;/gi,"/")
    .replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(Number(n))}catch{return" "}});
}
function lines(html){
  return decode(String(html||"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"\n")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|article|section|button|a|span)>/gi,"\n")
    .replace(/<[^>]+>/g," "))
    .split(/\r?\n/).map(clean).filter(Boolean);
}
function retailerKey(v){
  const s=clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  if(s.includes("home depot"))return"home depot";
  if(s.includes("dollar general"))return"dollar general";
  if(s.includes("dollar tree"))return"dollar tree";
  if(s.includes("family dollar"))return"family dollar";
  if(s.includes("lowe"))return"lowes";
  return s;
}
function digits(v){return clean(v).replace(/\D/g,"")}
function skuNorm(retailer,v){
  const raw=clean(v).toLowerCase(),d=digits(raw);
  return retailerKey(retailer)==="home depot"&&d.length>=5?d:raw.replace(/[^a-z0-9]+/g,"");
}
function identity(row){
  const retailer=retailerKey(row?.retailer),upc=digits(row?.upc),sku=skuNorm(row?.retailer,row?.sku);
  let url="";
  try{const u=new URL(clean(row?.source_url));url=u.hostname.toLowerCase()+u.pathname.replace(/\/$/,"")}catch{}
  const title=clean(row?.title).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,140);
  return `${retailer}|${upc.length>=7?`u:${upc}`:sku?`s:${sku}`:url?`url:${url}`:`t:${title}`}`;
}
function rank(row){
  const type=String(row?.deal_type||"").toLowerCase();
  return (type==="penny"?200000:type==="near_penny"?100000:0)+(row?.deep_discount?10000:0)+Number(row?.source_priority||0)*10+Number(row?.discount_pct||0);
}
function sourceDomain(row){
  if(clean(row?.signal_domain))return clean(row.signal_domain).toLowerCase();
  try{return new URL(clean(row?.source_url)).hostname.toLowerCase().replace(/^www\./,"")}catch{return clean(row?.source_name).toLowerCase()}
}
function signalFrom(row){
  return {
    name:clean(row?.signal_name||row?.source_name||"Source"),
    domain:sourceDomain(row),
    url:clean(row?.signal_url||row?.source_url),
    kind:clean(row?.deal_type||"candidate"),
    observed_price:Number.isFinite(Number(row?.reported_penny_price))?Number(row.reported_penny_price):Number.isFinite(Number(row?.buy_price))?Number(row.buy_price):null,
    observed_at:clean(row?.signal_observed_at||row?.penny_date||"")
  };
}
function distinctSignals(list){
  const out=[],seen=new Set();
  for(const s of list||[]){
    const domain=clean(s?.domain||(()=>{try{return new URL(clean(s?.url)).hostname.replace(/^www\./,"")}catch{return""}})()).toLowerCase();
    const key=domain||clean(s?.name).toLowerCase();
    if(!key||seen.has(key))continue;
    seen.add(key);out.push({...s,domain});
  }
  return out;
}
function confidence(n){return n>=3?"HIGH":n>=2?"MEDIUM":"LOW"}
function aggregate(rows){
  const map=new Map();
  for(const row0 of rows){
    if(!row0||!clean(row0.retailer))continue;
    const key=identity(row0);
    if(!key||key.endsWith("|t:"))continue;
    const row={...row0};
    const current=map.get(key);
    if(!current){
      row.signal_sources=distinctSignals([...(Array.isArray(row.signal_sources)?row.signal_sources:[]),signalFrom(row)]);
      map.set(key,row);continue;
    }
    const winner=rank(row)>rank(current)?row:current,loser=winner===row?current:row;
    const merged={...loser,...winner};
    merged.signal_sources=distinctSignals([
      ...(Array.isArray(current.signal_sources)?current.signal_sources:[]),signalFrom(current),
      ...(Array.isArray(row.signal_sources)?row.signal_sources:[]),signalFrom(row)
    ]);
    if(String(current.deal_type)==="penny"||String(row.deal_type)==="penny"){
      merged.deal_type="penny";merged.near_penny=false;merged.reported_penny_price=.01;
    }else if(String(current.deal_type)==="near_penny"||String(row.deal_type)==="near_penny"){
      merged.deal_type="near_penny";merged.near_penny=true;
    }
    map.set(key,merged);
  }
  const out=[...map.values()];
  for(const row of out){
    const sigs=distinctSignals(row.signal_sources||[]);
    row.signal_sources=sigs;
    row.signal_source_count=sigs.length;
    row.signal_confidence=confidence(sigs.length);
    row.signal_version=SIGNAL_VERSION;
    const type=String(row.deal_type||"");
    if(type==="penny"){
      const extra=`${row.signal_confidence} PENNY SIGNAL · ${sigs.length} independent source${sigs.length===1?"":"s"} · NOT STORE VERIFIED`;
      row.availability_label=clean(`${extra}. ${row.availability_label||"Retailer-wide penny candidate; local price and stock require store-bound verification."}`);
    }else if(type==="near_penny"){
      row.near_penny=true;
      const price=Number(row.buy_price);
      const priceText=Number.isFinite(price)&&price>0?` · signal price $${price.toFixed(2)}`:"";
      row.availability_label=clean(`NEAR-PENNY SIGNAL${priceText} · ${sigs.length} independent source${sigs.length===1?"":"s"} · NOT STORE VERIFIED. ${row.availability_label||"Candidate markdown may move lower; verify the selected store before acting."}`);
    }
  }
  return out.sort((a,b)=>rank(b)-rank(a));
}
function usefulTitle(v){
  const s=clean(v);
  if(s.length<4||s.length>260)return false;
  return !/^(?:upc|sku|add to|on your list|i found it|penny|clearance|current weekly list|surprise penny list|health & beauty|food|beverage|medicine|new markdowns?)\b/i.test(s);
}
function stripTitle(v){
  return clean(v)
    .replace(/^(?:🪙\s*Penny|Penny|🏷️\s*Clearance|Clearance)\s*/i,"")
    .replace(/^[^$]{0,55}\$[0-9.]+\s+/,"")
    .replace(/\b(?:Other \/ Misc|Health & Wellness|Food & Snacks|Kitchen & Dining|Home & Decor|Toys & Games|Arts & Crafts|Outdoor & Garden)\b[\s\S]*$/i,"")
    .replace(/\s+(?:🆕|🔻|🗓|first carried|submitted|updated)[\s\S]*$/i,"")
    .replace(/\s+/g," ").trim();
}
function makeSignal(src,title,upc,sku,price,kind,extra={}){
  const penny=kind==="penny",near=kind==="near_penny";
  return {
    id:`${retailerKey(src.retailer).replace(/\s+/g,"-")}:${upc||sku||clean(title).toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)}`,
    retailer:src.retailer,title:clean(title),sku:clean(sku),upc:digits(upc),
    buy_price:penny?.01:Number(price||0),
    reported_penny_price:penny?.01:null,
    original_price:Number(extra.original_price||0),
    discount_pct:penny?99:Number(extra.discount_pct||0),
    deep_discount:penny||near,
    deal_type:kind,near_penny:near,penny_date:clean(extra.date||""),
    source_name:src.name,source_url:src.url,source_priority:src.priority,
    availability_label:penny?"Chain/catalog penny signal; not a guaranteed local register price.":"Cheap clearance signal; not a guaranteed local price or future penny.",
    resale_potential:penny?88:72,stock_status:"not_checked",stock_count:null,stock_checked:false,
    signal_name:src.name,signal_domain:src.domain,signal_url:src.url,signal_observed_at:clean(extra.date||""),
    signal_sources:[{name:src.name,domain:src.domain,url:src.url,kind,observed_price:penny?.01:Number(price||0),observed_at:clean(extra.date||"")}]
  };
}
function parseUpcList(html,src){
  const x=lines(html),out=[],seen=new Set();
  let date="";
  for(const ln of x.slice(0,100)){
    const m=ln.match(/(?:effective|updated|surprise penny items?|penny items?)\s*(?:wednesday|tuesday)?[,]?\s*([A-Z][a-z]+\s+\d{1,2}(?:,\s*2026)?)/i);
    if(m){date=m[1];break}
  }
  for(let i=0;i<x.length&&out.length<100;i++){
    const ln=x[i];
    let m=ln.match(/^(.{4,230}?)(?:\s*[—–-]\s*UPC\s*:?\s*|\s+[—–-]\s*)(\d{7,14})\s*$/i);
    if(!m)m=ln.match(/^(.{4,230}?)\s+UPC\s*:?\s*(\d{7,14})\s*$/i);
    if(!m)continue;
    const title=clean(m[1]).replace(/^[*•·-]+\s*/,""),upc=digits(m[2]);
    if(!usefulTitle(title)||upc.length<7||seen.has(upc))continue;
    seen.add(upc);out.push(makeSignal(src,title,upc,"",.01,"penny",{date}));
  }
  return out;
}
function nearestCandidateLine(x,i){
  for(let j=i-1;j>=Math.max(0,i-6);j--){
    const ln=x[j];
    if(/\$\s*\d+(?:\.\d{1,2})?/.test(ln)&&usefulTitle(ln))return ln;
  }
  return"";
}
function pricesFrom(v){return[...String(v||"").matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map(m=>Number(m[1])).filter(Number.isFinite)}
function parsePennyTree(html,src){
  const x=lines(html),out=[],seen=new Set();
  for(let i=0;i<x.length&&out.length<120;i++){
    let upc="",sku="";
    const um=x[i].match(/\bUPC\s+(\d{7,14})\b/i);
    const im=x[i].match(/\$\s*(\d+(?:\.\d{1,2})?)\s+#(\d{5,12})\b/);
    if(um)upc=digits(um[1]);
    if(im)sku=clean(im[2]);
    if(!upc&&!sku)continue;
    const id=upc||sku;if(seen.has(id))continue;
    const sourceLine=im?x[i]:nearestCandidateLine(x,i);
    if(!sourceLine)continue;
    const ps=pricesFrom(sourceLine),price=im?Number(im[1]):(ps.length?ps[ps.length-1]:0);
    if(!(price>0))continue;
    const penny=Math.abs(price-.01)<.0001;
    if(src.kind==="penny"&&!penny)continue;
    if(src.kind==="near_penny"&&(penny||price>Number(src.max_price||.97)))continue;
    let title=stripTitle(sourceLine);
    title=title.replace(/\$\s*\d+(?:\.\d{1,2})?/g," ").replace(/\s+/g," ").trim();
    if(!usefulTitle(title)){
      for(let j=i-1;j>=Math.max(0,i-4);j--){const t=stripTitle(x[j]);if(usefulTitle(t)&&!/\b(?:UPC|Add to|On your list)\b/i.test(t)){title=t;break}}
    }
    if(!usefulTitle(title))title=`${src.retailer} ${penny?"penny":"near-penny"} candidate ${id}`;
    seen.add(id);
    const was=ps.length>1?Math.max(...ps):0,pct=was>price?Math.round((1-price/was)*100):0;
    out.push(makeSignal(src,title,upc,sku,price,penny?"penny":"near_penny",{original_price:was,discount_pct:pct}));
  }
  return out;
}
async function fetchExtra(src){
  const r=await fetch(src.url,{headers:{"user-agent":UA,"accept":"text/html,application/xhtml+xml","accept-language":"en-US,en;q=0.9"},redirect:"follow",signal:AbortSignal.timeout(16000)});
  if(!r.ok)throw Error(`${src.name} ${src.retailer} ${src.kind} returned ${r.status}`);
  const html=await r.text();
  const rows=src.parser==="upc-list"?parseUpcList(html,src):parsePennyTree(html,src);
  if(!rows.length)throw Error(`${src.name} ${src.retailer} ${src.kind} returned no truthful identifiable rows`);
  return rows;
}
async function extraSignals(){
  if(extraCache&&Date.now()-extraCache.at<CACHE_MS)return{...extraCache.payload,cached:true};
  const settled=await Promise.allSettled(EXTRA_SOURCES.map(fetchExtra)),rows=[],source_status=[],warnings=[];
  settled.forEach((r,i)=>{
    const s=EXTRA_SOURCES[i];
    if(r.status==="fulfilled"){
      rows.push(...r.value);source_status.push({retailer:s.retailer,source:s.name,domain:s.domain,kind:s.kind,status:"PASS",products:r.value.length,adapter:s.parser});
    }else{
      const warning=r.reason instanceof Error?r.reason.message:String(r.reason);
      warnings.push(warning);source_status.push({retailer:s.retailer,source:s.name,domain:s.domain,kind:s.kind,status:"NO_MATCHING_PRODUCTS",products:0,warning});
    }
  });
  const payload={rows,source_status,warnings};extraCache={at:Date.now(),payload};return payload;
}
function summaryByRetailer(leads){
  const by={},penny={},near={},multi={};
  for(const l of leads){
    const r=clean(l.retailer)||"Unknown";by[r]=(by[r]||0)+1;
    if(l.deal_type==="penny")penny[r]=(penny[r]||0)+1;
    if(l.deal_type==="near_penny")near[r]=(near[r]||0)+1;
    if(Number(l.signal_source_count)>=2)multi[r]=(multi[r]||0)+1;
  }
  return{by,penny,near,multi};
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,405,{error:"GET or POST required."});
  try{
    const auth=req.headers.get("authorization")||"",apikey=req.headers.get("apikey")||"";
    if(!auth)return json(req,401,{error:"Sign in required."});
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads`,{
      method:"POST",headers:{authorization:auth,apikey,"content-type":"application/json"},body:"{}",signal:AbortSignal.timeout(40000)
    });
    const payload=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||payload?.message||"Candidate source unavailable."});

    const baseRows=Array.isArray(payload?.leads)?payload.leads:[];
    let extras={rows:[],source_status:[],warnings:[]};
    try{extras=await extraSignals()}catch(e){extras={rows:[],source_status:[],warnings:[e instanceof Error?e.message:String(e)]}}
    const leads=aggregate([...baseRows,...extras.rows]);
    const stats=summaryByRetailer(leads);
    const baseStatus=Array.isArray(payload?.source_status)?payload.source_status:[];
    const warnings=[...(Array.isArray(payload?.warnings)?payload.warnings:[]),...extras.warnings];
    return json(req,200,{
      ...payload,leads,count:leads.length,raw_count:baseRows.length+extras.rows.length,
      duplicate_count:Math.max(0,baseRows.length+extras.rows.length-leads.length),
      by_retailer:stats.by,penny_by_retailer:stats.penny,near_penny_by_retailer:stats.near,
      multi_source_by_retailer:stats.multi,source_status:[...baseStatus,...extras.source_status],warnings,
      dedupe_version:"strict-retailer-upc-sku-v042",signal_version:SIGNAL_VERSION,
      signal_rule:"Independent source quorum raises candidate confidence only. It never proves local price or stock.",
      local_truth_rule:"LOCAL $0.01 requires store-bound verification at the selected physical store.",
      supplemental_source_count:EXTRA_SOURCES.length
    });
  }catch(e){
    return json(req,503,{error:e instanceof Error?e.message:String(e)})
  }
});
