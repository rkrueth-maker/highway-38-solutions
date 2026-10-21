/* H38 Office — Tally, the money agent (2026-10-20)
 * Tally is the resident agent for the money screens (Money, Accounting,
 * Payroll, Tax Prep, Reports). She PRESENTS the state of the books and the
 * payroll pipeline in plain language, flags what needs the owner, and —
 * on wide screens — pops out beside the screen to answer "what's next"
 * (Rick 2026-10-20: resident-agent help pattern).
 *
 * HARD BOUNDARY: presentation layer only. Tally reads the proven outputs
 * of the accounting workspace / engine and the payroll run module; she
 * never recomputes tax, GL, or report figures, never writes a record,
 * never moves money, files, or posts anything. Every figure on her card
 * is a stored value or the workspace's own accountingData() result.
 */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  const BUILD='20261020-e2e-findings-2';
  const PAGES=['money','accounting','payroll','tax','reports'];
  const $=id=>document.getElementById(id);
  const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
  const t=v=>String(v==null?'':v).trim();
  const n=v=>{const x=Number(v||0);return Number.isFinite(x)?x:0;};
  const esc=v=>t(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n(v));
  const val=(row,...keys)=>{for(const k of keys){const x=row?.[k];if(x!==undefined&&x!==null&&String(x).trim()!=='')return x;}return '';};
  const today=()=>new Date().toISOString().slice(0,10);
  const DISCLOSURE='Tally is an AI agent. She reads your Office records — she never moves money, files a return, or posts anything without you.';

  // ---------- read-only brief ----------
  function booksState(){
    try{
      const ws=window.H38_ACCOUNTING_WORKSPACE;
      if(ws&&typeof ws.accountingData==='function'){
        const d=ws.accountingData();
        return {ar:n(d?.ar?.total),ap:n(d?.ap?.total),bank:n(d?.bank),netIncome:n(d?.pnl?.netIncome),
          bsDiff:n(d?.bs?.difference),billsDue:(d?.recs||[]).filter(r=>r&&r.recommended).length,source:'workspace'};
      }
    }catch(e){/* fall through to engine reads */}
    try{
      const A=window.H38_ACCOUNTING_ENGINE;
      if(A){
        const ar=A.arAging(rows('invoices'),today()),ap=A.apAging(rows('vendorBills'),today());
        const bank=rows('bankAccounts').reduce((s,r)=>s+n(r['Available Balance']??r['Ledger Balance']??r.Balance),0);
        const recs=A.billsToPay(rows('vendorBills'),{asOf:today(),horizonDays:7});
        return {ar:n(ar.total),ap:n(ap.total),bank,netIncome:null,bsDiff:null,
          billsDue:(recs||[]).filter(r=>r&&r.recommended).length,source:'engine'};
      }
    }catch(e){/* no books state */}
    return null;
  }
  function payrollState(){
    const periods=rows('payrollPeriods').slice().sort((a,b)=>t(val(b,'Pay Date','Created Time')).localeCompare(t(val(a,'Pay Date','Created Time'))));
    const latest=periods[0]||null;
    const openRuns=periods.filter(p=>['Draft','Reviewed'].includes(t(val(p,'Status'))));
    let unlinked=0;
    openRuns.concat(latest?[latest]:[]).forEach(p=>{
      const ex=val(p,'Excluded Sources');
      if(Array.isArray(ex))unlinked+=ex.filter(x=>x&&x.reason==='Not linked to an employee record').length;
    });
    const pendingTime=rows('timeEntries').filter(r=>!['APPROVED','REJECTED'].includes(t(val(r,'Approval Status')).toUpperCase())).length;
    const flags=[];
    try{
      const cfg=window.H38_PAYROLL_RUN&&typeof window.H38_PAYROLL_RUN.loadConfig==='function'?window.H38_PAYROLL_RUN.loadConfig():null;
      if(cfg){
        if(!(cfg.minnesota&&cfg.minnesota.enabled&&cfg.minnesota.confirmed))flags.push('Minnesota withholding is OFF — runs flag it instead of guessing.');
        if(!(cfg.employer&&cfg.employer.futaEnabled))flags.push('FUTA is OFF until you confirm your rate.');
        if(!(cfg.employer&&cfg.employer.sutaEnabled))flags.push('SUTA is OFF until you confirm your DEED rate.');
      }
    }catch(e){/* flags stay empty rather than wrong */}
    return {latest,openRuns:openRuns.length,unlinked,pendingTime,flags,
      stage:latest?stageWords(latest):''};
  }
  function stageWords(run){
    const status=t(val(run,'Status')),appr=t(val(run,'Approval Status'));
    if(status==='Posted')return 'posted to the books';
    if(status==='Void')return 'void';
    if(status==='Finalized'||appr.toUpperCase()==='APPROVED')return 'finalized — not posted yet';
    if(status==='Reviewed')return 'reviewed — waiting on final approval';
    if(status==='Draft')return 'a draft — estimates not confirmed';
    return status.toLowerCase()||'in progress';
  }
  function taxState(){
    const periods=rows('taxPeriods');
    const liability=periods.reduce((s,r)=>s+n(val(r,'Estimated Liability'))-n(val(r,'Payment Recorded')),0);
    const missing=rows('missingDocuments').filter(r=>t(val(r,'Status')).toUpperCase()!=='COMPLETE').length;
    return {periods:periods.length,liability,missing};
  }
  function qbState(){
    const qb=rows('integrationStates').find(r=>t(r.Provider)==='QuickBooks Online');
    return {connected:!!qb&&/connected/i.test(t(qb.Status))};
  }
  function computeBrief(){
    const books=booksState(),pay=payrollState(),tax=taxState(),qb=qbState();
    const needs=[];
    if(books&&books.bsDiff!==null&&Math.abs(books.bsDiff)>0.005)needs.push({text:`The books are out of balance by ${money(books.bsDiff)} — worth a look before anything else.`,page:'accounting'});
    if(books&&books.billsDue>0)needs.push({text:`${books.billsDue} bill${books.billsDue===1?'':'s'} due within 7 days need${books.billsDue===1?'s':''} review.`,page:'accounting',focus:'#h38BillsToPay'});
    if(pay.openRuns>0)needs.push({text:`${pay.openRuns} pay run${pay.openRuns===1?' is':'s are'} open — review the estimates, then finalize.`,page:'payroll'});
    if(pay.unlinked>0)needs.push({text:`${pay.unlinked} time ${pay.unlinked===1?'entry':'entries'} couldn't be matched to an employee and were left out of the run.`,page:'people'});
    if(pay.pendingTime>0)needs.push({text:`${pay.pendingTime} time ${pay.pendingTime===1?'entry is':'entries are'} waiting for approval — unapproved time never enters a run.`,page:'payroll'});
    pay.flags.forEach(f=>needs.push({text:f,page:'payroll'}));
    if(tax.missing>0)needs.push({text:`${tax.missing} tax document${tax.missing===1?' is':'s are'} still missing for your accountant.`,page:'tax'});
    return {books,pay,tax,qb,needs};
  }
  function sentenceFor(page,b){
    const parts=[];
    if(b.books){
      if(b.books.bsDiff!==null&&Math.abs(b.books.bsDiff)>0.005)parts.push(`Books out of balance by ${money(b.books.bsDiff)}.`);
      else parts.push('The books balance.');
      parts.push(`${money(b.books.ar)} owed to you · ${money(b.books.ap)} to vendors.`);
    }
    if(page==='payroll'&&b.pay.latest)parts.push(`Latest run (pay ${t(val(b.pay.latest,'Pay Date')).slice(0,10)||'—'}) is ${b.pay.stage}.`);
    if(page==='tax')parts.push(b.tax.periods?`${b.tax.periods} period${b.tax.periods===1?'':'s'} prepared · ${money(b.tax.liability)} estimated liability.`:'No tax periods prepared yet.');
    let s=parts.join(' ');
    if(s.length>150&&parts.length>1)s=parts.slice(0,2).join(' ');
    return s;
  }

  // ---------- styles ----------
  function installStyle(){
    if(document.getElementById('h38TallyStyle'))return;
    const st=document.createElement('style');st.id='h38TallyStyle';
    st.textContent=`
      .h38-tally-card{border:1px solid #d7e0d9;border-left:5px solid #14532d;background:#fff;border-radius:14px;padding:12px 14px;margin:0 0 14px;box-shadow:0 1px 2px rgba(15,40,25,.06)}
      .h38-tally-card.flash{outline:3px solid #86c79b;outline-offset:2px}
      .h38-tally-head{display:flex;gap:10px;align-items:flex-start}
      .h38-tally-medal{flex:none;width:40px;height:40px;border-radius:50%;background:#14532d;color:#faf3e3;font:700 20px Georgia,serif;display:flex;align-items:center;justify-content:center}
      .h38-tally-name{font-weight:700;font-size:15px;color:#1c2b21}
      .h38-tally-ai{font-size:11px;color:#5b6b60;margin-left:6px;font-weight:600}
      .h38-tally-state{font-size:15px;line-height:1.45;color:#243528;margin-top:2px}
      .h38-tally-needs{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
      .h38-tally-needs li{display:flex;gap:8px;align-items:flex-start;font-size:14px;color:#33463a}
      .h38-tally-needs .dot{flex:none;margin-top:6px;width:8px;height:8px;border-radius:50%;background:#d97706}
      .h38-tally-needs button{margin-left:auto;flex:none}
      .h38-tally-foot{font-size:12px;color:#6b7a70;margin-top:10px}
      .h38-tally-compact .h38-tally-foot{display:none}
      #h38TallyPopout{position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);background:#fff;z-index:1300;box-shadow:-12px 0 32px rgba(10,30,18,.22);display:flex;flex-direction:column;border-left:1px solid #d7e0d9}
      #h38TallyPopout .h38-tally-pop-head{display:flex;gap:10px;align-items:center;padding:14px;border-bottom:1px solid #e4eae6}
      #h38TallyPopout .h38-tally-pop-body{padding:14px;overflow:auto;font-size:14px;color:#243528;line-height:1.5}
      #h38TallyPopout h3{margin:16px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#52705e}
      #h38TallyPopout h3:first-child{margin-top:0}
      #h38TallyPopout .h38-tally-links{display:grid;gap:8px;margin-top:6px}
      #h38TallyPopout .h38-tally-close{margin-left:auto}
      @media(max-width:1199px){#h38TallyPopout{display:none}}
    `;
    document.head.appendChild(st);
  }

  // ---------- brief card ----------
  function needsHtml(needs,currentPage){
    if(!needs.length)return '<p class="h38-tally-state" style="margin-top:6px">Nothing needs you right now. The books balance — or I\'ll tell you why not.</p>';
    const shown=needs.slice(0,5);
    return `<ul class="h38-tally-needs">${shown.map((item,i)=>`<li><span class="dot"></span><span>${esc(item.text)}</span>${item.page||item.focus?`<button type="button" class="secondary" data-tally-need="${i}">Take me there</button>`:''}</li>`).join('')}</ul>${needs.length>shown.length?`<p class="muted small" style="margin-top:6px">+${needs.length-shown.length} more on the page below.</p>`:''}`;
  }
  function runNeedAction(item,currentPage){
    closePanel();
    if(item.focus&&currentPage===item.page){const el=document.querySelector(item.focus);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});return;}}
    if(item.page&&typeof window.openPage==='function'){window.openPage(item.page);
      if(item.focus)setTimeout(()=>{const el=document.querySelector(item.focus);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},450);}
  }
  function mountBrief(page){
    try{
      if(!PAGES.includes(page))return;
      const main=$('mainContent');if(!main)return;
      if(!main.querySelector('.h38-screen-head')&&!main.querySelector('.grid'))return; // a guided flow owns the screen
      installStyle();
      const b=computeBrief();
      let card=document.getElementById('h38TallyBrief');
      if(!card||!main.contains(card)){
        card=document.createElement('section');
        card.id='h38TallyBrief';card.className='h38-tally-card'+(page==='money'?' h38-tally-compact':'');
        card.setAttribute('aria-label','Tally — money brief');
        const head=main.querySelector('.h38-screen-head');
        if(head&&head.parentNode===main)head.insertAdjacentElement('afterend',card);
        else if(head)head.insertAdjacentElement('afterend',card);
        else main.prepend(card);
      }
      card.innerHTML=`<div class="h38-tally-head"><div class="h38-tally-medal" aria-hidden="true">T</div><div>
        <div><span class="h38-tally-name">Tally</span><span class="h38-tally-ai">AI agent · books &amp; payroll</span></div>
        <p class="h38-tally-state">${esc(sentenceFor(page,b))}</p></div></div>
        ${needsHtml(b.needs,page)}
        <p class="h38-tally-foot">${esc(DISCLOSURE)}</p>`;
      card.querySelectorAll('[data-tally-need]').forEach(btn=>{
        btn.onclick=()=>{const item=b.needs[Number(btn.dataset.tallyNeed)];if(item)runNeedAction(item,page);};
      });
    }catch(e){/* Tally never breaks a money screen */}
  }

  // ---------- resident pop-out ----------
  const NEXT={
    money:'Start on Accounting for bills and the books; Payroll when it is time to pay the team. Anything that needs you is on my card at the top of each money screen.',
    accounting:'Work top-down: bills due first, then banking, then the month-end check. Approving a bill here never sends a payment by itself.',
    payroll:'A run walks in order: 1 · approve time, 2 · preview the run, 3 · review the estimates, 4 · finalize, 5 · post to the books. Withholding figures are estimates from the tax tables — I never guess a tax number.',
    tax:'Prepare the period, clear the missing-documents list, then hand the packet to your accountant. The Office never files a return.',
    reports:'Each report prints its date range and where its numbers come from. If two reports disagree, the tie-out note on the report itself says why.'
  };
  let lastFocus=null;
  function currentPage(){
    const head=document.querySelector('.h38-screen-head');
    return t(head?.dataset?.h38Page)||t(window.state?.page);
  }
  function openPanel(){
    try{
      installStyle();
      if(window.innerWidth<1200){
        const card=document.getElementById('h38TallyBrief');
        if(card){card.scrollIntoView({behavior:'smooth',block:'start'});card.classList.add('flash');setTimeout(()=>card.classList.remove('flash'),1400);}
        return;
      }
      lastFocus=document.activeElement;
      let panel=document.getElementById('h38TallyPopout');
      if(!panel){panel=document.createElement('aside');panel.id='h38TallyPopout';panel.setAttribute('aria-label','Tally — help with this screen');document.body.appendChild(panel);}
      const page=currentPage();
      const head=document.querySelector('.h38-screen-head');
      const title=t(head?.querySelector('h1')?.textContent)||'This screen';
      const purpose=t(head?.querySelector('.h38-screen-head__purpose')?.textContent);
      const b=computeBrief();
      panel.innerHTML=`<div class="h38-tally-pop-head"><div class="h38-tally-medal" aria-hidden="true">T</div>
        <div><div class="h38-tally-name">Tally<span class="h38-tally-ai">AI agent</span></div>
        <div class="muted small">Books &amp; payroll — ask me what's next.</div></div>
        <button type="button" class="secondary h38-tally-close" data-tally-close="1" aria-label="Close Tally">✕</button></div>
        <div class="h38-tally-pop-body">
        <h3>You're on</h3><p><strong>${esc(title)}</strong>${purpose?`<br>${esc(purpose)}`:''}</p>
        <h3>What's next</h3><p>${esc(NEXT[page]||NEXT.money)}</p>
        <h3>The books right now</h3><p>${esc(sentenceFor(page,b))}</p>
        ${needsHtml(b.needs,page)}
        <h3>Go to</h3><div class="h38-tally-links">
          <button type="button" class="secondary" data-tally-goto="accounting">Accounting &amp; Bills</button>
          <button type="button" class="secondary" data-tally-goto="payroll">Payroll</button>
          <button type="button" class="secondary" data-tally-goto="reports">Reports</button>
          <button type="button" class="secondary" data-tally-goto="tax">Tax Prep</button>
        </div>
        <p class="h38-tally-foot" style="margin-top:14px">${esc(DISCLOSURE)}<br>Signature line, as always: the books balance — or I'll tell you why not.</p>
        </div>`;
      panel.querySelector('[data-tally-close]').onclick=closePanel;
      panel.querySelectorAll('[data-tally-goto]').forEach(btn=>btn.onclick=()=>{closePanel();window.openPage?.(btn.dataset.tallyGoto);});
      panel.querySelectorAll('[data-tally-need]').forEach(btn=>btn.onclick=()=>{const item=b.needs[Number(btn.dataset.tallyNeed)];if(item)runNeedAction(item,page);});
      panel.querySelector('[data-tally-close]')?.focus?.();
    }catch(e){/* help panel must never break the screen */}
  }
  function closePanel(){
    const panel=document.getElementById('h38TallyPopout');
    if(panel)panel.remove();
    if(lastFocus&&typeof lastFocus.focus==='function'){try{lastFocus.focus({preventScroll:true});}catch(e){}}
    lastFocus=null;
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('h38TallyPopout'))closePanel();});

  function headerMoreAction(o){
    const page=t(o&&o.page);
    if(!PAGES.includes(page))return null;
    if(window.innerWidth<1200)return null; // pop-out is a wide-screen surface; phones get the brief card
    return {label:'✦ Ask Tally',handler:()=>openPanel()};
  }

  // ---------- cold-mount guarantee for the Money screen ----------
  // Root cause of the cold-render defect (E2E 2026-10-20): every sibling
  // screen's mountBrief call lives in that screen's own renderer (app-19
  // payroll, reports-section, accounting-workspace's own render), but the
  // only mountBrief('money') call sat in accounting-workspace.js's
  // renderMoney wrapper — and accounting-workspace lazy-loads ONLY with
  // the Accounting page group. A cold first navigation straight to Money
  // (PAGE_MONEY loads this file, not accounting-workspace) therefore never
  // fired a mount; the brief appeared only after an Accounting visit had
  // installed the wrapper. Wrap renderMoney here instead: money-agent
  // loads with EVERY money page group (money/accounting/payroll/tax/
  // reports), so the brief now mounts on every Money render, cold or
  // warm. Chain-friendly like the other renderMoney wrappers (card-vault,
  // flow-tightening, accounting-workspace): mountBrief is idempotent, so
  // composing with the accounting-workspace wrapper is harmless.
  function wrapMoneyRender(){
    const base=window.renderMoney;
    if(typeof base!=='function'||base.__h38TallyMoneyWrap)return;
    const wrapped=function(){const r=base.apply(this,arguments);mountBrief('money');return r;};
    wrapped.__h38TallyMoneyWrap=true;
    window.renderMoney=wrapped;
  }
  wrapMoneyRender();

  const api=Object.freeze({build:BUILD,name:'Tally',mountBrief,openPanel,closePanel,headerMoreAction,brief:computeBrief});
  window.H38_TALLY=api;
  window.H38_RESIDENT_AGENT=api;
})();
