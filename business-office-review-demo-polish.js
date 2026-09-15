(function(){
'use strict';
const MOBILE='(max-width: 760px)';
const PRIMARY=['today','customers','schedule','messages'];
const GROUPS=[
  ['Work & Sales',['work','quotes','field']],
  ['Money',['money']],
  ['Records & Equipment',['documents','inventory','fleet']],
  ['Office',['social','ai','settings']]
];
let busy=false;
const mobile=()=>!!window.matchMedia?.(MOBILE).matches;
const nav=()=>document.getElementById('mainNav');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function annotateTables(){
  document.querySelectorAll('.demo-table').forEach(table=>{
    const labels=[...table.querySelectorAll('thead th')].map(th=>(th.textContent||'').trim());
    table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,index)=>cell.dataset.label=labels[index]||''));
    table.dataset.h38MobileCards='1';
  });
}
function dialog(){
  let node=document.getElementById('h38DemoMoreDialog');
  if(node)return node;
  node=document.createElement('dialog');node.id='h38DemoMoreDialog';node.className='h38-demo-more-dialog';
  node.addEventListener('click',event=>{if(event.target===node)node.close();});
  document.body.appendChild(node);return node;
}
function openMore(){
  const n=nav();if(!n)return;
  const available=new Map([...n.querySelectorAll('button[data-page]')].map(button=>[button.dataset.page,{icon:button.querySelector('.nav-icon')?.textContent||'•',label:button.querySelector('span:last-child')?.textContent||button.dataset.page}]));
  const groups=GROUPS.map(([title,keys])=>[title,keys.filter(key=>available.has(key))]).filter(([,keys])=>keys.length);
  const d=dialog();
  d.innerHTML=`<div class="h38-demo-more-shell"><div class="h38-demo-more-head"><div><strong>More</strong><small>Sample Office tools grouped by what you are trying to do.</small></div><button type="button" data-close aria-label="Close">×</button></div><div class="h38-demo-more-groups">${groups.map(([title,keys])=>`<section class="h38-demo-more-group"><h3>${esc(title)}</h3><div class="h38-demo-more-grid">${keys.map(key=>{const item=available.get(key);return`<button type="button" data-demo-more-page="${esc(key)}"><span class="nav-icon">${esc(item.icon)}</span><strong>${esc(item.label)}</strong></button>`;}).join('')}</div></section>`).join('')}</div></div>`;
  d.querySelector('[data-close]')?.addEventListener('click',()=>d.close());
  d.querySelectorAll('[data-demo-more-page]').forEach(button=>button.addEventListener('click',()=>{const target=n.querySelector(`button[data-page="${CSS.escape(button.dataset.demoMorePage)}"]`);d.close();target?.click();}));
  if(typeof d.showModal==='function'){if(!d.open)d.showModal();}else d.setAttribute('open','');
}
function polishNav(){
  if(busy)return;busy=true;
  try{
    const n=nav();if(!n)return;
    if(!mobile()){
      document.getElementById('h38DemoMoreButton')?.remove();
      document.getElementById('h38DemoMoreDialog')?.remove();
      return;
    }
    let more=document.getElementById('h38DemoMoreButton');
    if(!more){
      more=document.createElement('button');more.id='h38DemoMoreButton';more.type='button';more.setAttribute('aria-haspopup','dialog');more.setAttribute('aria-controls','h38DemoMoreDialog');more.innerHTML='<span class="nav-icon">•••</span><span>More</span>';more.addEventListener('click',openMore);n.appendChild(more);
    }
    const active=n.querySelector('button[data-page].active')?.dataset.page||'';
    more.classList.toggle('active',!!active&&!PRIMARY.includes(active));
    if(more.classList.contains('active'))more.setAttribute('aria-current','page');else more.removeAttribute('aria-current');
  }finally{busy=false;}
}
function reconcile(){annotateTables();polishNav();}
const observer=new MutationObserver(()=>queueMicrotask(reconcile));
observer.observe(document.documentElement,{childList:true,subtree:true});
window.matchMedia?.(MOBILE).addEventListener?.('change',reconcile);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reconcile,{once:true});else reconcile();
window.H38_PUBLIC_DEMO_POLISH={build:'20260915-public-demo-phone-parity-1',reconcile};
})();
