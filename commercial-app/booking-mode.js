(function(){
'use strict';
// H38 Online Booking Mode (2026-11-02, build 20261102-bookingmode-1).
// Improvement wave WS4: Settings card that lets the business choose how
// customer-portal booking works:
//   - "request" (default, long-standing behavior): the customer sends a
//     request with a preferred date/time and the office confirms by
//     phone. Nothing about that path changes.
//   - "confirmed": the customer picks a real open slot inside the
//     business's own hours (Business Hours card) and is booked on the
//     spot — the booking lands on the Schedule as a schedule event.
// Stored on the existing business_module_settings row "online_booking"
// (enabled + config {mode, slotMinutes}), the same store and upsert the
// Business Hours card uses. The portal function reads it server-side.
var BUILD='20261102-bookingmode-1';
var MODULE_KEY='online_booking';
var w=typeof window!=='undefined'?window:globalThis;
function text(x){return String(x==null?'':x).trim();}
function esc(s){return text(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function toast(msg,bad){if(typeof w.toast==='function')w.toast(msg,bad);}
function snapshot(){return (w.state&&w.state.snapshot)||{};}
function moduleRow(){
  var list=snapshot().moduleSettings||[];
  for(var i=0;i<list.length;i++){
    if(text(list[i].moduleKey||list[i].module_key)===MODULE_KEY)return list[i];
  }
  return null;
}
function current(){
  var row=moduleRow();
  var cfg=(row&&row.config)||{};
  var slot=Number(cfg.slotMinutes);
  return {
    enabled:!!(row&&row.enabled===true),
    mode:cfg.mode==='confirmed'?'confirmed':'request',
    slotMinutes:[30,60,90,120].indexOf(slot)>=0?slot:60
  };
}
function canManage(){
  var role=text(snapshot().user&&snapshot().user.roleName).toLowerCase();
  return role==='owner'||role==='administrator';
}
async function save(next){
  if(!canManage())throw new Error('Only a business owner or administrator can change booking settings.');
  var api=w.H38_SUPABASE_SHARED_CLIENT&&typeof w.H38_SUPABASE_SHARED_CLIENT.ensure==='function'
    ? w.H38_SUPABASE_SHARED_CLIENT.ensure():null;
  if(!api)throw new Error('Secure settings connection is unavailable.');
  var businessId=text(w.state&&w.state.businessId);
  if(!businessId)throw new Error('Open a business first.');
  var row=moduleRow();
  var cfg=Object.assign({},(row&&row.config)||{},{mode:next.mode,slotMinutes:next.slotMinutes});
  var result=await api.from('business_module_settings').upsert(
    {business_id:businessId,module_key:MODULE_KEY,enabled:next.enabled,config:cfg,updated_at:new Date().toISOString()},
    {onConflict:'business_id,module_key'});
  if(result.error)throw result.error;
  var snap=snapshot();
  if(!Array.isArray(snap.moduleSettings))snap.moduleSettings=[];
  var out={business_id:businessId,module_key:MODULE_KEY,moduleKey:MODULE_KEY,enabled:next.enabled,config:cfg};
  var i=snap.moduleSettings.findIndex(function(r){return text(r.moduleKey||r.module_key)===MODULE_KEY;});
  if(i>=0)snap.moduleSettings[i]=out;else snap.moduleSettings.push(out);
}
function cardHtml(){
  var c=current();
  var dis=canManage()?'':' disabled';
  return '<section class="card span6" id="h38BookingModeCard"><h2>Online booking</h2>'+
    '<p class="muted small">How customers book from their portal page. Bookable times come from your Business Hours (card above) — days you are closed are never offered.</p>'+
    '<label><input type="checkbox" data-bk-enabled'+(c.enabled?' checked':'')+dis+'> Online booking is on</label>'+
    '<label>Booking style</label><select data-bk-mode'+dis+'>'+
      '<option value="request"'+(c.mode==='request'?' selected':'')+'>Requests — customer asks, we confirm by phone</option>'+
      '<option value="confirmed"'+(c.mode==='confirmed'?' selected':'')+'>Confirmed slots — customer picks a real open time</option>'+
    '</select>'+
    '<label>Slot length</label><select data-bk-slot'+dis+'>'+
      [30,60,90,120].map(function(m){return '<option value="'+m+'"'+(c.slotMinutes===m?' selected':'')+'>'+m+' minutes</option>';}).join('')+
    '</select>'+
    '<div class="actions"><button type="button" data-bk-save'+dis+'>Save booking settings</button></div>'+
    (canManage()?'<p class="muted small">Confirmed bookings appear on your Schedule right away. Requests keep working exactly as before when you choose Requests.</p>'
                :'<p class="muted small">Only an owner or administrator can change booking settings.</p>')+
    '</section>';
}
function mount(){
  if(typeof document==='undefined')return;
  var anchor=document.getElementById('businessHoursSection');
  if(!anchor||document.getElementById('h38BookingModeCard'))return;
  var card=anchor.closest?anchor.closest('section'):anchor.parentElement;
  if(!card||!card.parentNode)return;
  var wrap=document.createElement('div');
  wrap.innerHTML=cardHtml();
  var section=wrap.firstElementChild;
  card.parentNode.insertBefore(section,card.nextSibling);
  var btn=section.querySelector('[data-bk-save]');
  if(btn)btn.onclick=async function(){
    btn.disabled=true;
    try{
      await save({
        enabled:section.querySelector('[data-bk-enabled]').checked,
        mode:section.querySelector('[data-bk-mode]').value,
        slotMinutes:Number(section.querySelector('[data-bk-slot]').value)
      });
      toast('Booking settings saved.');
    }catch(e){
      toast((e&&e.message)||String(e),true);
    }
    btn.disabled=false;
  };
}
function wire(){
  if(typeof window==='undefined'||typeof window.renderSettings!=='function')return;
  var base=window.renderSettings;
  if(base.__h38BookingModeWrapped)return;
  var wrapped=function(){
    var r=base.apply(this,arguments);
    try{mount();}catch(e){console.warn('[H38 booking mode] mount failed:',e);}
    return r;
  };
  wrapped.__h38BookingModeWrapped=true;
  window.renderSettings=wrapped;
}
wire();
if(typeof window!=='undefined')window.H38BookingMode={mount:mount,BUILD:BUILD};
if(typeof module!=='undefined'&&module.exports){module.exports={BUILD:BUILD};}
})();
