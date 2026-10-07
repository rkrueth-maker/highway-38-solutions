// H38 Online Payments (Stripe Connect): Money-page enhancement.
//
// What this does in the Office UI:
//   - Adds an "Online payments" section to the Money page listing open
//     invoices with their online-payment status, plus a "Create pay link"
//     / "Copy pay link" action per invoice (enabled tenants only).
//   - Adds a "Refund" action for invoices paid through Stripe. Refunds
//     MOVE money, so they always go through the app's confirm dialog and
//     an explicit owner click — never automatic, never Kit-triggered.
// What this never does:
//   - Never touches card numbers (Stripe Checkout is Stripe-hosted).
//   - Never invents a pay option: the section stays inert unless the
//     owner's server-side switch is ON and Stripe reports charges
//     enabled on the business's OWN connected account.
// Money settles directly to the business's bank via its own Stripe
// account. H38 never holds or routes customer funds.
(function(){
'use strict';
var BUILD='20261006-stripepay-1';

function text(v){return String(v==null?'':v).trim();}
function num(v){var n=Number(v);return isFinite(n)?n:0;}
function escFn(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function businessId(){return text(window.state&&window.state.businessId);}
function rows(name){
  try{
    if(typeof records==='function'){var r=records(name);return Array.isArray(r)?r:[];}
  }catch(e){}
  var s=window.state||{};return (s.snapshot&&Array.isArray(s.snapshot[name]))?s.snapshot[name]:[];
}
function val(row){for(var i=1;i<arguments.length;i++){var k=arguments[i];if(row&&row[k]!=null&&row[k]!=='')return row[k];}return '';}
function moneyStr(v){
  if(typeof money==='function')return money(v);
  return '$'+num(v).toFixed(2);
}
function notify(msg,isErr){
  if(typeof toast==='function')toast(msg,!!isErr);
}
function setting(){
  try{
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.getOnlinePaymentsSetting==='function')
      return window.H38OwnerControls.getOnlinePaymentsSetting();
  }catch(e){}
  return {enabled:false,connected:false,chargesEnabled:false};
}
function ready(){
  var s=setting();
  return s.enabled&&s.connected&&s.chargesEnabled;
}

async function invoke(action,extra){
  var api=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure?window.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api) throw new Error('Secure connection is unavailable.');
  var res=await api.functions.invoke('h38-stripe-connect',{body:Object.assign({action:action,businessId:businessId()},extra||{})});
  if(res&&res.error) throw new Error(res.error.message||String(res.error));
  var data=(res&&res.data)||{};
  if(data.status&&data.status!=='PASS') throw new Error(data.error||'Stripe request failed.');
  return data;
}

async function refreshMoney(){
  try{
    if(navigator.onLine&&window.state&&window.state.bridgeReady&&typeof sync==='function') await sync(false);
  }catch(e){}
  try{if(typeof window.renderMoney==='function')window.renderMoney();}catch(e){}
}

async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true;}catch(e){}
  try{
    var ta=document.createElement('textarea');
    ta.value=t;document.body.appendChild(ta);ta.select();
    document.execCommand('copy');ta.remove();return true;
  }catch(e){return false;}
}

async function createPayLink(invoiceId,btn){
  btn.disabled=true;
  try{
    var data=await invoke('checkout_link',{invoiceId:invoiceId});
    if(data.url){
      var copied=await copyText(data.url);
      notify(copied?'Pay link created and copied. Send it to the customer any way you like.':'Pay link created: '+data.url);
    }
    await refreshMoney();
  }catch(e){
    notify('Could not create the pay link: '+(e&&e.message?e.message:e),true);
  }finally{
    btn.disabled=false;
  }
}

async function refundInvoice(invoice,paymentAmount,btn){
  var number=text(val(invoice,'Invoice Number'))||text(val(invoice,'Invoice ID'));
  var msg='Refund the online payment of '+moneyStr(paymentAmount)+' for invoice '+number+'? The money goes back to the customer\'s card or bank (usually 5–10 days). This cannot be undone.';
  var ok=false;
  try{
    if(typeof h38ConfirmDialog==='function') ok=await h38ConfirmDialog(msg,'Refund online payment','Refund '+moneyStr(paymentAmount));
    else ok=window.confirm(msg);
  }catch(e){ok=false;}
  if(!ok)return;
  btn.disabled=true;
  try{
    await invoke('refund',{invoiceId:text(val(invoice,'Invoice ID')),confirmed:true});
    notify('Refund sent. The invoice balance has been updated.');
    await refreshMoney();
  }catch(e){
    notify('Refund failed: '+(e&&e.message?e.message:e),true);
  }finally{
    btn.disabled=false;
  }
}

