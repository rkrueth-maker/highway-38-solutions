(()=>{
'use strict';
const catalog=()=>window.NL_SERVICE_CATALOG;
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const card=item=>`<article class="catalog-card" data-service-id="${esc(item.id)}"><img src="${esc(item.image)}?v=nl-catalog-20260805" alt="${esc(item.name)}"><div class="catalog-card__body"><h3>${esc(item.name)}</h3><p>${esc(item.short)}</p><div class="catalog-meta"><span class="catalog-pill">${esc(item.seasonal)}</span><span class="catalog-pill">Estimate required</span></div><div class="catalog-actions">${item.page&&!item.page.startsWith('quote-request')?`<a class="btn secondary" href="${esc(item.page)}">View service</a>`:''}<a class="btn" href="${esc(catalog().requestUrl(item))}">Request estimate</a></div></div></article>`;
function renderCatalog(){
 const target=document.querySelector('[data-service-catalog]');
 if(!target||!catalog())return;
 target.innerHTML=catalog().categories.map(category=>{
  const items=catalog().items.filter(item=>item.category===category&&item.available);
  if(!items.length)return'';
  return `<section class="catalog-category" id="${esc(category.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}"><div class="catalog-category__head"><h2>${esc(category)}</h2><span class="catalog-count">${items.length} services</span></div><div class="catalog-grid">${items.map(card).join('')}</div></section>`;
 }).join('');
}
function renderFeatured(){
 const target=document.querySelector('[data-featured-services]');
 if(!target||!catalog())return;
 const featured=catalog().items.filter(item=>item.featured).slice(0,6);
 target.innerHTML=featured.map(item=>`<article class="featured-service"><img src="${esc(item.image)}?v=nl-catalog-20260805" alt="${esc(item.name)}"><div class="featured-service__body"><h3>${esc(item.name)}</h3><p>${esc(item.short)}</p><a href="${esc(item.page&&!item.page.startsWith('quote-request')?item.page:catalog().requestUrl(item))}">Learn more →</a></div></article>`).join('');
}
function renderDetail(){
 const id=document.body&&document.body.dataset.serviceId;
 const target=document.querySelector('[data-service-detail]');
 if(!id||!target||!catalog())return;
 const item=catalog().byId(id);
 if(!item){target.innerHTML='<div class="notice">This service could not be found.</div>';return;}
 document.title=`${item.name} | Northern Lakes`;
 const hero=document.querySelector('[data-service-hero-image]');
 if(hero){hero.src=item.image+'?v=nl-catalog-20260805';hero.alt=item.name;}
 const title=document.querySelector('[data-service-title]');if(title)title.textContent=item.name;
 const summary=document.querySelector('[data-service-summary]');if(summary)summary.textContent=item.short;
 target.innerHTML=`<div class="service-detail__grid"><article class="service-detail__copy"><div class="eyebrow">Northern Lakes service</div><h2>${esc(item.name)}</h2><p>${esc(item.description)}</p><h3>Available work</h3><ul class="service-detail__list">${item.services.map(service=>`<li>${esc(service)}</li>`).join('')}</ul><p class="service-note"><strong>Scope note:</strong> ${esc(item.disclaimer)}</p></article><aside class="service-detail__aside"><img src="${esc(item.image)}?v=nl-catalog-20260805" alt="${esc(item.name)}"><div class="service-request-card"><span class="portal-label">Owner-reviewed estimate</span><h3>Tell us what the property needs.</h3><p>Availability, scope, quantities, access and any delivery charge are confirmed before scheduling or charges.</p><a class="btn" href="${esc(catalog().requestUrl(item))}">Request an estimate</a></div></aside></div>`;
}
function populateServiceSelect(){
 const select=document.querySelector('[data-catalog-service-select]');
 if(!select||!catalog())return;
 const current=new URLSearchParams(location.search).get('service')||select.value;
 select.innerHTML='<option value="">Choose service</option>'+catalog().categories.map(category=>{
   const items=catalog().items.filter(item=>item.category===category&&item.available);
   return `<optgroup label="${esc(category)}">${items.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</optgroup>`;
 }).join('')+'<option value="other">Other property need</option>';
 if(current&&Array.from(select.options).some(option=>option.value===current))select.value=current;
 const summary=document.querySelector('[data-selected-service-summary]');
 const update=()=>{
   const item=catalog().byId(select.value);
   if(summary){summary.hidden=!item;summary.innerHTML=item?`<strong>${esc(item.name)}</strong><br>${esc(item.short)}<br><span class="no-price">Scope and pricing require owner review.</span>`:'';}
 };
 select.addEventListener('change',update);update();
}
function markIllustrativePhotos(){
 document.querySelectorAll('[data-illustrative-photo]').forEach(node=>node.setAttribute('title','Illustrative catalog photo — not represented as completed Northern Lakes work'));
}
document.addEventListener('DOMContentLoaded',()=>{renderCatalog();renderFeatured();renderDetail();populateServiceSelect();markIllustrativePhotos();});
})();
