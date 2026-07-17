(function(){
  'use strict';
  const host=document.querySelector('[data-proof-library]');
  const source=window.H38_PUBLIC_PROOF||{items:[]};
  if(!host)return;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const list=items=>(items||[]).length?`<ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'';
  if(!source.items.length){host.innerHTML='<article class="eco-card"><h3>Proof examples are being updated</h3><p>Please use the sample library while this section is refreshed.</p></article>';return;}
  host.innerHTML=source.items.map(item=>`<article class="eco-card eco-proof-case"><h3>${esc(item.title)}</h3><p><b>${esc(item.domain)}</b></p><p>${esc(item.summary)}</p><p><b>Result:</b> ${esc(item.outcome)}</p><details class="eco-proof-details"><summary>View project details</summary><div class="eco-proof-details__body"><h4>The problem</h4><p>${esc(item.problem)}</p><h4>Work performed</h4>${list(item.workPerformed)}<h4>Decisions made</h4>${list(item.decisions)}<h4>Implementation</h4><p>${esc(item.implementation)}</p><p><b>Boundary:</b> ${esc(item.boundary)}</p></div></details></article>`).join('');
  window.h38AnalyticsQueue=window.h38AnalyticsQueue||[];
  window.h38AnalyticsQueue.push({event:'proof_registry_view',release:source.release,items:source.items.length,timestamp:new Date().toISOString()});
})();