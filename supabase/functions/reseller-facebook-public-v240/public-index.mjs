const txt=v=>String(v??'').trim();

const STATE_TO_CODE={alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY','district of columbia':'DC'};
const CODE_TO_STATE=Object.fromEntries(Object.entries(STATE_TO_CODE).map(([k,v])=>[v,k.replace(/\b\w/g,c=>c.toUpperCase())]));

export function decodeEntities(value=''){
  return String(value).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
}
export function stripTags(value=''){return decodeEntities(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()}
function rssText(value=''){const raw=String(value),m=raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i);return stripTags(m?m[1]:raw)}
function stateCode(v=''){const s=txt(v);if(/^[A-Za-z]{2}$/.test(s))return s.toUpperCase();return STATE_TO_CODE[s.toLowerCase()]||''}
export function locationVariants(label=''){
  const raw=txt(label).replace(/^ZIP\s+/i,'').replace(/\b\d{5}(?:-\d{4})?\b/g,'').replace(/,+\s*$/,'').trim();
  const parts=raw.split(',').map(x=>x.trim()).filter(Boolean);
  const city=parts[0]||raw;
  const region=parts[1]||'';
  const code=stateCode(region);
  const full=CODE_TO_STATE[code]||region;
  const out=[];
  if(city&&code)out.push(`${city}, ${code}`);
  if(city&&full)out.push(`${city}, ${full}`);
  if(city&&code)out.push(`${city} ${code}`);
  if(city&&full)out.push(`${city} ${full}`);
  if(city)out.push(city);
  return [...new Set(out.filter(Boolean))];
}

function safeDecode(v){let x=decodeEntities(txt(v));for(let i=0;i<2;i++){try{const d=decodeURIComponent(x);if(d===x)break;x=d}catch{break}}return x}
function unwrapRedirect(href=''){
  let h=safeDecode(href);
  if(!h)return'';
  if(h.startsWith('//'))h='https:'+h;
  try{
    const u=new URL(h,/^https?:/i.test(h)?undefined:'https://search.local');
    for(const key of ['q','url','u','uddg','target']){
      const v=u.searchParams.get(key);
      if(v&&/facebook\.(?:com|co\.[a-z]{2}|[a-z]{2})/i.test(v))return safeDecode(v);
    }
  }catch{}
  return h;
}
export function marketplaceTarget(value=''){
  const unwrapped=unwrapRedirect(value);
  const match=unwrapped.match(/https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/marketplace\/item\/(\d{6,})/i)
    || unwrapped.match(/https?:\/\/(?:[a-z0-9-]+\.)*facebook\.[a-z.]+\/marketplace\/item\/(\d{6,})/i);
  return match?{id:match[1],url:`https://www.facebook.com/marketplace/item/${match[1]}/`}:null;
}
function titleNear(html,start,end){
  const segment=html.slice(Math.max(0,start-1200),Math.min(html.length,end+1800));
  const h=(segment.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)||[])[1];
  if(h)return stripTags(h).slice(0,240);
  const t=(segment.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1];
  return t?stripTags(t).slice(0,240):'';
}
function snippetNear(html,start,end){return stripTags(html.slice(Math.max(0,start-1800),Math.min(html.length,end+4200))).slice(0,1800)}

export function parseSearchHtml(html='',limit=30){
  const s=String(html),out=[],seen=new Set();
  const hrefRe=/href\s*=\s*["']([^"']+)["']/gi;let m;
  while((m=hrefRe.exec(s))&&out.length<limit){
    const target=marketplaceTarget(m[1]);if(!target||seen.has(target.id))continue;
    seen.add(target.id);out.push({...target,title:titleNear(s,m.index,hrefRe.lastIndex),snippet:snippetNear(s,m.index,hrefRe.lastIndex)});
  }
  if(out.length<limit){
    const rawRe=/https?:\\?\/\\?\/(?:[a-z0-9-]+\\?\.)*facebook\\?\.com\\?\/marketplace\\?\/item\\?\/(\d{6,})/gi;
    while((m=rawRe.exec(s))&&out.length<limit){
      const id=m[1];if(seen.has(id))continue;seen.add(id);out.push({id,url:`https://www.facebook.com/marketplace/item/${id}/`,title:titleNear(s,m.index,rawRe.lastIndex),snippet:snippetNear(s,m.index,rawRe.lastIndex)});
    }
  }
  return out;
}
export function parseBingRss(xml='',limit=30){
  const s=String(xml),out=[],seen=new Set(),re=/<item>([\s\S]*?)<\/item>/gi;let m;
  while((m=re.exec(s))&&out.length<limit){
    const item=m[1],link=rssText((item.match(/<link>([\s\S]*?)<\/link>/i)||[])[1]||''),target=marketplaceTarget(link);
    if(!target||seen.has(target.id))continue;seen.add(target.id);
    const title=rssText((item.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'');
    const snippet=rssText((item.match(/<description>([\s\S]*?)<\/description>/i)||[])[1]||'');
    out.push({...target,title,snippet});
  }
  return out;
}
export function listingFromSearch(r={}){
  const snippet=txt(r.snippet),title=txt(r.title).replace(/\s*[-|·]\s*Facebook Marketplace.*$/i,'').trim();
  const price=(snippet.match(/(?:US\s*)?\$\s*[\d,.]+(?:\.\d{2})?|\bFREE\b/i)||[])[0]||'';
  let location='';
  const patterns=[
    /\b(?:listed|available|located|pickup|pick up)\b[\s\S]{0,80}?\bin\s+([A-Z][A-Za-z .'-]{1,70},\s*(?:[A-Z]{2}|[A-Za-z ]{4,30}))(?=[.·|;]|$)/i,
    /\bin\s+([A-Z][A-Za-z .'-]{1,70},\s*(?:[A-Z]{2}|[A-Za-z ]{4,30}))(?=[.·|;]|$)/,
    /\b([A-Z][A-Za-z .'-]{1,70},\s*[A-Z]{2})\b/,
    /\b([A-Z][A-Za-z .'-]{1,70},\s*(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming))\b/i
  ];
  for(const p of patterns){const x=snippet.match(p);if(x?.[1]){location=x[1].trim();break}}
  const listed=(snippet.match(/Listed\s+(?:\d+\s+\w+\s+ago|on\s+[^.·|;]+|over\s+a\s+week\s+ago|about\s+[^.·|;]+)/i)||[])[0]||'';
  return{id:r.id,url:r.url,title:title||'Marketplace listing',description:snippet,price_label:price,location_label:location,listed_at_label:listed};
}
export function buildIndexQueries(term,label){
  const vars=locationVariants(label),city=vars.at(-1)||'',exact=vars.find(x=>/, [A-Z]{2}$/.test(x))||vars[0]||'';
  const full=vars.find(x=>/, [A-Za-z ]{4,}$/.test(x))||exact;
  return [...new Set([
    `site:facebook.com/marketplace/item "${exact}" ${term}`,
    `site:facebook.com/marketplace/item "${city}" "${full.split(',').slice(1).join(',').trim()}" ${term}`,
    `site:facebook.com/marketplace/item ${city} ${term}`
  ].map(x=>x.replace(/""\s*/g,'').replace(/\s+/g,' ').trim()))];
}
