'use strict';
window.H38_SCOUT_V266_ACTIONABLE_INTAKE=true;
(function installV266ActionableIntake(){
  if(window.H38_SCOUT_V266_ACTIONABLE_INTAKE_INSTALLED)return;
  window.H38_SCOUT_V266_ACTIONABLE_INTAKE_INSTALLED=true;
  state.v266=state.v266||{shared:[]};
  function parseShared(text){
    const raw=txt(text),url=(raw.match(/https?:\/\/[^\s]+/i)||[])[0]||'',price=(raw.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/)||[])[1]||'',lines=raw.split(/\r?\n/).map(txt).filter(Boolean),title=lines.find(x=>!/^https?:/i.test(x)&&!/^\$/.test(x))||'Shared resale listing';
    return{title,price:price?Number(price):null,url,source:/facebook\.com|fb\.com/i.test(raw)?'Facebook Marketplace':'Shared listing',shared_text:raw,location_verified:false,truth:'Shared by you from the source app. Scout does not infer local availability or seller truth from the share alone.',received_at:new Date().toISOString()};
  }
  function openShared(row){
    state.scan.hint=row.title||'';state.scan.buyPrice=row.price==null?'':String(row.price);state.scan.identification={likely_item:row.title||'Shared listing',search_query:row.title||'',confidence:'shared_source'};state.scan.market={marketplace:row.source||'Shared listing',shared_url:row.url||'',shared_text:row.shared_text||''};setPage('scan');renderScan();notice('Shared listing loaded into Scan. Verify price and sold comps before BUY.','good');
  }
  window.H38SharedOpportunity=function(text){
    const row=parseShared(text);state.v266.shared.unshift(row);state.v266.shared=state.v266.shared.slice(0,25);try{localStorage.setItem('h38-v266-shared',JSON.stringify(state.v266.shared))}catch{};openShared(row);
  };
  try{state.v266.shared=JSON.parse(localStorage.getItem('h38-v266-shared')||'[]')}catch{state.v266.shared=[]}
  function decorateFacebook(){
    const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');if(!sec)return;
    const f=state.v240?.facebook,rows=state.v240?.facebookRows||[],dead=rows.length===0&&['PUBLIC_INDEX_EMPTY','PROVIDER_UNAVAILABLE'].includes(txt(f?.provider_status||f?.status));
    if(dead){b.textContent='Retry public Facebook';const p=sec.querySelector('p.small');if(p)p.innerHTML='Automatic public Facebook coverage is currently limited. For a listing you can see in Facebook, use <strong>Share → H38 Reseller Scout</strong>. Scout will load it directly into Scan for price, comps, profit and ROI review.';}
    let box=sec.querySelector('[data-v266-share]');if(!box){box=document.createElement('div');box.dataset.v266Share='true';box.className='truth-note';box.style.marginTop='10px';sec.appendChild(box)}
    const n=state.v266.shared.length;box.innerHTML=`<strong>FACEBOOK SHARE INTAKE</strong><br>Open a Marketplace listing in Facebook → Share → H38 Reseller Scout.${n?`<br>${n} shared listing${n===1?'':'s'} received on this phone.`:''}`;
  }
  const prior=renderDiscover;renderDiscover=function(){prior();decorateFacebook()};
  if(state.user&&state.page==='discover')renderDiscover();
})();
