/* H38 Membership / Service Plan Engine
 * Recurring revenue for contractors: sell maintenance plans (HVAC tune-ups,
 * lawn season, snow season, pest control, etc.), enroll customers, bill on the
 * cycle, schedule fulfillment visits, and track visits used/remaining.
 *
 * Safety rules (no exceptions):
 * - Billing prepares INVOICE DRAFTS only, always with Approval Status
 *   "Owner Approval Required". Nothing is charged automatically, ever.
 * - Scheduling plan visits is internal planning, same as the Schedule page.
 * - All data is per-tenant (Business ID scoped). Manual-first, zero AI.
 *
 * Collections (new):
 * - membershipPlans: the plan catalog for the business.
 * - memberships: customer enrollments.
 * Reuses: invoices (Invoice Type "Membership Billing"), scheduleEvents
 * (Event Type "Plan Visit"). Saves go through SAVE_ENTITY so custom fields
 * survive server sync (SAVE_INVOICE / SAVE_SCHEDULE rebuild fixed fields).
 */
(function(){
  'use strict';

  const ENGINE_BUILD='20261101-wave3tail9-engine-2';
  const RENEWAL_ALERT_DAYS=30;
  const FREQ_MONTHS={Monthly:1,Quarterly:3,Annual:12};
  const FREQ_LABEL={Monthly:'per month',Quarterly:'per quarter',Annual:'per year'};
  const DAY_MS=86400000;
  const PLAN_STATUSES=['Active','Inactive'];
  const MEMBER_STATUSES=['Active','Paused','Cancelled'];
  const PAY_METHODS=['Invoice / manual','Card on file'];

  /* ---------- collection access ---------- */
  function plans(){return records('membershipPlans').filter(r=>!isTestRecord(r));}
  function activePlans(){return plans().filter(r=>String(v(r,'Status')).toUpperCase()==='ACTIVE');}
  function planById(id){return plans().find(r=>String(v(r,'Plan ID'))===String(id));}
  function memberships(){return records('memberships').filter(r=>!isTestRecord(r));}
  function membershipById(id){return memberships().find(r=>String(v(r,'Membership ID'))===String(id));}
  function activeMemberships(){return memberships().filter(r=>String(v(r,'Status')).toUpperCase()==='ACTIVE');}
  function planVisitsOf(mid){return records('scheduleEvents').filter(r=>String(v(r,'Membership ID'))===String(mid)&&String(v(r,'Event Type'))==='Plan Visit');}
  function completedVisitsOf(mid){return planVisitsOf(mid).filter(r=>String(v(r,'Status')).toUpperCase()==='COMPLETE');}
  function upcomingVisitsOf(mid){return planVisitsOf(mid).filter(r=>{const st=String(v(r,'Status')).toUpperCase();if(st==='COMPLETE'||st==='CANCELLED')return false;return new Date(v(r,'Start Time')).getTime()>=Date.now()-4*3600000;}).sort((a,b)=>new Date(v(a,'Start Time'))-new Date(v(b,'Start Time')));}
  function billingHistoryOf(mid){return records('invoices').filter(r=>String(v(r,'Membership ID'))===String(mid)).sort((a,b)=>String(v(b,'Created Time')).localeCompare(String(v(a,'Created Time'))));}
  function membershipInvoicesAwaiting(){return records('invoices').filter(r=>String(v(r,'Invoice Type'))==='Membership Billing'&&String(v(r,'Status')).toUpperCase()==='DRAFT');}

  /* ---------- math ---------- */
  function freqMonths(freq){return FREQ_MONTHS[freq]||1;}
  function monthlyEquivalent(price,freq){return num(price)/freqMonths(freq);}
  function planMRR(){return activeMemberships().reduce((s,m)=>{const p=planById(v(m,'Plan ID'));return s+monthlyEquivalent(v(p,'Price'),v(p,'Billing Frequency'));},0);}
  function includedVisits(plan){return Math.max(0,Math.round(num(v(plan,'Included Visits Per Year'))));}
  function visitsUsed(mid){return completedVisitsOf(mid).length;}
  function visitsRemaining(m){const p=planById(v(m,'Plan ID'));return Math.max(0,includedVisits(p)-visitsUsed(v(m,'Membership ID')));}
  function addMonthsISO(isoDate,months){
    const d=new Date(`${String(isoDate).slice(0,10)}T12:00:00`);
    const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(day,last));
    return d.toISOString().slice(0,10);
  }
  function isDue(m){
    if(String(v(m,'Status')).toUpperCase()!=='ACTIVE')return false;
    const next=v(m,'Next Billing Date');if(!next)return true;
    return String(next).slice(0,10)<=new Date().toISOString().slice(0,10);
  }
  function dueMemberships(){return activeMemberships().filter(isDue).sort((a,b)=>String(v(a,'Next Billing Date')).localeCompare(String(v(b,'Next Billing Date'))));}
  /* Renewal date: stored on the membership; older enrollments without one
   * derive it as Start Date + 12 months so the alert works for them too. */
  function renewalDateOf(m){
    const stored=String(v(m,'Renewal Date')||'').slice(0,10);
    if(stored)return stored;
    const start=String(v(m,'Start Date')||'').slice(0,10);
    return start?addMonthsISO(start,12):'';
  }
  function renewalsDue(days){
    const today=new Date().toISOString().slice(0,10);
    const h=new Date(`${today}T12:00:00`);h.setDate(h.getDate()+(days||RENEWAL_ALERT_DAYS));
    const horizonStr=h.toISOString().slice(0,10);
    return activeMemberships().filter(m=>{
      const r=renewalDateOf(m);
      return r&&r>=today&&r<=horizonStr;
    }).sort((a,b)=>renewalDateOf(a).localeCompare(renewalDateOf(b)));
  }
  function failedMembershipInvoices(){
    const today=new Date().toISOString().slice(0,10);
    return records('invoices').filter(r=>{
      if(String(v(r,'Invoice Type'))!=='Membership Billing')return false;
      if(!(num(v(r,'Balance'))>0.005))return false;
      const due=String(v(r,'Due Date')).slice(0,10);
      return due&&due<today;
    });
  }

  /* ---------- persistence (SAVE_ENTITY preserves custom fields) ---------- */
  async function saveEntity(collection,recordType,id,record,idKeys){
    await queueOperation('SAVE_ENTITY',recordType,id,{entity:collection,record},{collection,record,idKeys},true);
  }

  /* ---------- plan catalog ---------- */
  async function savePlan(data,existing){
    const plan=planById(data.planId);
    const id=plan?String(v(plan,'Plan ID')):newId('PLAN');
    const price=num(data.price);
    if(!(price>0))throw new Error('Plan price must be greater than zero.');
    const record={
      ...(plan||{}),
      'Plan ID':id,'Business ID':state.businessId,
      'Plan Name':requireValue(data.planName,'Plan name is required.'),
      'Description':data.description||'',
      'Price':price,
      'Billing Frequency':FREQ_MONTHS[data.billingFrequency]?data.billingFrequency:'Monthly',
      'Included Visits Per Year':Math.max(0,Math.round(num(data.includedVisits))),
      'Included Services':data.includedServices||'',
      'Discount Percent':Math.min(100,Math.max(0,num(data.discountPercent))),
      'Terms':data.terms||'',
      'Status':PLAN_STATUSES.includes(data.status)?data.status:'Active',
      'Created Time':plan?v(plan,'Created Time'):now(),
      'Updated Time':now(),
      'Record Version':Math.max(1,num(plan?v(plan,'Record Version'):0)+1)
    };
    await saveEntity('membershipPlans','Membership Plan',id,record,['Plan ID']);
    return id;
  }

  async function setPlanStatus(planId,status){
    const plan=planById(planId);if(!plan)throw new Error('Plan could not be found.');
    const updated={...plan,'Status':status,'Updated Time':now(),'Record Version':Math.max(1,num(v(plan,'Record Version'))+1)};
    delete updated.__localPending;
    await saveEntity('membershipPlans','Membership Plan',planId,updated,['Plan ID']);
  }

  /* ---------- enrollment ---------- */
  function customerAddress(customerId){
    const prop=records('properties').find(r=>String(v(r,'Customer ID'))===String(customerId)&&String(v(r,'Address')).trim());
    return prop?String(v(prop,'Address')):'';
  }

  async function enrollMembership(data){
    const plan=planById(data.planId);
    if(!plan)throw new Error('Select a plan.');
    if(String(v(plan,'Status')).toUpperCase()!=='ACTIVE')throw new Error('That plan is inactive. Activate it before enrolling members.');
    const customer=records('customers').find(r=>rowId(r,'Customer ID','customerId')===String(data.customerId));
    if(!customer)throw new Error('Select a customer.');
    const dupe=memberships().find(m=>String(v(m,'Customer ID'))===String(data.customerId)&&String(v(m,'Plan ID'))===String(data.planId)&&['ACTIVE','PAUSED'].includes(String(v(m,'Status')).toUpperCase()));
    if(dupe)throw new Error('This customer already has an active or paused enrollment in that plan.');
    const startDate=String(data.startDate||'').slice(0,10)||new Date().toISOString().slice(0,10);
    const id=newId('MEMBER');
    const record={
      'Membership ID':id,'Business ID':state.businessId,
      'Plan ID':String(v(plan,'Plan ID')),'Customer ID':String(data.customerId),
      'Start Date':startDate,'Billing Day':Math.min(28,Math.max(1,Math.round(num(data.billingDay)||1))),
      'Next Billing Date':startDate,
      'Renewal Date':String(data.renewalDate||'').slice(0,10)||addMonthsISO(startDate,12),
      'Payment Method':PAY_METHODS.includes(data.paymentMethod)?data.paymentMethod:PAY_METHODS[0],
      'Status':'Active','Enrollment Notes':data.notes||'',
      'Paused Date':'','Cancellation Date':'','Cancellation Effective Date':'','Cancellation Note':'',
      'Created Time':now(),'Updated Time':now(),'Record Version':1
    };
    await saveEntity('memberships','Membership',id,record,['Membership ID']);
    await schedulePlanVisits(id);
    return id;
  }

  async function schedulePlanVisits(membershipId){
    const m=membershipById(membershipId);if(!m)throw new Error('Membership could not be found.');
    if(planVisitsOf(membershipId).length)throw new Error('Plan visits are already scheduled for this membership.');
    const plan=planById(v(m,'Plan ID'));if(!plan)throw new Error('The membership plan is missing.');
    const n=includedVisits(plan);
    if(!n)throw new Error('This plan includes zero visits per year — nothing to schedule.');
    const start=String(v(m,'Start Date')).slice(0,10)||new Date().toISOString().slice(0,10);
    const cid=String(v(m,'Customer ID')),location=customerAddress(cid);
    const intervalDays=365.25/n,created=[];
    for(let i=0;i<n;i++){
      const d=new Date(`${start}T12:00:00`);d.setDate(d.getDate()+Math.round(i*intervalDays));
      const day=d.toISOString().slice(0,10),id=newId('SCHEDULE');
      const record={
        'Schedule Event ID':id,'Business ID':state.businessId,
        'Event Type':'Plan Visit',
        'Title':`${v(plan,'Plan Name')} — plan visit ${i+1} of ${n}`,
        'Related Record Type':'Membership','Related Record ID':membershipId,
        'Membership ID':membershipId,'Customer ID':cid,
        'Assigned User ID':'',
        'Start Time':`${day}T09:00`,'End Time':`${day}T11:00`,
        'Location':location,'Status':'Scheduled',
        'Notes':`Membership plan visit prepared from enrollment. Confirm with the customer and dispatch from Schedule.`,
        'Created Time':now(),'Updated Time':now(),'Record Version':1
      };
      await saveEntity('scheduleEvents','Schedule Event',id,record,['Schedule Event ID']);
      created.push(id);
    }
    return created;
  }

  /* ---------- recurring billing (drafts only — never charges) ---------- */
  /* Idempotency: every billing draft carries the Billing Period it bills
   * (the membership's Next Billing Date at run time). A period that already
   * has an invoice is never billed twice — the date just advances. */
  function invoiceForPeriod(mid,period){
    if(!period)return null;
    return records('invoices').find(r=>String(v(r,'Membership ID'))===String(mid)&&String(v(r,'Billing Period')||'')===period)||null;
  }
  async function billMembership(m){
    const plan=planById(v(m,'Plan ID'));
    if(!plan)return false;
    const price=num(v(plan,'Price')),freq=v(plan,'Billing Frequency')||'Monthly';
    const mid=String(v(m,'Membership ID')),cid=String(v(m,'Customer ID'));
    const period=String(v(m,'Next Billing Date')||'').slice(0,10)||new Date().toISOString().slice(0,10);
    let created=false;
    if(!invoiceForPeriod(mid,period)){
      const id=newId('INVOICE');
      const description=`${v(plan,'Plan Name')} — ${freq.toLowerCase()} membership billing`;
      const dueDate=addMonthsISO(new Date().toISOString().slice(0,10),1);
      const record={
        'Invoice ID':id,'Business ID':state.businessId,'Customer ID':cid,'Job ID':'',
        'Invoice Number':`LOCAL-${Date.now()}-${Math.floor(Math.random()*100000)}`,
        'Status':'Draft','Invoice Type':'Membership Billing',
        'Membership ID':mid,'Plan ID':String(v(plan,'Plan ID')),
        'Billing Period':period,
        'Approval Status':'Owner Approval Required',
        'Description':description,'Due Date':dueDate,
        'Subtotal':price,'Tax':0,'Total':price,'Balance':price,
        'Notes':'Prepared by the membership billing run. NOT charged. Review and approve before sending or collecting.',
        'Created Time':now(),'Updated Time':now(),'Record Version':1
      };
      await saveEntity('invoices','Invoice',id,record,['Invoice ID']);
      created=true;
    }
    const advanced=addMonthsISO(period,freqMonths(freq));
    const updated={...m,'Next Billing Date':advanced,'Updated Time':now(),'Record Version':Math.max(1,num(v(m,'Record Version'))+1)};
    delete updated.__localPending;
    await saveEntity('memberships','Membership',mid,updated,['Membership ID']);
    return created;
  }
  async function generateBilling(){
    const due=dueMemberships();
    if(!due.length){toast('No membership billing is due.');return{created:0};}
    let created=0;
    for(const m of due){if(await billMembership(m))created++;}
    if(navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);
    toast(`${created} membership billing draft${created===1?'':'s'} prepared. Nothing charged — owner approval required before sending.`);
    return{created};
  }

  /* ---------- the engine: auto-billing + visit refill on app load ----------
   * Runs from the in-app load path (business snapshot arriving / Today
   * rendering), the same pattern as the offline queue flush watcher. There
   * is no server cron in this product, so the honest scope is: whenever the
   * Office is opened, anything due is prepared then — drafts only, never a
   * charge — and every step is deduped so re-running changes nothing. */
  async function refillVisits(m){
    const plan=planById(v(m,'Plan ID'));if(!plan)return 0;
    const n=includedVisits(plan);if(!n)return 0;
    const mid=String(v(m,'Membership ID'));
    if(upcomingVisitsOf(mid).length)return 0;
    const existing=planVisitsOf(mid);
    const taken=new Set(existing.map(r=>String(v(r,'Start Time')).slice(0,10)));
    const intervalDays=365.25/n;
    const today=new Date().toISOString().slice(0,10);
    let startStr;
    if(existing.length){
      const last=taken.size?[...taken].sort().pop():today;
      const d=new Date(`${last}T12:00:00`);d.setDate(d.getDate()+Math.round(intervalDays));
      startStr=d.toISOString().slice(0,10);
      if(startStr<today)startStr=today;
    }else{
      startStr=String(v(m,'Start Date')).slice(0,10)||today;
      if(startStr<today)startStr=today;
    }
    const cid=String(v(m,'Customer ID')),location=customerAddress(cid);
    let created=0;
    for(let i=0;i<n;i++){
      const d=new Date(`${startStr}T12:00:00`);d.setDate(d.getDate()+Math.round(i*intervalDays));
      const day=d.toISOString().slice(0,10);
      if(taken.has(day))continue;
      const id=newId('SCHEDULE');
      const record={
        'Schedule Event ID':id,'Business ID':state.businessId,
        'Event Type':'Plan Visit',
        'Title':`${v(plan,'Plan Name')} — plan visit ${existing.length+created+1}`,
        'Related Record Type':'Membership','Related Record ID':mid,
        'Membership ID':mid,'Customer ID':cid,
        'Assigned User ID':'',
        'Start Time':`${day}T09:00`,'End Time':`${day}T11:00`,
        'Location':location,'Status':'Scheduled',
        'Notes':`Membership plan visit prepared by the membership engine when the previous cycle ran out. Confirm with the customer and dispatch from Schedule.`,
        'Created Time':now(),'Updated Time':now(),'Record Version':1
      };
      await saveEntity('scheduleEvents','Schedule Event',id,record,['Schedule Event ID']);
      taken.add(day);created++;
    }
    return created;
  }
  let engineRunning=false,engineDoneKey='';
  async function runEngine(opts={}){
    if(engineRunning)return{skipped:'running'};
    if(typeof state==='undefined'||!state||!state.businessId)return{skipped:'no-business'};
    if(typeof navigator!=='undefined'&&!navigator.onLine)return{skipped:'offline'};
    const key=[state.businessId,memberships().length,dueMemberships().length,records('scheduleEvents').length,records('invoices').length].join('|');
    if(!opts.force&&engineDoneKey===key)return{skipped:'already-ran'};
    engineRunning=true;
    try{
      let billed=0,visits=0;
      for(const m of dueMemberships()){if(await billMembership(m))billed++;}
      for(const m of activeMemberships()){visits+=await refillVisits(m);}
      if((billed||visits)&&navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);
      engineDoneKey=key;
      return{billed,visits,renewals:renewalsDue(RENEWAL_ALERT_DAYS).length};
    }finally{engineRunning=false;}
  }
  /* Renewal alert on Today (the landing workspace), same DOM patch pattern
   * as the recurring-plans runtime: one box, signature-guarded. */
  function patchTodayRenewals(){
    try{
      if(typeof state==='undefined'||!state||state.page!=='today')return;
      const panel=document.querySelector('.h38-life-today')||document.querySelector('#mainContent');if(!panel)return;
      const due=renewalsDue(RENEWAL_ALERT_DAYS);
      const existingBox=panel.querySelector('[data-h38-membership-renewals]');
      if(!due.length){if(existingBox)existingBox.remove();return;}
      const sig=due.map(m=>`${v(m,'Membership ID')}:${renewalDateOf(m)}`).join('|');
      if(existingBox&&existingBox.dataset.sig===sig)return;
      const box=document.createElement('div');
      box.className='h38-membership-renewals';box.dataset.h38MembershipRenewals='1';box.dataset.sig=sig;
      box.innerHTML=`<div><strong>Service plan renewals coming up</strong><small>${due.map(m=>{const p=planById(v(m,'Plan ID'));return `${esc(customerName(v(m,'Customer ID')))} — ${esc(v(p,'Plan Name')||'Service plan')} renews ${esc(dateOnly(renewalDateOf(m)))}`;}).join(' · ')}</small></div><button type="button">Review memberships</button>`;
      box.querySelector('button').onclick=()=>openPage('memberships');
      if(existingBox)existingBox.replaceWith(box);
      else{const head=panel.querySelector('.h38-life-head');if(head)head.insertAdjacentElement('afterend',box);else panel.prepend(box);}
    }catch(e){/* renewals are advisory; never break Today */}
  }
  let renewalPatchPending=false;
  function queueRenewalPatch(){if(renewalPatchPending)return;renewalPatchPending=true;requestAnimationFrame(()=>{renewalPatchPending=false;patchTodayRenewals();});}
  function startEngineHooks(){
    window.addEventListener('h38:business-snapshot-updated',()=>{
      setTimeout(()=>{runEngine().catch(()=>{});},600);
      queueRenewalPatch();
    });
    window.addEventListener('h38:office-page-rendered',queueRenewalPatch);
    if(typeof document!=='undefined'&&document.documentElement){
      new MutationObserver(queueRenewalPatch).observe(document.documentElement,{childList:true,subtree:true});
    }
    setTimeout(()=>{runEngine().catch(()=>{});queueRenewalPatch();},1500);
  }

  /* ---------- member lifecycle ---------- */
  async function setMembershipStatus(membershipId,status,extra={}){
    const m=membershipById(membershipId);if(!m)throw new Error('Membership could not be found.');
    if(!MEMBER_STATUSES.includes(status))throw new Error('Unknown membership status.');
    const updated={...m,'Status':status,'Updated Time':now(),'Record Version':Math.max(1,num(v(m,'Record Version'))+1),...extra};
    delete updated.__localPending;
    await saveEntity('memberships','Membership',membershipId,updated,['Membership ID']);
  }
  async function pauseMembership(id){await setMembershipStatus(id,'Paused',{'Paused Date':now()});}
  async function resumeMembership(id){await setMembershipStatus(id,'Active',{'Paused Date':''});}
  async function cancelMembership(id,effectiveDate,note){
    await setMembershipStatus(id,'Cancelled',{
      'Cancellation Date':now(),
      'Cancellation Effective Date':String(effectiveDate||'').slice(0,10),
      'Cancellation Note':note||''
    });
    // Cancel future plan visits; keep completed history.
    const future=planVisitsOf(id).filter(r=>!['COMPLETE','CANCELLED'].includes(String(v(r,'Status')).toUpperCase()));
    for(const ev of future){
      const eid=String(v(ev,'Schedule Event ID'));
      const updated={...ev,'Status':'Cancelled','Notes':`${v(ev,'Notes')||''} Cancelled with membership.`.trim(),'Updated Time':now(),'Record Version':Math.max(1,num(v(ev,'Record Version'))+1)};
      delete updated.__localPending;
      await saveEntity('scheduleEvents','Schedule Event',eid,updated,['Schedule Event ID']);
    }
  }
  async function completeVisit(scheduleEventId){
    const ev=records('scheduleEvents').find(r=>String(v(r,'Schedule Event ID'))===String(scheduleEventId));
    if(!ev)throw new Error('Visit could not be found.');
    const updated={...ev,'Status':'Complete','Completed Time':now(),'Updated Time':now(),'Record Version':Math.max(1,num(v(ev,'Record Version'))+1)};
    delete updated.__localPending;
    await saveEntity('scheduleEvents','Schedule Event',scheduleEventId,updated,['Schedule Event ID']);
  }

  /* ---------- open enrollment from a customer record ---------- */
  function openEnrollment(customerId){
    window.__h38MembershipPreselect=String(customerId||'');
    openPage('memberships');
  }

  /* ---------- rendering ---------- */
  function statusPill(status){
    const s=String(status).toUpperCase();
    const kind=s==='ACTIVE'?'good':s==='PAUSED'?'pending':s==='CANCELLED'?'bad':'';
    return pill(status||'Unknown',kind);
  }

  function memberCard(m){
    const plan=planById(v(m,'Plan ID')),cid=String(v(m,'Customer ID')),mid=String(v(m,'Membership ID'));
    const used=visitsUsed(mid),remaining=visitsRemaining(m);
    const upcoming=upcomingVisitsOf(mid),history=billingHistoryOf(mid);
    const nextVisit=upcoming[0];
    const failed=history.some(r=>num(v(r,'Balance'))>0.005&&String(v(r,'Due Date')).slice(0,10)&&String(v(r,'Due Date')).slice(0,10)<new Date().toISOString().slice(0,10));
    const st=String(v(m,'Status')).toUpperCase();
    return `<div class="row"><div class="row-top"><strong>${esc(customerName(cid))}</strong>${statusPill(v(m,'Status'))}</div>`+
      `<small>${esc(v(plan,'Plan Name')||'Plan removed')} · ${money(v(plan,'Price'))} ${esc(FREQ_LABEL[v(plan,'Billing Frequency')]||'per month')} · `+
      `visits ${used} used / ${remaining} remaining · next billing ${dateOnly(v(m,'Next Billing Date'))} · renews ${dateOnly(renewalDateOf(m))}`+
      `${nextVisit?` · next visit ${dateOnly(v(nextVisit,'Start Time'))}`:' · no visits scheduled'}`+
      `${failed?' · <strong>past-due balance needs follow-up</strong>':''}</small>`+
      `<details><summary>Billing history (${history.length})</summary><div class="list">`+
      (history.length?history.map(r=>`<div class="row"><div class="row-top"><strong>${esc(v(r,'Invoice Number'))}</strong>${pill(v(r,'Status'))}</div><small>${money(v(r,'Total'))} · balance ${money(v(r,'Balance'))} · due ${dateOnly(v(r,'Due Date'))} · ${esc(v(r,'Approval Status')||'')}</small></div>`).join(''):empty('No billing yet.'))+
      `</div></details>`+
      (upcoming.length?`<details><summary>Upcoming plan visits (${upcoming.length})</summary><div class="list">`+
        upcoming.slice(0,12).map(r=>`<div class="row"><div class="row-top"><strong>${esc(v(r,'Title'))}</strong>${pill(v(r,'Status'))}</div><small>${dateOnly(v(r,'Start Time'))} · ${esc(v(r,'Location'))}</small><div class="row-actions"><button type="button" class="secondary" data-member-visit-done="${esc(v(r,'Schedule Event ID'))}">Mark visit complete</button></div></div>`).join('')+
        `</div></details>`:'')+
      `<div class="row-actions">`+
      (st==='ACTIVE'?`<button type="button" class="secondary" data-member-pause="${esc(mid)}">Pause</button>`:'')+
      (st==='PAUSED'?`<button type="button" class="secondary" data-member-resume="${esc(mid)}">Resume</button>`:'')+
      (st!=='CANCELLED'?`<button type="button" class="secondary" data-member-cancel="${esc(mid)}">Cancel</button>`:'')+
      `</div>`+
      (st==='CANCELLED'&&v(m,'Cancellation Note')?`<small>Cancelled ${dateOnly(v(m,'Cancellation Effective Date')||v(m,'Cancellation Date'))}: ${esc(v(m,'Cancellation Note'))}</small>`:'')+
      `</div>`;
  }

  function renderMemberships(){
    const allPlans=plans(),allMembers=memberships();
    const active=allMembers.filter(m=>['ACTIVE','PAUSED'].includes(String(v(m,'Status')).toUpperCase()));
    const cancelled=allMembers.filter(m=>String(v(m,'Status')).toUpperCase()==='CANCELLED');
    const due=dueMemberships(),failed=failedMembershipInvoices(),awaiting=membershipInvoicesAwaiting(),renewals=renewalsDue(RENEWAL_ALERT_DAYS);
    const upcoming=records('scheduleEvents').filter(r=>String(v(r,'Event Type'))==='Plan Visit'&&!['COMPLETE','CANCELLED'].includes(String(v(r,'Status')).toUpperCase())&&new Date(v(r,'Start Time')).getTime()>=Date.now()-4*3600000);
    const customers=records('customers'),plansOpts=optionRows(activePlans(),['Plan ID'],r=>`${v(r,'Plan Name')} — ${money(v(r,'Price'))} ${FREQ_LABEL[v(r,'Billing Frequency')]||''}`,'Select plan');
    const preselect=window.__h38MembershipPreselect||'';
    window.__h38MembershipPreselect='';

    const h38MembershipHead={page:'memberships',title:'Memberships',purpose:'Sell service plans, enroll customers, and bill them on schedule. Due billing drafts and the next round of plan visits are prepared automatically when the Office opens — drafts only, nothing is charged without owner approval.',primary:{label:'＋ New plan',handler:()=>{const f=document.getElementById('planForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('input')?.focus({preventScroll:true});}}},secondary:[{label:'Enroll a customer',handler:()=>{const f=document.getElementById('enrollForm');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.querySelector('select')?.focus({preventScroll:true});}}}]};
    $('mainContent').innerHTML=(window.H38Flow?window.H38Flow.screenHeader(h38MembershipHead):pageHead('Memberships',h38MembershipHead.purpose))+
    `<div class="grid">`+
    `<section class="card span12"><div class="stats">`+
      `<div class="stat"><strong>${money(planMRR())}</strong><span>Monthly recurring revenue</span></div>`+
      `<div class="stat"><strong>${active.length}</strong><span>Active members</span></div>`+
      `<div class="stat"><strong>${upcoming.length}</strong><span>Plan visits scheduled</span></div>`+
      `<div class="stat"><strong>${awaiting.length}</strong><span>Billing drafts awaiting approval</span></div>`+
    `</div>`+
    (failed.length?`<div class="notice warn"><strong>${failed.length} past-due membership invoice${failed.length===1?'':'s'}</strong> need follow-up. Open Money to collect.</div>`:'')+
    (renewals.length?`<div class="notice warn"><strong>${renewals.length} service plan renewal${renewals.length===1?'':'s'} coming up in the next ${RENEWAL_ALERT_DAYS} days:</strong> ${renewals.map(m=>`${esc(customerName(v(m,'Customer ID')))} renews ${esc(dateOnly(renewalDateOf(m)))}`).join(' · ')}</div>`:'')+
    `</section>`+

    `<section class="card span4"><h2>Plan builder</h2><form id="planForm">`+
      `<label>Plan name</label><input name="planName" required placeholder="HVAC Comfort Plan">`+
      `<label>Description</label><textarea name="description" placeholder="What the customer gets, in plain words."></textarea>`+
      `<div class="two"><div><label>Price</label><input name="price" type="number" step="0.01" min="0" required></div>`+
      `<div><label>Billing frequency</label><select name="billingFrequency"><option>Monthly</option><option>Quarterly</option><option>Annual</option></select></div></div>`+
      `<div class="two"><div><label>Included visits / year</label><input name="includedVisits" type="number" min="0" value="2"></div>`+
      `<div><label>Member discount %</label><input name="discountPercent" type="number" min="0" max="100" value="0"></div></div>`+
      `<label>Included services</label><textarea name="includedServices" placeholder="e.g. Spring + fall tune-up, priority scheduling, 10% off repairs"></textarea>`+
      `<label>Terms</label><textarea name="terms" placeholder="e.g. 12-month term, auto-renews, cancel with 30 days notice"></textarea>`+
      `<div class="actions"><button>Save plan</button></div></form>${serverSafeguard()}</section>`+

    `<section class="card span4"><h2>Enroll member</h2><form id="enrollForm">`+
      `<label>Customer</label><select name="customerId">${optionRows(customers,['Customer ID','customerId'],row=>v(row,'Customer Name','name'),'Select customer')}</select>`+
      `<label>Plan</label><select name="planId">${plansOpts}</select>`+
      `<div class="two"><div><label>Start date</label><input name="startDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>`+
      `<div><label>Billing day (1–28)</label><input name="billingDay" type="number" min="1" max="28" value="1"></div></div>`+
      `<label>Renewal date</label><input name="renewalDate" type="date" value="${addMonthsISO(new Date().toISOString().slice(0,10),12)}">`+
      `<label>Payment method</label><select name="paymentMethod">${PAY_METHODS.map(p=>`<option>${esc(p)}</option>`).join('')}</select>`+
      `<label>Notes</label><textarea name="notes"></textarea>`+
      `<div class="actions"><button>Enroll and schedule visits</button></div></form>`+
      `<p class="muted small">Enrollment schedules the plan visits on the Schedule page and sets the first billing date. It does not charge anything.</p></section>`+

    `<section class="card span4"><h2>Billing run</h2>`+
      `<p class="muted">${due.length?`${due.length} membership${due.length===1?'':'s'} due for billing:`:'No membership billing is due right now.'}</p>`+
      `<div class="list">${due.slice(0,10).map(m=>{const p=planById(v(m,'Plan ID'));return `<div class="row"><div class="row-top"><strong>${esc(customerName(v(m,'Customer ID')))}</strong></div><small>${esc(v(p,'Plan Name'))} · ${money(v(p,'Price'))} · due ${dateOnly(v(m,'Next Billing Date'))}</small></div>`;}).join('')}</div>`+
      `<div class="actions"><button id="billingRunButton" ${due.length?'':'disabled'}>Prepare billing drafts</button></div>`+
      `<p class="muted small">Due drafts are also prepared automatically when the Office opens. Creates invoice drafts with Owner Approval Required. Review them in Money before sending or collecting. Nothing is charged automatically.</p></section>`+

    `<section class="card span6"><h2>Service plans (${allPlans.length})</h2><div class="list">`+
      (allPlans.length?allPlans.map(p=>`<div class="row"><div class="row-top"><strong>${esc(v(p,'Plan Name'))}</strong>${statusPill(v(p,'Status'))}</div>`+
        `<small>${money(v(p,'Price'))} ${esc(FREQ_LABEL[v(p,'Billing Frequency')]||'per month')} · ${includedVisits(p)} visit${includedVisits(p)===1?'':'s'}/yr${num(v(p,'Discount Percent'))?` · ${num(v(p,'Discount Percent'))}% member discount`:''}</small>`+
        (v(p,'Included Services')?`<small>${esc(v(p,'Included Services'))}</small>`:'')+
        `<div class="row-actions"><button type="button" class="secondary" data-plan-toggle="${esc(v(p,'Plan ID'))}" data-plan-status="${esc(v(p,'Status'))}">${String(v(p,'Status')).toUpperCase()==='ACTIVE'?'Deactivate':'Activate'}</button></div></div>`).join(''):empty('No plans yet. Build your first plan above.'))+
    `</div></section>`+

    `<section class="card span6"><h2>Members (${active.length})</h2><div class="list">`+
      (active.length?active.map(memberCard).join(''):empty('No members enrolled yet.'))+
    `</div></section>`+

    (cancelled.length?`<section class="card span12"><h2>Cancelled history (${cancelled.length})</h2><div class="list">`+
      cancelled.map(memberCard).join('')+`</div></section>`:'')+

    `</div>`;

    if(preselect){const sel=document.querySelector('#enrollForm select[name="customerId"]');if(sel)sel.value=preselect;}

    if(window.H38Flow)window.H38Flow.bindScreenHeader($('mainContent'),h38MembershipHead);
    bindForm('planForm',async(data,form)=>{await savePlan(data);form.reset();if(navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);toast('Service plan saved.');renderMemberships();});
    bindForm('enrollForm',async(data,form)=>{await enrollMembership(data);form.reset();if(navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);toast('Member enrolled. Plan visits scheduled. First billing draft will appear on the next billing run.');renderMemberships();});

    const runBtn=$('billingRunButton');
    if(runBtn)runBtn.onclick=async()=>{runBtn.disabled=true;try{await generateBilling();}catch(e){toast(e.message||String(e),true);}renderMemberships();};

    document.querySelectorAll('[data-plan-toggle]').forEach(b=>b.onclick=async()=>{
      try{await setPlanStatus(b.dataset.planToggle,String(b.dataset.planStatus).toUpperCase()==='ACTIVE'?'Inactive':'Active');if(navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);renderMemberships();}
      catch(e){toast(e.message||String(e),true);}
    });
    document.querySelectorAll('[data-member-pause]').forEach(b=>b.onclick=async()=>{try{await pauseMembership(b.dataset.memberPause);renderMemberships();}catch(e){toast(e.message||String(e),true);}});
    document.querySelectorAll('[data-member-resume]').forEach(b=>b.onclick=async()=>{try{await resumeMembership(b.dataset.memberResume);renderMemberships();}catch(e){toast(e.message||String(e),true);}});
    document.querySelectorAll('[data-member-cancel]').forEach(b=>b.onclick=async()=>{
      const note=prompt('Cancellation note / proration details (kept in history):','');
      if(note===null)return;
      const eff=prompt('Effective date (YYYY-MM-DD):',new Date().toISOString().slice(0,10))||new Date().toISOString().slice(0,10);
      try{await cancelMembership(b.dataset.memberCancel,eff,note);if(navigator.onLine&&state.bridgeReady&&typeof sync==='function')await sync(false);toast('Membership cancelled. Future plan visits cancelled; history kept.');renderMemberships();}
      catch(e){toast(e.message||String(e),true);}
    });
    document.querySelectorAll('[data-member-visit-done]').forEach(b=>b.onclick=async()=>{
      try{await completeVisit(b.dataset.memberVisitDone);renderMemberships();}
      catch(e){toast(e.message||String(e),true);}
    });
  }

  window.renderMemberships=renderMemberships;
  window.H38MembershipEngine={
    build:ENGINE_BUILD,
    render:renderMemberships,
    openEnrollment,
    enroll:enrollMembership,
    generateBilling,
    runEngine,
    refillVisits,
    renewalsDue,
    renewalDateOf,
    cancel:cancelMembership,
    pause:pauseMembership,
    resume:resumeMembership,
    plans,activePlans,memberships,activeMemberships,dueMemberships,planMRR
  };
  startEngineHooks();
})();
