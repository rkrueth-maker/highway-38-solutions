const txt=v=>String(v??'').trim();
const num=v=>{if(v==null)return null;if(typeof v==='object')v=v.amount??v.value??v.price??v.formatted_amount;const s=txt(v).replace(/[^0-9.-]/g,'');const n=Number(s);return Number.isFinite(n)?n:null};
const first=(...v)=>v.find(x=>x!==undefined&&x!==null&&txt(x)!=='');
const US_STATES={alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC'};
const norm=v=>txt(v).toLowerCase().replace(/\b\d{5}(?:-\d{4})?\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function stateCode(v){const n=norm(v);if(!n)return'';if(/^[a-z]{2}$/.test(n))return n.toUpperCase();return US_STATES[n]||''}
function placeParts(v){const raw=txt(v).replace(/\b\d{5}(?:-\d{4})?\b/g,'').replace(/^ZIP\s+/i,'').trim(),parts=raw.split(',').map(x=>x.trim()).filter(Boolean);if(parts.length>=2)return{city:norm(parts[0]),region:stateCode(parts[1])||norm(parts[1])};const words=norm(raw).split(' ').filter(Boolean);if(words.length>=2){const last=words[words.length-1],code=stateCode(last);if(code)return{city:words.slice(0,-1).join(' '),region:code}}return{city:norm(raw),region:''}}
function textLocationMatches(label,ctx){const got=placeParts(label),want=placeParts(first(ctx.locationLabel,ctx.location_label,[ctx.city,ctx.state].filter(Boolean).join(', ')));if(!got.city||!want.city||got.city!==want.city)return false;if(want.region)return !!got.region&&got.region===want.region;return false}
function imageOf(r){const p=first(r?.image_url,r?.image,r?.thumbnailUrl,r?.thumbnail_url,r?.primary_listing_photo?.image?.uri,r?.listingPhotoUrl,r?.photo);if(typeof p==='string')return p;return txt(p?.url||p?.uri)}
function urlOf(r,id){const u=txt(first(r?.url,r?.listingUrl,r?.listing_url,r?.source_url));if(/^https:\/\//i.test(u))return u;return id?`https://www.facebook.com/marketplace/item/${id}/`:''}
function locationOf(r){return txt(first(r?.location_label,r?.location,r?.locationName,r?.city_state,r?.marketplace_listing_location?.reverse_geocode?.city,r?.city))}
function coord(r,names){for(const name of names){const n=Number(r?.[name]);if(Number.isFinite(n))return n}return null}
function haversineMiles(a,b,c,d){const R=3958.7613,rad=x=>x*Math.PI/180,dp=rad(c-a),dl=rad(d-b),q=Math.sin(dp/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(q)))}
export function normalizeMarketplaceRow(r={},ctx={}){const id=txt(first(r?.id,r?.listingId,r?.listing_id,r?.marketplace_listing_id,r?.node?.id)),title=txt(first(r?.title,r?.listingTitle,r?.listing_title,r?.name,r?.marketplace_listing_title,r?.node?.marketplace_listing_title)),price=num(first(r?.price,r?.listingPrice,r?.listing_price,r?.formatted_price,r?.price_label,r?.node?.listing_price)),km=num(first(r?.distanceKm,r?.distance_km)),explicitMiles=num(first(r?.distance_miles,km!=null?km*.621371:null)),rowLat=coord(r,['lat','latitude','listing_latitude']),rowLon=coord(r,['lon','lng','longitude','listing_longitude']),ctxLat=Number(first(ctx.lat,ctx.latitude)),ctxLon=Number(first(ctx.lon,ctx.lng,ctx.longitude)),geoMiles=explicitMiles==null&&rowLat!=null&&rowLon!=null&&Number.isFinite(ctxLat)&&Number.isFinite(ctxLon)?haversineMiles(ctxLat,ctxLon,rowLat,rowLon):null,miles=explicitMiles??geoMiles,city=txt(first(r?.city,r?.location?.city)),state=txt(first(r?.state,r?.location?.state)),label=locationOf(r)||[city,state].filter(Boolean).join(', '),radius=Number(ctx.radiusMiles||50),hasDistance=miles!=null,localByDistance=hasDistance&&miles<=radius+.15,localByText=!hasDistance&&textLocationMatches(label,ctx),verified=hasDistance?localByDistance:localByText,evidence=hasDistance?(verified?'distance':'outside_radius'):(localByText?'city_state':'unproven');return{id:id||urlOf(r,id),source:'Facebook Marketplace',title:title||'Marketplace listing',price:price!=null?price:null,buy_price:price!=null?price:null,url:urlOf(r,id),image_url:imageOf(r),location_label:label,distance_miles:miles!=null?Number(miles.toFixed(1)):null,location_verified:verified,location_evidence:evidence,source_search_bound:true,captured_at:new Date().toISOString(),provider:txt(ctx.provider||'public_guest'),public_listing:true}}
export function normalizeMarketplaceRows(rows=[],ctx={}){const out=[],seen=new Set();for(const r of Array.isArray(rows)?rows:[]){if(r?.record_type==='diagnostic'||r?.type==='diagnostic')continue;const x=normalizeMarketplaceRow(r,ctx),k=x.url||x.id;if(!k||seen.has(k)||!x.title)continue;if(x.distance_miles!=null&&x.distance_miles>Number(ctx.radiusMiles||50)+.15)continue;if(ctx.onlyVerified===true&&x.location_verified!==true)continue;seen.add(k);out.push(x)}return out}

function decodeHydration(value=''){
  let s=String(value);
  s=s.replace(/\\u002[fF]/g,'/').replace(/\\u0026/g,'&').replace(/\\u003[dD]/g,'=').replace(/\\u003[fF]/g,'?').replace(/\\\//g,'/').replace(/&amp;/g,'&');
  // Facebook/search caches sometimes embed the complete Marketplace URL percent-encoded.
  s=s.replace(/https?%3A%2F%2F[^\s"'<>]{12,800}/gi,m=>{try{return decodeURIComponent(m)}catch{return m}});
  return s;
}
function jsonStringNear(segment,key){const re=new RegExp('"'+key+'"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"','i'),m=segment.match(re);if(!m)return'';try{return JSON.parse('"'+m[1]+'"')}catch{return m[1].replace(/\\u0026/g,'&').replace(/\\\//g,'/')}}
function guestItemIds(html=''){
  const normalized=decodeHydration(html),seen=new Set(),hits=[];
  const patterns=[
    /(?:https?:\/\/(?:www\.|m\.)?facebook\.com)?\/marketplace\/item\/(\d{6,})/gi,
    /"marketplace_listing_id"\s*:\s*"?(\d{6,})"?/gi,
    /"listing_id"\s*:\s*"?(\d{6,})"?[\s\S]{0,500}?marketplace/gi
  ];
  for(const re of patterns){let m;while((m=re.exec(normalized))){const id=m[1];if(seen.has(id))continue;seen.add(id);hits.push({id,index:m.index});if(hits.length>=160)return{normalized,hits}}}
  return{normalized,hits};
}
export function parseGuestHtml(html='',ctx={}){
  const {normalized:s,hits}=guestItemIds(html),out=[];
  for(const hit of hits){
    const a=Math.max(0,hit.index-1800),b=Math.min(s.length,hit.index+3600),snip=s.slice(a,b);
    const title=first(jsonStringNear(snip,'marketplace_listing_title'),jsonStringNear(snip,'listing_title'),jsonStringNear(snip,'title'))||'';
    const price=(snip.match(/"formatted_amount"\s*:\s*"?\$?([0-9,.]+)"?/)||snip.match(/"amount"\s*:\s*"?([0-9.]+)"?/)||[])[1];
    const image=first(jsonStringNear(snip,'uri'),jsonStringNear(snip,'image_url'))||'';
    const reverseCity=(snip.match(/"reverse_geocode"[\s\S]{0,700}?"city"\s*:\s*"([^"]{2,80})"/)||[])[1]||'';
    const reverseState=(snip.match(/"reverse_geocode"[\s\S]{0,900}?"state"\s*:\s*"([^"]{2,40})"/)||[])[1]||'';
    const location=first(jsonStringNear(snip,'location'),jsonStringNear(snip,'location_name'),reverseCity&&reverseState?`${reverseCity}, ${reverseState}`:reverseCity)||'';
    const lat=Number((snip.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)/)||[])[1]);
    const lon=Number((snip.match(/"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/)||[])[1]);
    const raw={id:hit.id,title,price,image_url:image,location_label:location};
    if(Number.isFinite(lat)&&Number.isFinite(lon)){raw.latitude=lat;raw.longitude=lon}
    out.push(normalizeMarketplaceRow(raw,{...ctx,provider:'facebook_public_ssr'}));
  }
  return out.slice(0,120);
}
