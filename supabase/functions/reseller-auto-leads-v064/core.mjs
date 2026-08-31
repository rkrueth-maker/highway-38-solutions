const txt=v=>String(v??'').trim();
const digits=v=>txt(v).replace(/\D/g,'');
const retailerKey=v=>{const s=txt(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(s.includes('dollar general'))return'dollar general';if(s.includes('dollar tree'))return'dollar tree';if(s.includes('family dollar'))return'family dollar';if(s.includes('home depot'))return'home depot';return s};
function pennyTreeSignal(row){return(Array.isArray(row?.signal_sources)?row.signal_sources:[]).some(s=>{const d=txt(s?.domain).toLowerCase(),u=txt(s?.url).toLowerCase(),n=txt(s?.name).toLowerCase();return d==='pennytree.org'||u.includes('pennytree.org')||n==='penny tree'})||txt(row?.source_url).toLowerCase().includes('pennytree.org')||txt(row?.source_name).toLowerCase()==='penny tree'}
export function exactPennyTreeUrl(row={}){if(!pennyTreeSignal(row))return'';const r=retailerKey(row.retailer),upc=digits(row.upc||row.gtin||row.barcode);if(upc.length<7||upc.length>14)return'';if(r==='dollar general')return`https://pennytree.org/item.php?sku=${encodeURIComponent('dg:'+upc)}`;if(r==='dollar tree')return`https://pennytree.org/item.php?sku=${encodeURIComponent(upc)}`;return''}
export function exactDollarGeneralImageSources(row={}){const r=retailerKey(row.retailer),upc=digits(row.upc||row.gtin||row.barcode);if(r!=='dollar general'||upc.length<7||upc.length>14)return[];const out=[];const pt=exactPennyTreeUrl(row);if(pt)out.push({url:pt,provider:'PennyTree',scope:'exact_product'});out.push({url:`https://brickseek.com/dollar-general-inventory-checker?sku=${encodeURIComponent(upc)}`,provider:'BrickSeek',scope:'exact_upc'});return out}
function htmlDecode(v){return txt(v).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')}
function safeImageUrl(v,base='https://pennytree.org/'){let raw=htmlDecode(v);if(!raw)return'';try{raw=new URL(raw,base).href}catch{return''}if(!/^https:\/\//i.test(raw))return'';if(/(?:logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer|avatar|badge|banner|loading)/i.test(raw))return'';return raw}
function stripTags(v){return htmlDecode(String(v||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function cleanSourceTitle(v){return stripTags(v).replace(/\s*[|–-]\s*(?:Penny\s*Tree|BrickSeek).*$/i,'').replace(/^\$\s*0\.01\s*/,'').trim().slice(0,220)}
function titleTokens(v){return new Set(cleanSourceTitle(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(x=>x.length>2&&!['the','and','for','with','from','this','that','item','product','dollar','general','penny','sale'].includes(x)))}
export function sourceTitleAgreement(a,b){const A=titleTokens(a),B=titleTokens(b);if(!A.size||!B.size)return{status:'UNPROVEN',score:0};let hit=0;for(const x of A)if(B.has(x))hit++;const score=hit/Math.min(A.size,B.size);return{status:score>=.5?'MATCH':score>0?'WEAK':'MISMATCH',score:Number(score.toFixed(3))}}
export function extractSourceTitle(html=''){
  const s=String(html||''),patterns=[
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i
  ];
  for(const re of patterns){const m=s.match(re),t=m?cleanSourceTitle(m[1]):'';if(t.length>=4&&!/^(?:penny tree|brickseek|dollar general)$/i.test(t))return t}
  return'';
}
export function extractSourceImage(html='',base='https://pennytree.org/'){
  const s=String(html||'');
  const meta=[
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  ];
  for(const re of meta){const m=s.match(re),u=m?safeImageUrl(m[1],base):'';if(u)return u}
  const imgs=[...s.matchAll(/<img\b[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/ig)];
  for(const m of imgs){const tag=m[0],u=safeImageUrl(m[1],base);if(!u)continue;if(/product|item|catalog|card|hero/i.test(tag)||/alt=["'][^"']{4,}["']/i.test(tag))return u}
  return'';
}
export function applySourceImage(row={},html='',sourceUrl='',provider='exact_source'){
  const exact=txt(sourceUrl||row.source_item_url||exactPennyTreeUrl(row));if(!exact)return row;
  const image=txt(row.image_url)||extractSourceImage(html,exact),sourceTitle=extractSourceTitle(html),agreement=sourceTitle?sourceTitleAgreement(row.canonical_title||row.title||row.name,sourceTitle):{status:'UNPROVEN',score:0};
  const titleConflict=!!sourceTitle&&agreement.status==='MISMATCH';
  const identity=sourceTitle?{source_identity_title:sourceTitle,source_identity_provider:provider,source_identity_scope:'exact_upc',source_identity_agreement:agreement.status,source_identity_score:agreement.score}:{};
  const corrected=titleConflict?{raw_title:txt(row.raw_title||row.title||row.name),canonical_title:sourceTitle,title:sourceTitle,description_conflict:true,identity_warning:'Exact-UPC source title disagreed with the aggregated description. Scout replaced the display description with the exact-UPC source title; physical package/register verification remains final.'}:{};
  if(!image)return{...row,...identity,...corrected};
  return{...row,...identity,...corrected,image_url:image,image_source_url:exact,image_source_provider:provider,image_source_scope:'exact_product',image_source_proof:'exact_upc_public_image_v069'};
}
export function enrichLead(row={}){const exact=exactPennyTreeUrl(row);if(!exact)return row;const sources=(Array.isArray(row.signal_sources)?row.signal_sources:[]).map(s=>{const d=txt(s?.domain).toLowerCase(),u=txt(s?.url).toLowerCase(),n=txt(s?.name).toLowerCase(),isPt=d==='pennytree.org'||u.includes('pennytree.org')||n==='penny tree';return isPt?{...s,item_url:exact,item_scope:'exact_product'}:s});return{...row,source_item_url:exact,source_item_scope:'exact_product',source_item_proof:'pennytree_upc_route_v064',signal_sources:sources}}
export function enrichLeads(rows=[]){return(Array.isArray(rows)?rows:[]).map(enrichLead)}
