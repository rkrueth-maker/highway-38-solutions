(function(){
  'use strict';

  function money(value){
    return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  }

  function addBundleValue(){
    var catalog=window.H38_CATALOG;
    if(!catalog||!Array.isArray(catalog.bundles)||!Array.isArray(catalog.products))return;
    var prices={};
    catalog.products.forEach(function(product){prices[product.id]=Number(product.price)||0;});
    catalog.bundles.forEach(function(bundle){
      var card=document.getElementById(bundle.slug);
      if(!card||card.querySelector('.bundle-value'))return;
      var standalone=(bundle.products||[]).reduce(function(total,id){return total+(prices[id]||0);},0);
      var savings=Math.max(0,standalone-(Number(bundle.price)||0));
      var value=document.createElement('p');
      value.className='bundle-value';
      value.innerHTML=savings>0
        ? '<strong>Standalone service value:</strong> '+money(standalone)+' · <strong>Bundle savings:</strong> '+money(savings)
        : '<strong>Bundle value:</strong> coordinated scope and one controlled handoff; no separate savings claim.';
      var price=card.querySelector('.price');
      if(price&&price.parentNode)price.insertAdjacentElement('afterend',value);
      else card.insertBefore(value,card.firstChild);
    });
  }

  function addSampleFilters(){
    var catalog=window.H38_CATALOG;
    var host=document.querySelector('[data-samples="all"]');
    if(!catalog||!host||document.querySelector('[data-sample-filters]'))return;
    var products=Array.isArray(catalog.products)?catalog.products:[];
    var bySlug={};
    products.forEach(function(product){bySlug[product.slug]=product;});
    Array.prototype.forEach.call(host.querySelectorAll('.sample-card'),function(card){
      var product=bySlug[String(card.id||'').replace(/^sample-/,'')];
      if(product){card.dataset.family=product.family;card.dataset.productId=product.id;}
    });
    var filters=[
      ['all','All examples'],
      ['plans','Plans'],
      ['home-shop','Home & Shop'],
      ['business','Business Workflows'],
      ['implementation','Implementation'],
      ['manufacturing','Manufacturing']
    ];
    var bar=document.createElement('div');
    bar.className='sample-filter-bar button-row';
    bar.dataset.sampleFilters='true';
    bar.setAttribute('aria-label','Filter sample demonstrations');
    filters.forEach(function(item,index){
      var button=document.createElement('button');
      button.type='button';
      button.className=index===0?'btn btn-dark':'btn btn-light';
      button.dataset.sampleFilter=item[0];
      button.textContent=item[1];
      button.setAttribute('aria-pressed',index===0?'true':'false');
      bar.appendChild(button);
    });
    host.parentNode.insertBefore(bar,host);
    function matches(card,filter){
      var id=card.dataset.productId||'';
      var family=card.dataset.family||'';
      if(filter==='all')return true;
      if(filter==='plans')return family==='plans';
      if(filter==='implementation')return family==='implementation';
      if(filter==='manufacturing')return family==='manufacturing';
      if(filter==='home-shop')return /^H38-P00[1-4]$/.test(id);
      if(filter==='business')return /^H38-P00[5-9]$/.test(id);
      return true;
    }
    bar.addEventListener('click',function(event){
      var button=event.target.closest('[data-sample-filter]');
      if(!button)return;
      var filter=button.dataset.sampleFilter;
      Array.prototype.forEach.call(bar.querySelectorAll('[data-sample-filter]'),function(other){
        var active=other===button;
        other.setAttribute('aria-pressed',active?'true':'false');
        other.classList.toggle('btn-dark',active);
        other.classList.toggle('btn-light',!active);
      });
      Array.prototype.forEach.call(host.querySelectorAll('.sample-card'),function(card){card.hidden=!matches(card,filter);});
    });
  }

  function run(){addBundleValue();addSampleFilters();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);
  else run();
})();
