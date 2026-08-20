(function(){
'use strict';
try{
  var c=window.__H38RetailerContext||{};
  var retailer=String(c.retailer||''),address=String(c.store_address||''),storeName=String(c.store_name||''),zip=String(c.zip||''),street=String(c.street||''),city=String(c.city||''),wantTitle=String(c.title||''),wantUpc=String(c.upc||''),wantSku=String(c.sku||'');
  var text=String((document.body&&document.body.innerText)||'').replace(/\s+/g,' ').trim();
  var html=String(document.documentElement&&document.documentElement.innerHTML||'');
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function nums(v){return String(v||'').replace(/\D/g,'');}
  var low=norm(text),htmlDigits=nums(html),storeBound=false,evidence='';
  if(zip&&low.indexOf(zip)>=0){storeBound=true;evidence='ZIP '+zip;}
  else if(street&&city&&low.indexOf(street.toLowerCase())>=0&&low.indexOf(norm(city))>=0){storeBound=true;evidence=street+' / '+city;}
  else if(city){
    var ci=norm(city).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    try{if(new RegExp('(my store|your store|you.re shopping|shopping at|selected store).{0,120}'+ci,'i').test(text)){storeBound=true;evidence='selected '+city;}}catch(x){}
  }
  var productBound=false;
  if(wantUpc.length>=8&&htmlDigits.indexOf(wantUpc)>=0)productBound=true;
  else if(wantSku.length>=5&&htmlDigits.indexOf(wantSku)>=0)productBound=true;
  else{
    var toks=norm(wantTitle).split(' ').filter(function(x){return x.length>=4&&!/^(with|from|tool|pack|piece)$/.test(x);}),hits=0;
    toks.slice(0,8).forEach(function(x){if(low.indexOf(x)>=0)hits++;});
    productBound=hits>=Math.min(3,Math.max(2,Math.ceil(toks.length*.4)));
  }
  function num(v){var m=String(v||'').replace(/,/g,'').match(/(?:\$\s*)?([0-9]{1,6}(?:\.[0-9]{1,2})?)/),n=m?Number(m[1]):0;return n>=.01&&n<100000?n:0;}
  var price=0,els=document.querySelectorAll('meta[itemprop="price"],meta[property="product:price:amount"],[itemprop="price"],[data-testid*="price" i],[class*="price" i]');
  for(var i=0;i<els.length&&i<80&&!price;i++)price=num((els[i].getAttribute&&els[i].getAttribute('content'))||els[i].textContent);
  if(!price){var pm=html.match(/"(?:currentPrice|salePrice|price)"\s*:\s*(?:\{[^}]{0,180}?"(?:value|price)"\s*:\s*)?"?([0-9]+(?:\.[0-9]{1,2})?)/i);if(pm)price=num(pm[1]);}
  var qty=null,qm=text.match(/(?:Quantity Available|Only)\s*:?\s*(\d{1,4})\s*(?:left|remaining)?/i)||text.match(/(\d{1,4})\s+(?:in[- ]stock|in stock)/i);
  if(qm){var qn=Number(qm[1]);if(Number.isInteger(qn)&&qn>=0&&qn<=9999)qty=qn;}
  var stock='unknown';
  if(/out of stock|not available|unavailable|sold out/i.test(text))stock='out_of_stock';
  else if(/in stock|pickup today|available for pickup|ready for pickup|quantity available/i.test(text))stock='in_stock';
  if(qty!==null)stock=qty>0?'in_stock':'out_of_stock';
  var status='device_store_setup_required',label=retailer+' store is not proven on the retailer page. Open Verify on phone and select '+address+' once.',localPrice=null,localQty=null;
  if(productBound&&storeBound){
    localPrice=price||null;localQty=qty;
    status=qty!==null?'exact':(stock!=='unknown'||price>0?'availability_only':'store_resolved_no_quantity');
    label=retailer+' device check · '+(price>0?'$'+price.toFixed(2)+' local page price · ':'price not exposed · ')+(qty!==null?qty+' shown for this store':stock==='in_stock'?'in stock · exact quantity not exposed':stock==='out_of_stock'?'out of stock':'exact quantity not exposed');
  }else if(!productBound){
    status='device_product_not_resolved';
    label=retailer+' device page loaded, but Scout could not prove it was the requested product.';
  }
  AndroidH38RetailerExtractor.result(JSON.stringify({status:status,retailer:retailer,stock_checked:true,stock_status:(productBound&&storeBound)?stock:'unknown',stock_count:localQty,current_price:localPrice,price_checked:localPrice!==null,store_bound:productBound&&storeBound,store_evidence:evidence||null,source_mode:'device_browser',checked_url:location.href,penny_price_detected:retailer==='Home Depot'&&productBound&&storeBound&&localPrice!==null&&Math.abs(localPrice-.01)<.0001,availability_label:label}));
}catch(e){
  AndroidH38RetailerExtractor.result(JSON.stringify({status:'device_unavailable',retailer:String((window.__H38RetailerContext||{}).retailer||''),stock_checked:true,stock_status:'unknown',stock_count:null,current_price:null,store_bound:false,source_mode:'device_browser',availability_label:'Device page parse failed: '+String(e)}));
}
})();
