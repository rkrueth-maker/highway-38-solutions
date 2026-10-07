(function(){
'use strict';
const BUILD='20261006-ask-numbers-1';
const text=v=>String(v==null?'':v).trim();
const num=v=>{const n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));return Number.isFinite(n)?n:0;};
const state=()=>window.state||{};
const rows=n=>Array.isArray(state()?.snapshot?.[n])?state().snapshot[n]:[];
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'$'+Math.round(v).toLocaleString('en-US');
function monthKey(s){return text(s).slice(0,7);}
function nowMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function balance(inv){const total=num(val(inv,'Total','Amount','total','amount')),paid=num(val(inv,'Paid','Amount Paid','amountPaid','paid'));const b=num(val(inv,'Balance Due','Balance','balanceDue','balance'));return b>0?b:Math.max(0,total-paid);}
function isPaid(inv){return /PAID|SETTLED/i.test(text(val(inv,'Status','status')))||(num(val(inv,'Total','Amount'))>0&&balance(inv)<=0.005);}
function compute(snapshot,month){const invoices=Array.isArray(snapshot?.invoices)?snapshot.invoices:[],payments=Array.isArray(snapshot?.payments)?snapshot.payments:[],quotes=Array.isArray(snapshot?.quotes)?snapshot.quotes:[],jobs=Array.isArray(snapshot?.jobs)?snapshot.jobs:[],customers=Array.isArray(snapshot?.customers)?snapshot.customers:[];
let moneyIn=0;for(const p of payments){if(monthKey(val(p,'Paid Time','Payment Date','Date','Created Time','createdAt'))===month)moneyIn+=num(val(p,'Amount','amount','Total'));}
if(moneyIn===0)for(const inv of invoices){if(isPaid(inv)&&monthKey(val(inv,'Paid Time','Updated Time','Created Time'))===month)moneyIn+=num(val(inv,'Total','Amount'));}
let owedTotal=0,owedCount=0,oldest=null;for(const inv of invoices){const b=balance(inv);if(b>0.005&&!/VOID|CANCEL|WRITE/i.test(text(val(inv,'Status','status')))){owedTotal+=b;owedCount++;const due=text(val(inv,'Due Date','dueDate')).slice(0,10);if(due&&(!oldest||due<oldest))oldest=due;}}
let qSent=0,qAccepted=0;for(const q of quotes){if(monthKey(val(q,'Created Time','Sent Time','Updated Time'))!==month)continue;const st=text(val(q,'Status','status')),dec=text(val(q,'Customer Decision','customerDecision'));if(/SENT|PRESENT|ACCEPT|DECLIN/i.test(st)||dec)qSent++;if(/ACCEPT/i.test(st)||/ACCEPT/i.test(dec))qAccepted++;}
let jobsDone=0;for(const j of jobs){if(/COMPLETE/i.test(text(val(j,'Status','status')))&&monthKey(val(j,'Completed Time','Service Date','Updated Time'))===month)jobsDone++;}
const byCustomer=new Map();for(const inv of invoices){if(!isPaid(inv))continue;const cidKey=text(val(inv,'Customer ID','customerId'));if(cidKey)byCustomer.set(cidKey,(byCustomer.get(cidKey)||0)+num(val(inv,'Total','Amount')));}
let topName='',topAmt=0;for(const [cidKey,amt] of byCustomer){if(amt>topAmt){topAmt=amt;const c=customers.find(r=>text(val(r,'Customer ID','customerId'))===cidKey);topName=text(val(c,'Customer Name','name'))||'A customer';}}
return{month,moneyIn,owedTotal,owedCount,oldestDue:oldest,qSent,qAccepted,winRate:qSent?Math.round(100*qAccepted/qSent):null,jobsDone,topName,topAmt};}
const QUESTIONS=[
 {id:'moneyIn',label:'💵 Money in this month',answer:a=>a.moneyIn>0?`You brought in ${money(a.moneyIn)} so far this month.`:'No payments recorded yet this month.'},
 {id:'owed',label:'🧾 Who owes me?',answer:a=>a.owedCount?`${a.owedCount} open invoice${a.owedCount===1?'':'s'} totaling ${money(a.owedTotal)}${a.oldestDue?`; oldest due ${a.oldestDue}`:''}.`:'Nobody owes you anything right now. All caught up.'},
 {id:'quotes',label:'📋 Quote win rate',answer:a=>a.qSent?`This month: ${a.qAccepted} of ${a.qSent} quotes accepted (${a.winRate}%).`:'No quotes sent this month yet.'},
 {id:'jobs',label:'🔧 Jobs finished',answer:a=>`${a.jobsDone} job${a.jobsDone===1?'':'s'} marked complete this month.`},
 {id:'top',label:'🏆 Best customer',answer:a=>a.topAmt>0?`${a.topName} is your biggest payer on record at ${money(a.topAmt)} in paid invoices.`:'No paid invoices on record yet.'}];
function patchReports(){if(state()?.page!=='reports')return;const main=document.getElementById('mainContent')||document.querySelector('main');if(!main||main.querySelector('[data-h38-numbers]'))return;const box=document.createElement('section');box.className='card h38-ask-numbers';box.dataset.h38Numbers='1';box.innerHTML=`<div><strong>Ask your numbers</strong><small>Straight answers from your own records — no spreadsheets.</small></div><div class="row-actions">${QUESTIONS.map(q=>`<button type="button" class="secondary" data-num="${q.id}">${q.label}</button>`).join('')}</div><p data-num-answer aria-live="polite"></p>`;main.prepend(box);box.querySelectorAll('[data-num]').forEach(btn=>btn.onclick=()=>{const q=QUESTIONS.find(x=>x.id===btn.dataset.num);const a=compute(state()?.snapshot||{},nowMonth());box.querySelector('[data-num-answer]').textContent=q?q.answer(a):'';});}
let pending=false;function patch(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;try{patchReports();}catch(e){}});}
function start(){if(!document.documentElement)return;new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});patch();window.H38_NUMBERS_RUNTIME=Object.freeze({build:BUILD,compute});}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();}
})();