function invoiceStripePayment(invoiceId,payments){
  for(var i=0;i<payments.length;i++){
    var p=payments[i];
    if(text(val(p,'Invoice ID'))===invoiceId&&text(val(p,'Source'))==='Stripe'&&!/refund/i.test(text(val(p,'Status'))))
      return p;
  }
  return null;
}

function enhanceMoneyPage(){
  var main=document.getElementById('mainContent');
  if(!main||document.getElementById('onlinePayCard'))return;
  var grid=main.querySelector('.grid');
  if(!grid)return;
  var s=setting();
  var section=document.createElement('section');
  section.className='card span8';
  section.id='onlinePayCard';

  if(!ready()){
    var why=!s.enabled
      ? 'Online payments are OFF. Manual payments (Venmo, Cash App, check, cash — recorded by hand) keep working exactly as they do now.'
      : (!s.connected
        ? 'Stripe is not connected yet. Connect your own Stripe account in Settings → Owner Controls → Online Payments.'
        : 'Stripe is connected but not finished with setup. Complete onboarding in Settings → Owner Controls → Online Payments, then refresh the status.');
    section.innerHTML='<h2>Online payments</h2>'
      +'<p class="muted small">'+escFn(why)+'</p>'
      +'<p class="muted small">When on, customers can pay invoices online (card 2.9% + 30¢, bank debit 0.8% max $5, charged by Stripe). Money settles straight to your bank — the Office never holds it.</p>';
    grid.appendChild(section);
    return;
  }

  var invoices=rows('invoices').filter(function(r){return !text(val(r,'Status')).match(/^deleted/i);});
  var payments=rows('payments');
  var open=invoices.filter(function(r){return num(val(r,'Balance'))>0.005;});
  var paidOnline=invoices.filter(function(r){return !!invoiceStripePayment(text(val(r,'Invoice ID')),payments);});

  var html='<h2>Online payments</h2>';
  html+='<p class="muted small">Stripe is connected and online payments are ON. Create a pay link and send it to the customer, or let them pay from their portal. Payments mark invoices paid automatically.</p>';
  if(open.length){
    html+='<div class="list">'+open.slice(0,25).map(function(r){
      var id=text(val(r,'Invoice ID'));
      var linkStatus=text(val(r,'Online Payment Status'));
      var hasLink=linkStatus==='Link Open'&&text(val(r,'Online Payment Link'));
      return '<div class="row"><div class="row-top"><strong>'+escFn(text(val(r,'Invoice Number'))||id)+'</strong>'
        +'<span>'+escFn(linkStatus||'No link yet')+'</span></div>'
        +'<small>Balance '+moneyStr(val(r,'Balance'))+'</small>'
        +'<div class="actions"><button type="button" class="secondary" data-stripe-link="'+escFn(id)+'">'+(hasLink?'Copy pay link':'Create pay link')+'</button></div></div>';
    }).join('')+'</div>';
  } else {
    html+='<p class="muted small">No open invoices right now.</p>';
  }
  if(paidOnline.length){
    html+='<h3 style="margin-top:14px">Paid online</h3><div class="list">'+paidOnline.slice(0,25).map(function(r){
      var id=text(val(r,'Invoice ID'));
      var p=invoiceStripePayment(id,payments);
      var amt=p?num(val(p,'Amount')):0;
      return '<div class="row"><div class="row-top"><strong>'+escFn(text(val(r,'Invoice Number'))||id)+'</strong><span>Paid</span></div>'
        +'<small>'+moneyStr(amt)+' via Stripe · refunds go back to the customer\'s card or bank</small>'
        +'<div class="actions"><button type="button" class="secondary" data-stripe-refund="'+escFn(id)+'" data-amount="'+amt+'">Refund</button></div></div>';
    }).join('')+'</div>';
  }
  section.innerHTML=html;
  grid.appendChild(section);

  section.querySelectorAll('[data-stripe-link]').forEach(function(btn){
    btn.onclick=function(){createPayLink(btn.getAttribute('data-stripe-link'),btn);};
  });
  section.querySelectorAll('[data-stripe-refund]').forEach(function(btn){
    btn.onclick=function(){
      var id=btn.getAttribute('data-stripe-refund');
      var inv=invoices.find(function(r){return text(val(r,'Invoice ID'))===id;});
      if(inv) refundInvoice(inv,num(btn.getAttribute('data-amount')),btn);
    };
  });
}

function installHooks(){
  try{
    if(typeof window.renderMoney==='function'&&!window.renderMoney.__h38StripePay){
      var orig=window.renderMoney;
      var wrapped=function(){var r=orig.apply(this,arguments);try{enhanceMoneyPage();}catch(e){console.warn('[stripe-payments] money hook',e);}return r;};
      wrapped.__h38StripePay=true;
      window.renderMoney=wrapped;
    }
  }catch(e){}
}

window.H38StripePayments={BUILD:BUILD,ready:ready,enhance:enhanceMoneyPage};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installHooks,{once:true});
else installHooks();
})();
