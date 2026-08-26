export function dec(v=''){return String(v??'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/&nbsp;|&#160;/gi,' ').replace(/&ndash;/gi,'–').replace(/&mdash;/gi,'—')}
export function strip(v=''){return dec(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
export function abs(v,b){try{return new URL(dec(v),b).toString()}catch{return''}}
export function money(v){const m=String(v??'').replace(/,/g,'').match(/(?:USD\s*)?\$?\s*([0-9]{1,9}(?:\.\d{1,2})?)/i);return m?Number(m[1]):null}
export function tokens(q=''){return String(q).toLowerCase().replace(/[^a-z0-9+#.-]+/g,' ').split(/\s+/).filter(x=>x.length>1)}
export function matches(s,q=''){const t=tokens(q);if(!t.length)return true;const x=String(s||'').toLowerCase();return t.every(w=>x.includes(w))||t.some(w=>w.length>=4&&x.includes(w))}
export function address(text=''){const x=strip(text);return x.match(/\b\d{1,6}\s+[A-Za-z0-9.'#& -]{3,90},\s*[A-Za-z.' -]{2,55},?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/)?.[0]?.trim()||x.match(/\b[A-Za-z.' -]{2,55},\s*[A-Z]{2}\s+\d{5}\b/)?.[0]?.trim()||''}
export function zipOf(v=''){return String(v).match(/\b\d{5}\b/)?.[0]||''}
export function buyerPremium(v=''){const x=strip(v),m=x.match(/buyer'?s?\s+(?:premium|fee)\s*(?:of|is|:|-)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i)||x.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s+(?:internet\s+)?buyer'?s?\s+premium/i);return m?Number(m[1]):null}
export function shippingMode(v=''){const x=strip(v);if(/\bno shipping\b|local pick-?up only/i.test(x))return'Local pickup only';if(/shipping (?:is )?available|shipping available on/i.test(x))return'Shipping available';if(/local pick-?up preferred/i.test(x))return'Local pickup preferred';return'Pickup / shipping not established'}
export function pickupVerified(v=''){return /^(?:Local pickup only|Local pickup preferred)$/i.test(String(v||''))}
export function imageFrom(html='',base=''){const bad=/(?:logo|icon|avatar|spinner|placeholder|pixel|favicon|tracking|blank|loading)/i;for(const m of String(html).matchAll(/<img\b[^>]*(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["'][^>]*>/gi)){const u=abs(m[1]||'',base);if(u&&!bad.test(u))return u}for(const m of String(html).matchAll(/(?:og:image|twitter:image)[^>]*content=["']([^"']+)["']/gi)){const u=abs(m[1]||'',base);if(u&&!bad.test(u))return u}return''}
function cleanTitle(v=''){return strip(v).replace(/\s+/g,' ').replace(/^(?:View|Open|Details|Catalog)\s+/i,'').trim().slice(0,240)}
function relevantTitle(v=''){const x=cleanTitle(v);return x.length>=4&&!/^(?:register|login|dashboard|account|contact|categories|details|view|open)$/i.test(x)}
export function parseKbidEvents(html='',base='https://www.k-bid.com/auction/list'){
  const map=new Map();const src=String(html);
  for(const m of src.matchAll(/<a\b[^>]*href=["']([^"']*\/auction\/(\d+)(?:[?][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const url=abs(m[1]||'',base),id=String(m[2]||'');if(!url||!id)continue;
    const at=m.index||0,chunk=src.slice(Math.max(0,at-1800),Math.min(src.length,at+6500)),plain=strip(chunk),candidate=cleanTitle(m[3]||'');
    const old=map.get(id)||{source:'K-BID',kind:'event',title:'',source_url:url,image_url:'',location_label:'',date_label:'',item_count:null,buyer_premium:null,pickup_mode:'Pickup / shipping not established',pickup_verified:false,resale_relevant:true};
    if(relevantTitle(candidate)&&candidate.length>String(old.title||'').length)old.title=candidate;
    const h=[...chunk.matchAll(/<h[1-5]\b[^>]*>([\s\S]{3,500}?)<\/h[1-5]>/gi)].map(x=>cleanTitle(x[1])).filter(relevantTitle).sort((a,b)=>b.length-a.length)[0]||'';
    if(h.length>String(old.title||'').length)old.title=h;
    old.location_label=old.location_label||address(plain);old.image_url=old.image_url||imageFrom(chunk,base);
    const cnt=plain.match(/\|\s*([0-9,]+)\s+Items?\b/i)?.[1];if(cnt)old.item_count=Number(cnt.replace(/,/g,''))||null;
    const date=plain.match(/Begins Closing\s+(.{3,90}?)(?=\s+(?:Active|Impending Close|Closing|Closed|Household|Commercial|Sporting|Farm|Technology|Vehicles|Coins|Jewelry|Real Estate))/i)?.[1];if(date)old.date_label=date.trim();
    map.set(id,old);
  }
  return[...map.values()].map(x=>({...x,title:x.title||`K-BID auction ${x.source_url.match(/\/auction\/(\d+)/)?.[1]||''}`}));
}
export function parseKbidLots(html='',base,event={},q=''){
  const src=String(html),plain=strip(src),premium=buyerPremium(plain)??event.buyer_premium??null,mode=shippingMode(plain),out=[],seen=new Set();
  const re=/<h[2-6]\b[^>]*>([\s\S]{3,600}?)<\/h[2-6]>[\s\S]{0,1800}?Lot:\s*([A-Za-z0-9-]+)[\s\S]{0,1800}?Current Bid:\s*(?:USD\s*)?\$?\s*([0-9,.]+)/gi;
  for(const m of src.matchAll(re)){
    const title=cleanTitle(m[1]||''),lot=String(m[2]||'').trim();if(!relevantTitle(title)||!matches(title,q)||seen.has(lot))continue;seen.add(lot);
    const at=m.index||0,chunk=src.slice(Math.max(0,at-900),Math.min(src.length,at+2600)),bid=money(m[3]);
    out.push({source:'K-BID',kind:'lot',title,source_url:`${String(event.source_url||base).split('?')[0]}?search=submit#lot-${encodeURIComponent(lot)}`,image_url:imageFrom(chunk,base),current_bid:bid,bid_count:null,buyer_premium:premium,auction_title:event.title||'',location_label:event.location_label||'',distance_miles:event.distance_miles??null,location_verified:event.location_verified===true,pickup_mode:mode,pickup_verified:pickupVerified(mode),date_label:event.date_label||'',lot_number:lot,profit_verified:false,resale_relevant:true});
  }
  return out.slice(0,120);
}
export function parseGovDeals(html='',base='https://prod-seo.govdeals.com/en/minnesota',q=''){
  const plain=strip(html),out=[],seen=new Set(),re=/Online Auction\s+(.{3,220}?)\s+([A-Za-z0-9 .,'#&/()-]+,\s*Minnesota,\s*USA)\s+USD\s*\$?\s*([0-9,.]+)[\s\S]{0,180}?Lot#:\s*([0-9-]+)/gi;
  for(const m of plain.matchAll(re)){
    const title=cleanTitle(m[1]||''),lot=String(m[4]||'');if(!relevantTitle(title)||!matches(title,q)||seen.has(lot))continue;seen.add(lot);
    out.push({source:'GovDeals',kind:'lot',title,source_url:`${base}#lot-${encodeURIComponent(lot)}`,image_url:'',current_bid:money(m[3]),bid_count:null,buyer_premium:null,location_label:String(m[2]||'').trim(),distance_miles:null,location_verified:false,pickup_mode:'Pickup terms on source',pickup_verified:false,date_label:'',lot_number:lot,profit_verified:false,resale_relevant:true});
  }
  return out.slice(0,120);
}
export function parseProxibid(html='',base='https://www.proxibid.com/for-sale/',q=''){
  const src=String(html),out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"']*\/lotinformation\/(\d+)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of src.matchAll(re)){
    const url=abs(m[1]||'',base),id=String(m[2]||''),title=cleanTitle(m[3]||'');if(!url||!id||!relevantTitle(title)||!matches(title,q)||seen.has(id))continue;seen.add(id);
    const at=m.index||0,chunk=src.slice(Math.max(0,at-1400),Math.min(src.length,at+4200)),p=strip(chunk),loc=p.match(/This item is in\s+([^|]{3,90}?)(?=\s+(?:Overview|Item Details|Payment|USD|Current Bid|$))/i)?.[1]?.trim()||address(p),bid=money(p.match(/(?:CURRENT BID|Current Bid)\s*(?:USD)?\s*\$?\s*([0-9,.]+)/i)?.[1]);
    const mode=shippingMode(p);out.push({source:'Proxibid',kind:'lot',title,source_url:url,image_url:imageFrom(chunk,base),current_bid:bid,bid_count:null,buyer_premium:buyerPremium(p),location_label:loc,distance_miles:null,location_verified:false,pickup_mode:mode,pickup_verified:pickupVerified(mode),date_label:'',lot_number:id,profit_verified:false,resale_relevant:true});
  }
  return out.slice(0,100);
}
export function parseAuctionTime(html='',base='https://www.auctiontime.com/',q=''){
  const src=String(html),out=[],seen=new Set(),re=/<a\b[^>]*href=["']([^"']*\/listing\/(?:upcoming-auctions|auction-results)\/([0-9]+)\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of src.matchAll(re)){
    const url=abs(m[1]||'',base),id=String(m[2]||''),raw=cleanTitle(m[3]||'');if(!url||!id||seen.has(id))continue;const at=m.index||0,chunk=src.slice(Math.max(0,at-1500),Math.min(src.length,at+5200)),p=strip(chunk),title=relevantTitle(raw)?raw:cleanTitle(p.match(/(?:New|Used)?\s*([A-Za-z0-9][^|]{4,160}?)\s+(?:Current Bid|Photos\()/i)?.[1]||'');if(!relevantTitle(title)||!matches(title,q))continue;seen.add(id);
    const loc=p.match(/Item Location:\s*([^|]{5,140}?\b[A-Z]{2}\s+\d{5}\b)/i)?.[1]?.trim()||address(p),bid=money(p.match(/Current Bid:\s*(?:USD)?\s*\$?\s*([0-9,.]+)/i)?.[1]);
    out.push({source:'AuctionTime',kind:'lot',title,source_url:url,image_url:imageFrom(chunk,base),current_bid:bid,bid_count:null,buyer_premium:null,location_label:loc,distance_miles:null,location_verified:false,pickup_mode:'Pickup / shipping terms on source',pickup_verified:false,date_label:p.match(/Sale Ends:\s*([^|]{3,100})/i)?.[1]?.trim()||'',lot_number:id,profit_verified:false,resale_relevant:true});
  }
  return out.slice(0,100);
}
