(function(){
'use strict';
try{
  var c=window.__H38RetailerContext||{};
  var retailer=String(c.retailer||''),address=String(c.store_address||''),storeName=String(c.store_name||''),storeId=String(c.store_id||''),zip=String(c.zip||''),street=String(c.street||''),city=String(c.city||''),wantTitle=String(c.title||''),wantUpc=String(c.upc||''),wantSku=String(c.sku||'');
  var text=String((document.body&&document.body.innerText)||'').replace(/\s+/g,' ').trim();
  var html=String(document.documentElement&&document.documentElement.innerHTML||'');
  var href=String(location.href||'');
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function nums(v){return String(v||'').replace(/\D/g,'');}
  function money(v){var m=String(v||'').replace(/,/g,'').match(/(?:\$\s*)?([0-9]{1,6}(?:\.[0-9]{1,2})?)/),n=m?Number(m[1]):0;return n>=.01&&n<100000?n:0;}
  var low=norm(text),htmlDigits=nums(html),storeBound=false,evidence='';
  if(storeId){
    var q='';try{q=new URL(href).searchParams.get('storeSelection')||new URL(href).searchParams.get('storeId')||''}catch(_){}
    if(q&&String(q).split(',').indexOf(storeId)>=0){storeBound=true;evidence='store id '+storeId+' in retailer URL';}
    else if(new RegExp('(?:store|location|storeId|storeNumber)[^0-9]{0,18}'+storeId+'\\b','i').test(html)){storeBound=true;evidence='store id '+storeId+' in retailer page';}
  }
  if(!storeBound&&zip&&low.indexOf(zip)>=0){storeBound=true;evidence='ZIP '+zip;}
  else if(!storeBound&&street&&city&&low.indexOf(street.toLowerCase())>=0&&low.indexOf(norm(city))>=0){storeBound=true;evidence=street+' / '+city;}
  else if(!storeBound&&city){
    var ci=norm(city).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    try{if(new RegExp('(my store|your store|you.re shopping|shopping at|selected store|pickup at|in store at).{0,140}'+ci,'i').test(text)){storeBound=true;evidence='selected '+city;}}catch(x){}
  }
  var productBound=false;
  if(wantUpc.length>=8&&htmlDigits.indexOf(wantUpc)>=0)productBound=true;
  else if(wantSku.length>=5&&htmlDigits.indexOf(wantSku)>=0)productBound=true;
  else{
    var toks=norm(wantTitle).split(' ').filter(function(x){return x.length>=4&&!/^(with|from|tool|pack|piece)$/.test(x);}),hits=0;
    toks.slice(0,8).forEach(function(x){if(low.indexOf(x)>=0)hits++;});
    productBound=hits>=Math.min(3,Math.max(2,Math.ceil(toks.length*.4)));
  }
  var current=0,regular=0;
  var meta=document.querySelectorAll('meta[itemprop="price"],meta[property="product:price:amount"],[itemprop="price"],[data-testid*="price" i],[class*="price" i]');
  for(var i=0;i<meta.length&&i<100;i++){
    var raw=(meta[i].getAttribute&&meta[i].getAttribute('content'))||meta[i].textContent||'';
    var n=money(raw);if(!n)continue;
    var cls=String((meta[i].className||'')+' '+(meta[i].getAttribute&&meta[i].getAttribute('data-testid')||'')).toLowerCase();
    if(/was|regular|original|list|strike|compare/.test(cls)){if(!regular||n>regular)regular=n;}
    else if(!current||n<current)current=n;
  }
  if(!current){var pm=html.match(/"(?:currentPrice|salePrice|effectivePrice|price)"\s*:\s*(?:\{[^}]{0,220}?"(?:value|price)"\s*:\s*)?"?([0-9]+(?:\.[0-9]{1,2})?)/i);if(pm)current=money(pm[1]);}
  if(!regular){var rm=html.match(/"(?:originalPrice|regularPrice|listPrice|wasPrice|comparisonPrice)"\s*:\s*(?:\{[^}]{0,220}?"(?:value|price)"\s*:\s*)?"?([0-9]+(?:\.[0-9]{1,2})?)/i);if(rm)regular=money(rm[1]);}
  if(regular&&current&&regular<current){var swap=regular;regular=current;current=swap;}
  var ratio=regular&&current?current/regular:null;
  var qty=null,qm=text.match(/(?:Quantity Available|Only)\s*:?\s*(\d{1,4})\s*(?:left|remaining)?/i)||text.match(/(\d{1,4})\s+(?:in[- ]stock|in stock)/i);
  if(qm){var qn=Number(qm[1]);if(Number.isInteger(qn)&&qn>=0&&qn<=9999)qty=qn;}
  var stock='unknown';
  if(/out of stock|not available|unavailable|sold out/i.test(text))stock='out_of_stock';
  else if(/in stock|pickup today|available for pickup|ready for pickup|quantity available/i.test(text))stock='in_stock';
  if(qty!==null)stock=qty>0?'in_stock':'out_of_stock';
  var img='';try{var im=document.querySelector('meta[property="og:image"],img[data-testid*="product" i],main img');img=String((im&&((im.getAttribute&&im.getAttribute('content'))||im.currentSrc||im.src))||'')}catch(_){}
  var status='device_store_setup_required',label=retailer+' store is not proven on the retailer page. Open Verify on phone and select '+address+' once.',localPrice=null,localQty=null;
  if(productBound&&storeBound){
    localPrice=current||null;localQty=qty;
    status=qty!==null?'exact':(stock!=='unknown'||current>0?'availability_only':'store_resolved_no_quantity');
    label=retailer+' device check · '+(current>0?'$'+current.toFixed(2)+' local page price · ':'price not exposed · ')+(qty!==null?qty+' shown for this store':stock==='in_stock'?'in stock · exact quantity not exposed':stock==='out_of_stock'?'out of stock':'exact quantity not exposed');
  }else if(!productBound){
    status='device_product_not_resolved';
    label=retailer+' device page loaded, but Scout could not prove it was the requested product.';
  }
  AndroidH38RetailerExtractor.result(JSON.stringify({
    status:status,retailer:retailer,stock_checked:true,stock_status:(productBound&&storeBound)?stock:'unknown',stock_count:localQty,
    current_price:localPrice,regular_price:(productBound&&storeBound&&regular)?regular:null,markdown_ratio:(productBound&&storeBound)?ratio:null,
    price_checked:localPrice!==null,store_bound:productBound&&storeBound,store_evidence:evidence||null,store_id:storeId||null,
    source_mode:'device_browser_v250',session_persisted:true,checked_url:location.href,image_url:img||null,
    penny_price_detected:retailer==='Home Depot'&&productBound&&storeBound&&localPrice!==null&&Math.abs(localPrice-.01)<.0001,
    availability_label:label
  }));
}catch(e){
  AndroidH38RetailerExtractor.result(JSON.stringify({status:'device_unavailable',retailer:String((window.__H38RetailerContext||{}).retailer||''),stock_checked:true,stock_status:'unknown',stock_count:null,current_price:null,regular_price:null,store_bound:false,source_mode:'device_browser_v250',session_persisted:true,availability_label:'Device page parse failed: '+String(e)}));
}
})();
