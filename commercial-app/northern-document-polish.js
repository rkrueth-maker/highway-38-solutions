(function(){
'use strict';
const BUILD='20260912-northern-document-polish-1';
const BUSINESS={
  name:'Northern Lakes Property Maintenance LLC',
  email:'northernlakesproperty@gmail.com',
  phone:'218-326-2506',
  address:'3131 Horseshoe Lake Rd, Grand Rapids, MN 55744',
  website:'highway38solutions.com/businesses/northern-lakes/'
};
const SAMPLES=[
  ['Invoice','https://drive.google.com/file/d/10saUTGrAj8wu6NFazQPhM2aR1eoerqN6/view'],
  ['Estimate','https://drive.google.com/file/d/1pU-UdMksHOqn6wEXLMDK3yNRN9mBBufx/view'],
  ['Work Order','https://drive.google.com/file/d/1jyHcHrHMqs9j2OGwQ31XEy7ILq7pRwpC/view'],
  ['Purchase Order','https://drive.google.com/file/d/1AtQAcLXG81VtG1dC4QD9_bHUQ9SpR0nM/view'],
  ['Customer Statement','https://drive.google.com/file/d/1B9PTWNJlR6y7mf0K3YA0e4d7XHpa20pD/view'],
  ['Service Completion Report','https://drive.google.com/file/d/1hyZhwoTCQkz28Aur16ClIqN6wn54JrLz/view'],
  ['Letterhead','https://drive.google.com/file/d/1R4Td5sgL_FoOgNNgj4VTQk3jL4pVKNyD/view'],
  ['Business Card','https://drive.google.com/file/d/1_w0YiJfB1Hrmy5F8Uw0yz7AnzZPhDL8w/view']
];
let scheduled=false;
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function key(){
  try{const q=new URLSearchParams(location.search).get('businessKey');if(q)return text(q).toLowerCase();}catch(_){}
  const s=window.state||{},b=s.snapshot?.business||{};
  return text(s.businessKey||b.businessKey||b['Business Key']).toLowerCase();
}
function northern(){return key()==='northern-lakes';}
function sampleLinks(){
  return SAMPLES.map(([label,file])=>`<a class="secondary" target="_blank" rel="noopener" href="${esc(file)}">${esc(label)} PDF</a>`).join('');
}
function addSampleCard(){
  if(!northern())return;
  const page=text(window.state?.page).toLowerCase();
  if(!['money','quotes','documents','files','accounting'].includes(page))return;
  const main=document.getElementById('mainContent');if(!main||main.querySelector('[data-nl-document-samples]'))return;
  const card=document.createElement('section');
  card.className='card h38-reference-sample';
  card.dataset.nlDocumentSamples='1';
  card.innerHTML=`<div class="row-top"><div><strong>Professional Northern Lakes document samples</strong><small>Click any sample to open the actual branded PDF.</small></div><span class="pill">PDF</span></div><div class="actions" style="margin-top:12px;flex-wrap:wrap">${sampleLinks()}</div><p class="muted small" style="margin-top:10px">Northern Lakes logo only. Contact details and professional letterhead are included. A small “Business systems powered by Highway 38 Solutions” credit appears at the bottom.</p>`;
  main.appendChild(card);
}
function decorateReferenceCard(){
  if(!northern())return;
  const card=document.querySelector('#mainContent .h38-reference-sample[data-h38-reference-sample]');
  if(!card||card.querySelector('[data-nl-sample-pdf-links]'))return;
  const wrap=document.createElement('div');
  wrap.dataset.nlSamplePdfLinks='1';
  wrap.className='actions';
  wrap.style.cssText='margin-top:12px;flex-wrap:wrap';
  const page=text(window.state?.page).toLowerCase();
  const preferred=page==='money'?['Invoice','Customer Statement','Purchase Order']:page==='quotes'?['Estimate']:page==='work'?['Work Order','Service Completion Report']:['Invoice','Estimate','Work Order','Service Completion Report'];
  wrap.innerHTML=SAMPLES.filter(([label])=>preferred.includes(label)).map(([label,file])=>`<a class="secondary" target="_blank" rel="noopener" href="${esc(file)}">Open ${esc(label)} PDF</a>`).join('');
  if(wrap.innerHTML)card.appendChild(wrap);
}
function decoratePrintRoot(root){
  if(!northern()||!root||root.dataset.nlBranded==='1')return;
  root.dataset.nlBranded='1';
  const head=root.querySelector('.h38-office-stationery-head');
  if(head&&!head.querySelector('[data-nl-contact]')){
    const contact=document.createElement('div');
    contact.dataset.nlContact='1';
    contact.className='nl-doc-contact';
    contact.innerHTML=`<span>${esc(BUSINESS.address)}</span><span>${esc(BUSINESS.phone)} · ${esc(BUSINESS.email)}</span><span>${esc(BUSINESS.website)}</span>`;
    head.appendChild(contact);
  }
  const footer=root.querySelector('.h38-office-stationery footer');
  if(footer){
    footer.innerHTML=`<span>${esc(BUSINESS.name)}</span><span>Business systems powered by Highway 38 Solutions</span>`;
  }
}
const observer=new MutationObserver(mutations=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node instanceof Element){
        if(node.id==='h38SafePrintRoot')decoratePrintRoot(node);
        const nested=node.querySelector?.('#h38SafePrintRoot');if(nested)decoratePrintRoot(nested);
      }
    }
  }
});
function enhance(){
  if(!northern())return;
  addSampleCard();
  decorateReferenceCard();
  decoratePrintRoot(document.getElementById('h38SafePrintRoot'));
}
function schedule(){
  if(scheduled)return;scheduled=true;
  const run=()=>{scheduled=false;enhance();};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
}
if(document.body)observer.observe(document.body,{childList:true,subtree:true});
else document.addEventListener('DOMContentLoaded',()=>observer.observe(document.body,{childList:true,subtree:true}),{once:true});
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.H38_NORTHERN_DOCUMENT_POLISH=Object.freeze({
  enabled:true,build:BUILD,approvedLogoOnly:true,business:BUSINESS,samples:SAMPLES.slice(),
  highway38CreditTextOnly:true,externalActionsEnabled:false,automaticSending:false,enhance
});
})();