(function(){
'use strict';
// H38 Desktop Week Grid (2026-11-02, build 20261107-gap5-onedrag-1).
// Improvement wave WS2: the desktop Schedule gains a week grid — one
// column per person, seven day cells per column (Mon–Sun), job chips
// time-ordered inside each day. One drag both reschedules a chip
// (drop on another day; time of day preserved) AND reassigns it
// (drop in another person's column) in a single drop — one drop is
// one SAVE_SCHEDULE write carrying both fields, so no partial
// time-only or assignee-only state can land. Saves go through the
// exact SAVE_SCHEDULE queueOperation the Schedule page's own assign
// control uses, so the phone view (same records) shows the change
// with no reload tricks. Desktop only (min-width 1024px): on the
// phone the same one-edit move lives in the Dispatch board's
// "Move / assign" action sheet (assignee + date/time in one sheet).
// Nothing here gates the manual workflows — the Upcoming list and
// the Add-event form below the grid keep working exactly as before.
//
// Assignee read/write model (gap5, aligned with the dispatch board —
// field-operations-next boardEvents + field-operations-ui moveEvent):
// the effective assignee is the canonical singular 'Assigned User ID',
// falling back to the first entry of the 'Assigned User IDs' array
// some writers (booking/membership engines) store instead. A move
// writes the singular field and, when the record carries the array,
// mirrors it to match — the two representations can no longer drift
// apart and leave a job showing under both the old and new person.
var BUILD='20261107-gap5-onedrag-1';
var w=typeof window!=='undefined'?window:globalThis;
function text(x){return String(x==null?'':x).trim();}
function esc(s){if(typeof w.esc==='function')return w.esc(s);return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function v(row){var keys=Array.prototype.slice.call(arguments,1);if(typeof w.v==='function')return w.v.apply(w,[row].concat(keys));for(var i=0;i<keys.length;i++){var k=keys[i];if(row&&row[k]!==undefined&&row[k]!==null&&row[k]!=='')return row[k];}return '';}
function records(name){if(typeof w.records==='function')return w.records(name)||[];var s=w.state||{};return (s.snapshot&&s.snapshot[name])||[];}
function toast(msg,bad){if(typeof w.toast==='function')w.toast(msg,bad);}
function nowIso(){if(typeof w.now==='function')return w.now();return new Date().toISOString();}
function userName(id){
  if(typeof w.userName==='function'){var n=w.userName(id);if(n)return n;}
  var u=records('users').find(function(r){return String(v(r,'User ID','userId','id'))===String(id);});
  return u?text(v(u,'Display Name','Email'))||'User':'User';
}
function activeUsers(){
  var rows=records('users');
  if(typeof w.activeRows==='function'){try{rows=w.activeRows(rows);}catch(_){}}
  return rows.filter(function(r){return v(r,'User ID','userId','id');});
}
function assigneeOf(ev){
  var single=text(v(ev,'Assigned User ID'));
  if(single)return single;
  var arr=v(ev,'Assigned User IDs');
  if(Array.isArray(arr)){for(var i=0;i<arr.length;i++){if(text(arr[i]))return text(arr[i]);}}
  return '';
}

var DAY_NAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var weekOffset=0; // weeks away from the current week
var dragEventId='';

function startOfWeek(offset){
  var d=new Date();d.setHours(0,0,0,0);
  var monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7)+offset*7);
  return monday;
}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function fmtTime(d){
  var h=d.getHours(),m=d.getMinutes(),ap=h>=12?'PM':'AM';h=h%12||12;
  return h+(m?':'+String(m).padStart(2,'0'):'')+' '+ap;
}
function weekEvents(monday){
  var end=new Date(monday);end.setDate(monday.getDate()+7);
  return records('scheduleEvents').map(function(ev){
    var start=new Date(v(ev,'Start Time'));
    return {ev:ev,start:start,ok:Number.isFinite(start.getTime())};
  }).filter(function(x){return x.ok&&x.start>=monday&&x.start<end;});
}

var styleDone=false;
function ensureStyle(){
  if(styleDone||typeof document==='undefined')return;styleDone=true;
  var st=document.createElement('style');st.id='h38WeekGridStyles';
  st.textContent=[
    '.h38-wg{margin-bottom:16px}',
    '.h38-wg-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:8px}',
    '.h38-wg-head .actions{display:flex;gap:6px;align-items:center}',
    '.h38-wg-head button{min-height:40px;padding:6px 12px}',
    '.h38-wg-scroll{overflow-x:auto}',
    '.h38-wg-grid{display:grid;gap:8px;min-width:980px}',
    '.h38-wg-col{border:1px solid var(--border,#e2e2e2);border-radius:12px;background:var(--card,#fff);display:flex;flex-direction:column;min-width:0}',
    '.h38-wg-colhead{padding:10px 12px;font-weight:700;border-bottom:1px solid var(--border,#e2e2e2);position:sticky;top:0;background:inherit;border-radius:12px 12px 0 0}',
    '.h38-wg-day{border-bottom:1px dashed var(--border,#e8e8e8);padding:8px;min-height:64px}',
    '.h38-wg-day:last-child{border-bottom:none}',
    '.h38-wg-day.dragover{outline:2px dashed #2f6fed;outline-offset:-2px;background:rgba(47,111,237,.06)}',
    '.h38-wg-day.today{background:rgba(47,111,237,.05)}',
    '.h38-wg-daylabel{font-size:.8em;font-weight:700;opacity:.75;margin-bottom:6px}',
    '.h38-wg-chip{display:block;width:100%;text-align:left;border:1px solid var(--border,#d8d8d8);border-left:4px solid #2f6fed;border-radius:8px;background:#fff;padding:6px 8px;margin-bottom:6px;cursor:grab;font-size:.9em;line-height:1.25}',
    '.h38-wg-chip:active{cursor:grabbing}',
    '.h38-wg-chip.dragging{opacity:.45}',
    '.h38-wg-chip .t{font-weight:700}',
    '.h38-wg-empty{font-size:.8em;opacity:.45;padding:2px 0}',
    '.h38-wg-hint{font-size:.85em;opacity:.7}'
  ].join('');
  document.head.appendChild(st);
}

function columns(monday){
  var users=activeUsers().map(function(u){return {id:String(v(u,'User ID','userId','id')),name:text(v(u,'Display Name','Email'))||userName(v(u,'User ID','userId','id'))};});
  var seen={};users.forEach(function(u){seen[u.id]=true;});
  weekEvents(monday).forEach(function(x){
    var a=assigneeOf(x.ev);
    if(a&&!seen[a]){seen[a]=true;users.push({id:a,name:userName(a)});}
  });
  return [{id:'',name:'Unassigned'}].concat(users);
}

function gridHTML(){
  var monday=startOfWeek(weekOffset);
  var sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
  var items=weekEvents(monday);
  var cols=columns(monday);
  var today=new Date();
  var range=MONTHS[monday.getMonth()]+' '+monday.getDate()+' – '+(monday.getMonth()===sunday.getMonth()?String(sunday.getDate()):MONTHS[sunday.getMonth()]+' '+sunday.getDate())+', '+sunday.getFullYear();
  var html='<section class="card h38-wg" id="h38WeekGrid"><div class="h38-wg-head"><h2 style="margin:0">Week grid — '+esc(range)+'</h2>'+
    '<div class="actions"><button type="button" class="secondary" data-wg-nav="-1">← Prev week</button>'+
    '<button type="button" class="secondary" data-wg-nav="0">This week</button>'+
    '<button type="button" class="secondary" data-wg-nav="1">Next week →</button></div></div>'+
    '<p class="h38-wg-hint">One column per person. One drag does both: drop a job on another day to reschedule it, in another person\u2019s column to reassign it — day and person save together in the one drop. Press Esc mid-drag to cancel (nothing changes). The phone Schedule shows the same records.</p>'+
    '<div class="h38-wg-scroll"><div class="h38-wg-grid" style="grid-template-columns:repeat('+cols.length+',1fr)">';
  cols.forEach(function(col){
    html+='<div class="h38-wg-col"><div class="h38-wg-colhead">'+esc(col.name)+'</div>';
    for(var d=0;d<7;d++){
      var day=new Date(monday);day.setDate(monday.getDate()+d);
      var dayItems=items.filter(function(x){
        return sameDay(x.start,day)&&assigneeOf(x.ev)===col.id;
      }).sort(function(a,b){return a.start-b.start;});
      html+='<div class="h38-wg-day'+(sameDay(day,today)?' today':'')+'" data-wg-user="'+esc(col.id)+'" data-wg-date="'+day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0')+'">'+
        '<div class="h38-wg-daylabel">'+DAY_NAMES[d]+' '+MONTHS[day.getMonth()]+' '+day.getDate()+'</div>';
      if(dayItems.length){
        dayItems.forEach(function(x){
          var ev=x.ev,id=String(v(ev,'Schedule Event ID'));
          var end=new Date(v(ev,'End Time'));
          var when=fmtTime(x.start)+(Number.isFinite(end.getTime())?'–'+fmtTime(end):'');
          html+='<button type="button" class="h38-wg-chip" draggable="true" data-wg-event="'+esc(id)+'" title="'+esc(v(ev,'Location'))+'"><span class="t">'+esc(when)+'</span><br>'+esc(v(ev,'Title'))+'</button>';
        });
      }else{
        html+='<div class="h38-wg-empty">—</div>';
      }
      html+='</div>';
    }
    html+='</div>';
  });
  html+='</div></div></section>';
  return html;
}

var moveInFlight={};
async function moveEvent(eventId,targetUser,targetDateStr){
  if(moveInFlight[eventId])return; // one drop = one write; ignore re-entrant drops
  var ev=records('scheduleEvents').find(function(r){return String(v(r,'Schedule Event ID'))===String(eventId);});
  if(!ev){toast('That event is no longer on the schedule.',true);return;}
  var start=new Date(v(ev,'Start Time'));
  if(!Number.isFinite(start.getTime())){toast('That event needs a date first — set one in the list below.',true);return;}
  var parts=targetDateStr.split('-').map(Number);
  var newStart=new Date(start);
  newStart.setFullYear(parts[0],parts[1]-1,parts[2]);
  // No-op drop (same day AND same person): write nothing, so a stray
  // drop can never create a duplicate or partial update.
  if(sameDay(newStart,start)&&assigneeOf(ev)===targetUser){
    toast('Already there — nothing changed.');
    return;
  }
  var end=new Date(v(ev,'End Time'));
  var updated=Object.assign({},ev);
  updated['Start Time']=newStart.toISOString();
  if(Number.isFinite(end.getTime())){
    updated['End Time']=new Date(end.getTime()+(newStart.getTime()-start.getTime())).toISOString();
  }
  updated['Assigned User ID']=targetUser;
  // Mirror the array representation when the record carries one
  // (field-operations-ui moveEvent precedent) so every other view —
  // dispatch board, phone list, field projection — reads the same
  // single assignee after this one write.
  if(Object.prototype.hasOwnProperty.call(ev,'Assigned User IDs')){
    updated['Assigned User IDs']=targetUser?[targetUser]:[];
  }
  updated['Updated Time']=nowIso();
  moveInFlight[eventId]=true;
  try{
    await w.queueOperation('SAVE_SCHEDULE','Schedule Event',eventId,{
      scheduleEventId:eventId,
      relatedRecordId:String(v(ev,'Related Record ID','Job ID')||''),
      assignedUserId:targetUser,
      startTime:updated['Start Time'],
      endTime:updated['End Time'],
      title:String(v(ev,'Title')||''),
      location:String(v(ev,'Location')||''),
      status:String(v(ev,'Status')||'Scheduled'),
      notes:String(v(ev,'Notes')||'')
    },{collection:'scheduleEvents',record:updated,idKeys:['Schedule Event ID']});
    toast('Schedule updated — '+text(v(ev,'Title'))+' moved to '+DAY_NAMES[(newStart.getDay()+6)%7]+' '+MONTHS[newStart.getMonth()]+' '+newStart.getDate()+(targetUser?', '+userName(targetUser):', unassigned')+'.');
    if(typeof w.renderSchedule==='function')w.renderSchedule();
  }catch(e){
    toast((e&&e.message)||String(e),true);
  }finally{
    delete moveInFlight[eventId];
  }
}

function bindGrid(section){
  section.querySelectorAll('[data-wg-nav]').forEach(function(btn){
    btn.onclick=function(){
      var n=Number(btn.getAttribute('data-wg-nav'));
      weekOffset=n===0?0:weekOffset+n;
      mount();
    };
  });
  section.querySelectorAll('.h38-wg-chip').forEach(function(chip){
    chip.addEventListener('dragstart',function(e){
      dragEventId=chip.getAttribute('data-wg-event')||'';
      chip.classList.add('dragging');
      try{e.dataTransfer.setData('text/plain',dragEventId);e.dataTransfer.effectAllowed='move';}catch(_){}
    });
    // dragend fires for completed AND cancelled/Escaped drags alike:
    // it only clears drag state — a cancelled drag writes nothing.
    chip.addEventListener('dragend',function(){
      dragEventId='';
      chip.classList.remove('dragging');
      section.querySelectorAll('.h38-wg-day.dragover').forEach(function(c){c.classList.remove('dragover');});
    });
  });
  section.querySelectorAll('.h38-wg-day').forEach(function(cell){
    cell.addEventListener('dragover',function(e){e.preventDefault();cell.classList.add('dragover');try{e.dataTransfer.dropEffect='move';}catch(_){}});
    cell.addEventListener('dragleave',function(){cell.classList.remove('dragover');});
    cell.addEventListener('drop',function(e){
      e.preventDefault();cell.classList.remove('dragover');
      var id=dragEventId;
      try{id=e.dataTransfer.getData('text/plain')||id;}catch(_){}
      if(!id)return;
      moveEvent(id,cell.getAttribute('data-wg-user')||'',cell.getAttribute('data-wg-date')||'');
    });
  });
}

function mount(){
  if(typeof document==='undefined')return;
  // weekOffset lives in the module, so it survives the re-render that
  // follows a drag-save: the owner stays on the week they were planning.
  // The "This week" button is the explicit way back.
  if(window.innerWidth<1024)return; // desktop surface only; phone list is unchanged
  var main=document.getElementById('mainContent');
  if(!main||!main.querySelector('.calendar-list'))return; // not the Schedule page
  ensureStyle();
  var old=document.getElementById('h38WeekGrid');
  if(old)old.remove();
  var anchor=main.querySelector('.grid');
  var wrap=document.createElement('div');
  wrap.innerHTML=gridHTML();
  var section=wrap.firstElementChild;
  if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(section,anchor);
  else main.appendChild(section);
  bindGrid(section);
}

// Wrap the canonical Schedule renderer (same pattern as route-optimization).
function wire(){
  if(typeof window==='undefined'||typeof window.renderSchedule!=='function')return;
  var base=window.renderSchedule;
  if(base.__h38WeekGridWrapped)return;
  var wrapped=function(){
    var r=base.apply(this,arguments);
    try{mount();}catch(e){console.warn('[H38 week grid] mount failed:',e);}
    return r;
  };
  wrapped.__h38WeekGridWrapped=true;
  window.renderSchedule=wrapped;
}
wire();
if(typeof window!=='undefined')window.H38WeekGrid={mount:mount,moveEvent:moveEvent,assigneeOf:assigneeOf,BUILD:BUILD};
if(typeof module!=='undefined'&&module.exports){module.exports={BUILD:BUILD,assigneeOf:assigneeOf};}
})();
