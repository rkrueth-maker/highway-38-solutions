(function(){
'use strict';
// H38 Lead Sources report (2026-11-02, build 20261102-leadsrc-1).
// Improvement wave WS5: a "Leads by source" card on Reports. Counts
// every request and booking request by its "Lead Source" field —
// captured at intake (website form, public booking page, and the
// Office's own New Request form) — so the business can see where new
// work actually comes from. Records from before the field existed (or
// that arrived without one) count as "Not recorded". Read-only: the
// card only reads the snapshot the Reports page already loaded.
var BUILD='20261102-leadsrc-1';
var w=typeof window!=='undefined'?window:globalThis;
var ORDER=['Website','Referral','Repeat customer','Other','Not recorded'];
function text(x){return String(x==null?'':x).trim();}
function esc(s){if(typeof w.esc==='function')return w.esc(s);return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function val(row){var keys=Array.prototype.slice.call(arguments,1);if(typeof w.v==='function')return w.v.apply(w,[row].concat(keys));for(var i=0;i<keys.length;i++){var k=keys[i];if(row&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];}return '';}
function records(name){if(typeof w.records==='function')return w.records(name)||[];var s=w.state||{};return (s.snapshot&&s.snapshot[name])||[];}

function counts(){
  var tally={};
  ORDER.forEach(function(k){tally[k]=0;});
  var total=0;
  ['requests','booking_requests'].forEach(function(coll){
    records(coll).forEach(function(row){
      var src=text(val(row,'Lead Source','leadSource'));
      if(ORDER.indexOf(src)<0)src='Not recorded';
      tally[src]++;total++;
    });
  });
  return {tally:tally,total:total};
}

function mount(){
  if(typeof document==='undefined')return;
  var main=document.getElementById('mainContent');
  if(!main||document.getElementById('h38LeadSourcesCard'))return;
  var grid=main.querySelector('.grid');
  if(!grid)return;
  var c=counts();
  var rows=ORDER.filter(function(k){return c.tally[k]>0||k!=='Not recorded';}).map(function(k){
    var n=c.tally[k];
    var pct=c.total?Math.round(n*100/c.total):0;
    return '<div class="row"><div class="row-top"><strong>'+esc(k)+'</strong><span>'+n+' · '+pct+'%</span></div></div>';
  }).join('');
  var section=document.createElement('section');
  section.className='card span4';
  section.id='h38LeadSourcesCard';
  section.innerHTML='<h2>Leads by source</h2>'+
    '<p class="muted small">Where new requests and bookings came from, as recorded at intake. '+c.total+' lead'+(c.total===1?'':'s')+' counted.</p>'+
    '<div class="list">'+(c.total?rows:'<p class="muted small">No leads recorded yet.</p>')+'</div>';
  grid.appendChild(section);
}

function wire(){
  if(typeof window==='undefined'||typeof window.renderReports!=='function')return;
  var base=window.renderReports;
  if(base.__h38LeadSourcesWrapped)return;
  var wrapped=function(){
    var r=base.apply(this,arguments);
    try{mount();}catch(e){console.warn('[H38 lead sources] mount failed:',e);}
    return r;
  };
  wrapped.__h38LeadSourcesWrapped=true;
  window.renderReports=wrapped;
}
wire();
if(typeof window!=='undefined')window.H38LeadSources={mount:mount,counts:counts,BUILD:BUILD};
if(typeof module!=='undefined'&&module.exports){module.exports={counts:counts,BUILD:BUILD};}
})();
