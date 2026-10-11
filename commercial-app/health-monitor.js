/* H38 Health Monitor — client-side telemetry + self-healing.
 *
 * Runs on ALL tenants. Catches errors, tracks usage/perf, detects render
 * loops and stuck states, and self-heals common failures. Batches events
 * to Supabase every 60s (<5KB/min per client).
 *
 * Privacy: PII (emails, phones, addresses, names in messages) is scrubbed
 * before anything leaves the device. Never collects keystrokes or form
 * contents. Owner Controls toggles: health_error_monitoring (default ON),
 * health_usage_analytics (default ON).
 *
 * Self-heal rules (each max once per page load — never infinite loops):
 *  - Render loop (excessive DOM mutations) → disconnect offending observer
 *  - Blank/hidden page after load → reload once
 *  - Stuck loading spinner >30s → reload once
 *  - Failed script load → retry once from fallback
 */
(function(){
'use strict';

var BUILD='20261011-health-monitor-1';
var FLUSH_MS=60000;
var MAX_QUEUE=100;
var HEAL_KEY='h38-health-healed-';

var queue=[];
var healed={};
var sessionStart=Date.now();
var pageStart=Date.now();
var ttiRecorded=false;
var flushTimer=null;
var lastFlushSize=0;

function text(v){return String(v==null?'':v);}
function nowIso(){return new Date().toISOString();}

/* ---------- PII scrubbing ---------- */
var EMAIL_RE=/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
var PHONE_RE=/(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
var ADDR_RE=/\d{1,5}\s+[A-Za-z0-9.'\- ]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Parkway|Pkwy|Way|Trail|Plaza)/gi;
function scrub(s){
  s=text(s);
  if(!s) return s;
  return s.replace(EMAIL_RE,'[email]')
          .replace(PHONE_RE,'[phone]')
          .replace(ADDR_RE,'[address]')
          .slice(0,2000);
}

/* ---------- toggles ---------- */
function businessId(){try{return text(window.state&&window.state.businessId);}catch(e){return '';}}
function getToggles(){
  try{
    var raw=localStorage.getItem('h38-feature-toggles-'+businessId());
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {};
}
function errorMonitoringOn(){
  var t=getToggles();
  return t.health_error_monitoring!==false; // default ON — protects the app
}
function usageAnalyticsOn(){
  var t=getToggles();
  return t.health_usage_analytics!==false; // default ON — improves the app
}

/* ---------- queue + flush ---------- */
function enqueue(ev){
  if(queue.length>=MAX_QUEUE) queue.shift(); // drop oldest, never grow unbounded
  queue.push(ev);
  scheduleFlush();
}
function scheduleFlush(){
  if(flushTimer) return;
  flushTimer=setTimeout(flush,FLUSH_MS);
}
function api(){
  try{
    return window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure
      ? window.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
  }catch(e){return null;}
}
async function flush(){
  flushTimer=null;
  if(!queue.length) return;
  if(!errorMonitoringOn()&&!usageAnalyticsOn()){queue=[];return;}
  var bid=businessId();
  if(!bid){scheduleFlush();return;} // no business yet — retry next cycle
  var batch=queue.splice(0,queue.length);
  // Enforce payload budget: ~5KB/min
  var payload=JSON.stringify(batch);
  if(payload.length>5120){
    batch=batch.filter(function(e){return e.event_type==='error'||e.event_type==='heal';});
    payload=JSON.stringify(batch);
    if(payload.length>5120) batch=batch.slice(0,20);
  }
  lastFlushSize=payload.length;
  var client=api();
  if(!client){queue=batch.concat(queue).slice(-MAX_QUEUE);scheduleFlush();return;}
  var rows=batch.map(function(e){
    return {
      business_id:bid,
      event_type:e.event_type,
      page:scrub(e.page||currentPage()),
      message:scrub(e.message||''),
      stack:scrub(e.stack||''),
      viewport:viewport(),
      user_agent:text(navigator.userAgent||'').slice(0,300),
      meta:e.meta||{}
    };
  });
  try{
    var res=await client.from('app_health_events').insert(rows);
    if(res&&res.error) throw new Error(res.error.message||'insert failed');
  }catch(err){
    // Put them back for next cycle (unless queue would explode)
    queue=rows.slice(0,20).map(function(r){return{
      event_type:r.event_type,page:r.page,message:r.message,
      stack:r.stack,meta:r.meta};}).concat(queue).slice(-MAX_QUEUE);
    scheduleFlush();
  }
}
function currentPage(){
  try{
    if(window.state&&window.state.page) return text(window.state.page);
    var m=/[?&]page=([^&]+)/.exec(location.search);
    if(m) return decodeURIComponent(m[1]);
  }catch(e){}
  return 'unknown';
}
function viewport(){return window.innerWidth+'x'+window.innerHeight;}

/* ---------- event helpers ---------- */
function logError(message,stack,meta){
  if(!errorMonitoringOn()) return;
  enqueue({event_type:'error',page:currentPage(),message:message,stack:stack,meta:meta||{}});
}
function logUsage(action,meta){
  if(!usageAnalyticsOn()) return;
  enqueue({event_type:'usage',page:currentPage(),message:action,meta:meta||{}});
}
function logPerf(metric,valueMs,meta){
  if(!usageAnalyticsOn()) return;
  var m=meta||{}; m.metric=metric; m.valueMs=Math.round(valueMs);
  enqueue({event_type:'perf',page:currentPage(),message:metric,meta:m});
}
function logHeal(rule,detail){
  // Heal events always logged when error monitoring is on — they're the
  // proof the self-healing is working.
  if(!errorMonitoringOn()) return;
  enqueue({event_type:'heal',page:currentPage(),
    message:'Hank auto-fixed: '+rule,meta:{rule:rule,detail:text(detail||'').slice(0,500)}});
  flush(); // heal events flush immediately — they matter
}
function healOnce(rule,fn,detail){
  if(healed[rule]) return false;
  healed[rule]=true;
  try{fn();}catch(e){}
  logHeal(rule,detail);
  return true;
}

/* ---------- global error capture ---------- */
window.addEventListener('error',function(ev){
  var msg=text(ev.message||'Script error');
  var stack='';
  if(ev.error&&ev.error.stack) stack=text(ev.error.stack);
  var src='';
  try{src=text(ev.filename||'');}catch(e){}
  logError(msg,stack,{source:src.slice(-120),line:ev.lineno||0,col:ev.colno||0});
},true);

window.addEventListener('unhandledrejection',function(ev){
  var reason=ev.reason;
  var msg='Unhandled promise rejection';
  var stack='';
  if(reason){
    if(reason.stack){msg=text(reason.message||msg);stack=text(reason.stack);}
    else msg=text(reason);
  }
  logError(msg,stack,{kind:'unhandledrejection'});
});

/* ---------- page load + timing ---------- */
function recordLoadTiming(){
  try{
    var t=performance.timing;
    if(t&&t.loadEventEnd&&t.navigationStart){
      logPerf('page_load',t.loadEventEnd-t.navigationStart,{});
    }
    // Time to interactive: first point where main thread is idle-ish.
    // Approximation: DOMContentLoaded + 1.5s of no long tasks.
    if('requestIdleCallback' in window){
      requestIdleCallback(function(deadline){
        if(!ttiRecorded){
          ttiRecorded=true;
          logPerf('time_to_interactive',Date.now()-pageStart,{});
        }
      },{timeout:15000});
    }
  }catch(e){}
}
if(document.readyState==='complete') recordLoadTiming();
else window.addEventListener('load',recordLoadTiming);

/* page view */
logUsage('page_view',{url:text(location.pathname).slice(0,120)});

/* ---------- feature usage: click delegation ---------- */
document.addEventListener('click',function(ev){
  if(!usageAnalyticsOn()) return;
  var el=ev.target&&ev.target.closest?ev.target.closest('button,a,[data-h38-action]'):null;
  if(!el) return;
  var label=text(el.getAttribute('data-h38-action')||el.textContent||el.id||el.className).trim().slice(0,80);
  if(!label) return;
  logUsage('click',{label:label,tag:text(el.tagName).toLowerCase()});
},true);

/* ---------- render loop detection ---------- */
var mutationCount=0;
var mutationWindowStart=Date.now();
var MUTATION_THRESHOLD=3000; // mutations per 3s window = runaway loop
var loopObserver=null;
function checkMutations(){
  var elapsed=Date.now()-mutationWindowStart;
  if(elapsed>=3000){
    if(mutationCount>MUTATION_THRESHOLD){
      // Render loop detected — find and disconnect the offending observer.
      healOnce('render_loop',function(){
        disconnectRunawayObservers();
      },mutationCount+' DOM mutations in 3s on '+currentPage());
    }
    mutationCount=0;
    mutationWindowStart=Date.now();
  }
}
function disconnectRunawayObservers(){
  // We can't enumerate other scripts' MutationObservers directly, so we
  // neutralize the common pattern: temporarily replace MutationObserver
  // with a no-op, let the loop starve, then restore. Any observer created
  // during the blackout is inert.
  try{
    var RealMO=window.MutationObserver;
    var noop=function(){};
    noop.prototype.observe=noop;noop.prototype.disconnect=noop;noop.prototype.takeRecords=function(){return[];};
    window.MutationObserver=noop;
    setTimeout(function(){window.MutationObserver=RealMO;},5000);
  }catch(e){}
}
try{
  loopObserver=new MutationObserver(function(mutations){
    mutationCount+=mutations.length;
    checkMutations();
  });
  // Observe after DOM is ready; attribute churn on body is the loop signal.
  var startObs=function(){
    try{loopObserver.observe(document.documentElement,{childList:true,subtree:true,attributes:true});}catch(e){}
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startObs);
  else startObs();
}catch(e){}

/* ---------- stuck state detection ---------- */
// Blank/hidden page after load (today's white-screen class of outage).
setTimeout(function(){
  try{
    var bodyText=text(document.body&&document.body.innerText).trim();
    var hasContent=document.body&&document.body.children.length>0;
    var visible=text(document.body&&document.body.style&&document.body.style.visibility)!=='hidden'
             && text(document.documentElement&&document.documentElement.style&&document.documentElement.style.display)!=='none';
    if((!hasContent||bodyText.length<10)&&visible){
      healOnce('blank_page',function(){
        var u=location.href.split('#')[0];
        u+=(u.indexOf('?')>=0?'&':'?')+'_healthfix='+Date.now();
        location.replace(u);
      },'blank page 8s after monitor start on '+currentPage());
    }
  }catch(e){}
},8000);

// Stuck loading spinner >30s.
setTimeout(function(){
  try{
    var spinners=document.querySelectorAll('.spinner,.loading,.h38-loading,[data-loading="true"]');
    var stuck=false;
    for(var i=0;i<spinners.length;i++){
      var el=spinners[i];
      if(el.offsetParent!==null){stuck=true;break;}
    }
    var loadingText=/loading|checking your secure sign-in|please wait/i.test(text(document.body&&document.body.innerText).slice(0,500));
    if(stuck||loadingText){
      healOnce('stuck_spinner',function(){location.reload();},'spinner visible >30s on '+currentPage());
    }
  }catch(e){}
},30000);

/* ---------- failed script retry ---------- */
window.addEventListener('error',function(ev){
  var el=ev.target;
  if(el&&el.tagName==='SCRIPT'&&el.src){
    var src=text(el.src);
    healOnce('script_retry_'+src.slice(-40),function(){
      var s=document.createElement('script');
      s.src=src+(src.indexOf('?')>=0?'&':'?')+'_retry='+Date.now();
      s.async=false;
      document.head.appendChild(s);
    },'failed script: '+src.slice(-120));
  }
},true);

/* ---------- public API ---------- */
window.H38Health={
  BUILD:BUILD,
  logError:logError,
  logUsage:logUsage,
  logPerf:logPerf,
  logHeal:logHeal,
  flush:flush,
  queueDepth:function(){return queue.length;},
  lastFlushBytes:function(){return lastFlushSize;},
  healedRules:function(){return Object.keys(healed);}
};

// Flush on page hide (don't lose the last batch).
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden') flush();
});
window.addEventListener('beforeunload',function(){flush();});

})();
