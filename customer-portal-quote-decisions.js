(function(){
  'use strict';
  const config=window.H38_CUSTOMER_PORTAL_SUPABASE||{};
  let client=null,portalData={quotes:[]},activeQuoteId=null,bound=false;
  const byId=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function notice(message,kind){const node=byId('portalNotice');if(!node)return;node.className='portal-notice '+(kind||'');node.innerHTML=message;}
  function configured(){return config.enabled===true&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(config.url||''))&&String(config.publishableKey||'').length>=20;}
  function getClient(){
    if(client)return client;
    if(!configured()||!window.supabase)throw new Error('Secure customer quote decisions are not configured.');
    client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{headers:{'x-client-info':'highway-38-customer-quote-decisions'}}});
    return client;
  }
  function quoteById(id){return (portalData.quotes||[]).find(row=>row.id===id)||null;}
  function currentQuote(){return quoteById(activeQuoteId)||(portalData.quotes||[]).find(row=>row.status==='presented'&&!row.customer_decision)||null;}
  async function decideQuote(quoteId,version,decision,notes){
    const quote=quoteById(quoteId);if(!quote)throw new Error('The selected quote is not available. Refresh and try again.');
    const {data,error}=await getClient().rpc('customer_portal_decide_quote',{p_quote_id:quoteId,p_expected_version:Number(version||quote.version||1),p_decision:decision,p_notes:notes||null});
    if(error)throw error;
    const label=decision==='revision_requested'?'revision request':decision==='declined'?'decline decision':'approval';
    notice('<b>Quote '+esc(label)+' recorded.</b> Highway 38 will review it before any next action. No payment, automatic start, text, or email occurred.','ok');
    setTimeout(()=>location.reload(),650);
    return data;
  }
  async function requestRevision(){
    const quote=currentQuote();if(!quote)return notice('Open a quote before requesting a change.','bad');
    const notes=prompt('Describe exactly what should change:','');if(!notes||notes.trim().length<3)return;
    if(!confirm('Record this quote revision request for Highway 38 review?'))return;
    await decideQuote(quote.id,quote.version,'revision_requested',notes.trim());
  }
  async function declineQuote(){
    const quote=currentQuote();if(!quote)return notice('Open a quote before declining it.','bad');
    const notes=prompt('Optional reason for declining this quote:','')||'';
    if(!confirm('Decline this quote? Highway 38 will review the decision.'))return;
    await decideQuote(quote.id,quote.version,'declined',notes.trim());
  }
  function safe(action){return action().catch(error=>{console.error(error);notice('<b>Quote decision stopped:</b> '+esc(error&&error.message?error.message:error),'bad');});}
  function installDeclineButton(){
    const actions=document.querySelector('.h38-quote-dialog__actions');if(!actions||byId('quoteDeclineConfirmed'))return;
    const button=document.createElement('button');button.id='quoteDeclineConfirmed';button.className='btn';button.type='button';button.textContent='Decline quote';
    actions.insertBefore(button,actions.firstChild);button.addEventListener('click',()=>safe(declineQuote));
  }
  function bind(){
    if(bound)return;bound=true;installDeclineButton();
    document.addEventListener('click',event=>{
      const review=event.target.closest('[data-review-quote]');if(review)activeQuoteId=review.dataset.reviewQuote;
      if(event.target.closest('#actionReviewQuote'))activeQuoteId=((portalData.quotes||[]).find(row=>row.status==='presented'&&!row.customer_decision)||{}).id||null;
      if(event.target.closest('#quoteRequestChange')){event.preventDefault();event.stopImmediatePropagation();safe(requestRevision);}
    },true);
    window.addEventListener('h38:portal-data',event=>{portalData=event.detail||portalData;});
    const initial=window.H38_CUSTOMER_PORTAL&&window.H38_CUSTOMER_PORTAL.getState?window.H38_CUSTOMER_PORTAL.getState():null;if(initial)portalData=initial;
    if(window.H38_CUSTOMER_PORTAL){
      window.H38_CUSTOMER_PORTAL.decideQuote=(id,version,decision,notes)=>decideQuote(id,version,decision,notes).catch(error=>{console.error(error);throw error;});
      window.H38_CUSTOMER_PORTAL.requestQuoteRevision=(id,version,notes)=>decideQuote(id,version,'revision_requested',notes);
      window.H38_CUSTOMER_PORTAL.declineQuote=(id,version,notes)=>decideQuote(id,version,'declined',notes);
    }
  }
  function boot(){let attempts=0;const timer=setInterval(()=>{attempts+=1;if(window.H38_CUSTOMER_PORTAL&&document.getElementById('quoteReviewDialog')){clearInterval(timer);bind();}else if(attempts>120)clearInterval(timer);},100);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
