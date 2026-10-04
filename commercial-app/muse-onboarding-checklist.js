(function(){
'use strict';
// H38 Onboarding Checklist: pick what to set up, choose Muse-guided or manual.
// The checklist runs in the contractor's downloaded Muse app via the playbook.
// Each item tracks completion. Manual fallback always available.
const BUILD='20261004-online-booking-toggle-1';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const businessId=()=>text(window.state?.businessId);

const CHECKLIST=[
  {id:'profile',title:'Business Profile',desc:'Name, address, phone, email, logo',icon:'🏢',muse:'I can fill this in from what you tell me about your business.',
   manual:'Settings → Business Profile'},
  {id:'services',title:'Services & Pricing',desc:'What you offer and what you charge',icon:'🧰',muse:'Tell me your trade and I\'ll suggest common services with typical pricing for your area. You approve each one.',
   manual:'Office → Services (or Price Book)'},
  {id:'customers',title:'Customer List',desc:'Import existing customers',icon:'👥',muse:'Paste your customer list, upload a photo of a paper list, or forward me a spreadsheet. I\'ll organize it and you review before import.',
   manual:'Customers → Add Customer (one by one)'},
  {id:'team',title:'Team Members',desc:'Add employees and set roles',icon:'👷',muse:'Give me names, emails, and roles. I\'ll draft the invites for your review.',
   manual:'People → Add Team Member'},
  {id:'schedule',title:'Schedule Setup',desc:'Work hours, service areas, dispatch preferences',icon:'📅',muse:'Tell me your hours and service area. I\'ll configure the schedule board.',
   manual:'Schedule → Settings'},
  {id:'bouncie',title:'Fleet Tracking (Bouncie)',desc:'Connect vehicles for GPS tracking',icon:'🚛',muse:'I\'ll walk you through connecting Bouncie step by step. Takes about 5 minutes.',
   manual:'Fleet → Connect Bouncie'},
  {id:'quickbooks',title:'QuickBooks',desc:'Connect accounting (optional)',icon:'💰',muse:'I\'ll guide you through the QuickBooks connection. Your books stay yours — I only read what you approve.',
   manual:'Accounting → Connect QuickBooks'},
  {id:'templates',title:'Quote Templates',desc:'Reusable quote templates for common jobs',icon:'📋',muse:'Describe your most common jobs. I\'ll build quote templates you can reuse.',
   manual:'Quotes → Templates'},
  {id:'notifications',title:'Notifications',desc:'What alerts you and your team get',icon:'🔔',muse:'Tell me what you want to know about (new quotes, schedule changes, payments). I\'ll set it up.',
   manual:'Settings → Notifications'},
  {id:'onlinebooking',title:'Online Booking',desc:'Let customers request bookings online — stays off until you turn it on',icon:'📅',muse:'Online booking stays OFF until you are ready. When you want it live, I can walk you through flipping the switch in Settings → Owner Controls → Online Booking.',
   manual:'Settings → Owner Controls → Online Booking'},
];

let selected=new Set();
let completed=new Set();

function loadState(){
  try{
    const raw=localStorage.getItem('h38-onboarding-checklist-'+businessId());
    if(raw){const d=JSON.parse(raw);selected=new Set(d.selected||[]);completed=new Set(d.completed||[]);}
  }catch(_){}
  // Default: select all if first run
  if(!selected.size&&!completed.size){
    CHECKLIST.forEach(c=>selected.add(c.id));
  }
}

function saveState(){
  try{
    localStorage.setItem('h38-onboarding-checklist-'+businessId(),JSON.stringify({
      selected:[...selected],completed:[...completed]
    }));
  }catch(_){}
}

function progress(){
  const total=selected.size||1;
  const done=[...selected].filter(id=>completed.has(id)).length;
  return {done,total,pct:Math.round(done/total*100)};
}

function render(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  loadState();
  const p=progress();
  
  main.innerHTML=`<div class="page-head"><div><span class="kicker">SETUP</span>
    <h1>Onboarding Checklist</h1>
    <p>Pick what you want to set up. Your Muse can guide you through each item, or do it manually.</p></div>
    <div class="page-tools"><button class="secondary" data-muse-playbook>📖 Muse Setup Guide</button></div></div>
  
  <div class="card"><div class="h38-checklist-progress">
    <div class="h38-progress-bar"><div class="h38-progress-fill" style="width:${p.pct}%"></div></div>
    <span>${p.done} of ${p.total} complete (${p.pct}%)</span>
  </div></div>
  
  <div class="card"><h2>What do you want to set up?</h2>
    <p class="muted">Check the items you want. Uncheck to skip — you can always do them later.</p>
    <div class="h38-checklist">${CHECKLIST.map(c=>`
      <div class="h38-check-item ${completed.has(c.id)?'done':''}">
        <label class="h38-check-select">
          <input type="checkbox" ${selected.has(c.id)?'checked':''} data-check-select="${c.id}">
          <span class="h38-check-icon">${c.icon}</span>
          <span><strong>${esc(c.title)}</strong><small>${esc(c.desc)}</small></span>
          ${completed.has(c.id)?'<span class="pill good">✓ Done</span>':''}
        </label>
        ${selected.has(c.id)&&!completed.has(c.id)?`<div class="h38-check-actions">
          <button class="secondary" data-muse-start="${c.id}">✨ Guide me with Muse</button>
          <button class="secondary" data-manual-start="${c.id}">Do manually</button>
          <button class="secondary" data-mark-done="${c.id}">Mark done</button>
        </div>
        <div class="h38-check-hint" id="h38-hint-${c.id}" style="display:none"></div>`:''}
      </div>`).join('')}
    </div>
    <div class="actions" style="margin-top:12px">
      <button class="secondary" data-check-reset>Reset checklist</button>
    </div>
  </div>
  
  <div class="card"><h2>How Muse-guided setup works</h2>
    <ol class="h38-how-list">
      <li>Tap <strong>✨ Guide me with Muse</strong> on any item</li>
      <li>Your Muse app opens with the setup guide loaded</li>
      <li>Chat with your Muse — it asks questions, you answer</li>
      <li>Review what it prepares, approve to save</li>
      <li>Come back here and mark the item done</li>
    </ol>
    <p class="muted small">Your Muse never saves, sends, or changes anything without your explicit approval. Manual mode is always available.</p>
  </div>`;
  
  bind();
}

function bind(){
  document.querySelectorAll('[data-check-select]').forEach(cb=>cb.onchange=()=>{
    const id=cb.dataset.checkSelect;
    if(cb.checked)selected.add(id);else{selected.delete(id);completed.delete(id);}
    saveState();render();
  });
  document.querySelectorAll('[data-muse-start]').forEach(b=>b.onclick=()=>startMuseGuide(b.dataset.museStart));
  document.querySelectorAll('[data-manual-start]').forEach(b=>b.onclick=()=>startManual(b.dataset.manualStart));
  document.querySelectorAll('[data-mark-done]').forEach(b=>b.onclick=()=>{
    completed.add(b.dataset.markDone);saveState();render();
    toast('Marked done. Nice progress!');
  });
  document.querySelector('[data-check-reset]')?.addEventListener('click',()=>{
    if(confirm('Reset the onboarding checklist?')){selected=new Set();completed=new Set();saveState();render();}
  });
  document.querySelector('[data-muse-playbook]')?.addEventListener('click',showPlaybook);
}

function startMuseGuide(id){
  const item=CHECKLIST.find(c=>c.id===id);
  if(!item)return;
  const hint=document.getElementById('h38-hint-'+id);
  if(hint){
    hint.style.display='block';
    hint.innerHTML=`<div class="notice"><strong>✨ Muse-guided: ${esc(item.title)}</strong><br>
      ${esc(item.muse)}<br><br>
      <strong>Copy this to your Muse app:</strong>
      <div class="h38-copy-box"><code>Set up "${esc(item.title)}" for my business in the H38 Office. ${esc(item.muse)}</code>
      <button class="secondary" data-copy-guide="${esc(item.title)}|${esc(item.muse)}">📋 Copy</button></div>
      <p class="muted small">Or tap <strong>📖 Muse Setup Guide</strong> above for the full playbook.</p></div>`;
    hint.querySelector('[data-copy-guide]')?.addEventListener('click',e=>{
      const [title,desc]=e.target.dataset.copyGuide.split('|');
      navigator.clipboard?.writeText(`Set up "${title}" for my business in the H38 Office. ${desc}`).then(()=>toast('Copied. Paste into your Muse app.'));
    });
  }
}

function startManual(id){
  const item=CHECKLIST.find(c=>c.id===id);
  if(!item)return;
  const hint=document.getElementById('h38-hint-'+id);
  if(hint){
    hint.style.display='block';
    hint.innerHTML=`<div class="notice"><strong>Manual: ${esc(item.title)}</strong><br>Go to: ${esc(item.manual)}</div>`;
  }
  // Try to navigate to the manual location
  const pageMap={profile:'settings',services:'quotes',customers:'customers',team:'people',schedule:'schedule',bouncie:'fleet',quickbooks:'accounting',templates:'quotes',notifications:'settings',onlinebooking:'settings'};
  const page=pageMap[id];
  if(page&&window.openPage){
    setTimeout(()=>{if(confirm(`Open ${item.manual}?`))window.openPage(page);},300);
  }
}

function showPlaybook(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  main.innerHTML=`<div class="page-head"><div><span class="kicker">SETUP</span>
    <h1>📖 Muse Setup Guide</h1><p>The playbook your Muse follows to guide setup.</p></div>
    <div class="page-tools"><button class="secondary" data-back-checklist>← Back to Checklist</button></div></div>
  <div class="card"><h2>For your Muse</h2>
    <p class="muted">Share this with your Muse app (or any personal AI) to guide your Office setup.</p>
    <div class="h38-playbook">${esc(getPlaybookText()).replace(/\n/g,'<br>')}</div>
    <div class="actions"><button class="secondary" data-copy-playbook>📋 Copy full playbook</button></div>
  </div>`;
  document.querySelector('[data-back-checklist]')?.addEventListener('click',render);
  document.querySelector('[data-copy-playbook]')?.addEventListener('click',()=>{
    navigator.clipboard?.writeText(getPlaybookText()).then(()=>toast('Playbook copied. Paste into your Muse app.'));
  });
}

function getPlaybookText(){
  return `H38 OFFICE SETUP GUIDE (for personal AI assistant)

You are helping set up the H38 Business Office for a contractor. Follow these rules:

RULES:
- Ask one question at a time. Don't overwhelm.
- Never save, send, or change anything without explicit approval.
- Show what you prepared and ask "Does this look right?" before saving.
- If the user wants to do something manually, point them to the right page.
- Keep it conversational, not robotic.

SETUP AREAS (ask which ones they want):
1. Business Profile — name, address, phone, email. Ask for each, confirm.
2. Services & Pricing — ask their trade, suggest 5-8 common services with typical pricing. Let them edit.
3. Customer List — ask them to paste/upload their list. Organize into name/phone/address. Show the organized list for review.
4. Team Members — ask for names, emails, roles. Draft invite list for review.
5. Schedule Setup — ask work hours, service area, dispatch preferences.
6. Bouncie (fleet) — walk through: Office → Fleet → Connect Bouncie → authorize → Sync. Explain each step.
7. QuickBooks — walk through: Accounting → Connect QuickBooks → authorize. Reassure about data privacy.
8. Quote Templates — ask about common jobs, draft 2-3 reusable templates.
9. Notifications — ask what alerts they want (new quotes, schedule changes, payments).
10. Online Booking — stays OFF until the owner turns it on in Settings → Owner Controls → Online Booking. Explain that the booking page link appears there once it is on, and that requests land in the Office for owner review — nothing is auto-approved.

For each area: explain → ask → prepare → review → approve → mark done.
Celebrate progress. Keep it under 15 minutes total if possible.`;
}

function toast(msg,bad){
  if(typeof window.toast==='function')window.toast(msg,!!bad);
}

function start(){
  render();
}

if(window.H38_PAGES)window.H38_PAGES.onboardingChecklist={render:start,title:'Setup Checklist'};
window.H38_ONBOARDING_CHECKLIST=Object.freeze({build:BUILD,start,CHECKLIST});

})();
