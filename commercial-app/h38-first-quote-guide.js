/* ---- First-Quote Guidance (2026-10-10) ----
 * Non-blocking checklist + "what's next" for a user's first 2-3 quotes.
 * Ricky's direction: "The first couple quotes someone does can you help
 * them with what's next or do we need to restructure for a better flow"
 *
 * Rules:
 * - AI assists, never gates: everything works manually, guidance is advisory.
 * - Never auto-sends. Owner always reviews and sends.
 * - Shows only when the user has 3 or fewer quotes (first-timer experience).
 * - Detects $0 / no-line drafts and explains what's missing (not an error).
 */
(function(){
'use strict';

/* How many quotes has this user created? (all statuses) */
function h38QuoteCount(){
  try{
    const all=records('quotes')||[];
    return all.length;
  }catch(e){ return 99; } // fail safe: don't show guide if we can't count
}

/* Show guidance for first 3 quotes */
function h38IsNewQuoter(){
  return h38QuoteCount()<=3;
}

/* Checklist state from the current draft in state.quote */
function h38ChecklistState(){
  const q=(typeof state!=='undefined'&&state.quote)||{};
  const lines=q.tierMode
    ? (q.tiers||[]).reduce((n,t)=>n+((t.items||[]).length),0)
    : ((q.lines||[]).length);
  const total=q.tierMode
    ? (q.tiers&&q.tiers[1] ? h38TierTotal(q.tiers[1]) : 0)
    : (q.lines||[]).reduce((s,l)=>s+num(l.quantity)*num(l.unitPrice),0);
  return {
    scope: !!(q.scope&&String(q.scope).trim()),
    measurements: !!(q.measurementNotes&&String(q.measurementNotes).trim()),
    lines: lines>0,
    lineCount: lines,
    total: total,
    hasPrices: total>0,
    photos: !!((q.attachments&&q.attachments.length)||(q.photoIds&&q.photoIds.length))
  };
}

/* What's the single most useful next step? */
function h38NextStep(){
  const s=h38ChecklistState();
  if(!s.scope) return {
    key:'scope',
    label:'Describe the scope',
    detail:'Write a sentence or two about the work in the Scope box above.'
  };
  if(!s.lines) return {
    key:'lines',
    label:'Add line items',
    detail:'Add your first line: describe the work, set quantity and unit price. Or use the price book on the right.'
  };
  if(!s.hasPrices) return {
    key:'prices',
    label:'Add prices to your lines',
    detail:'Your lines are in but the total is $0. Fill in the unit price on each line.'
  };
  if(!s.measurements) return {
    key:'measurements',
    label:'Add measurements (optional)',
    detail:'Jot down dimensions or site notes — it helps at review time.'
  };
  return {
    key:'review',
    label:'Preview and send',
    detail:'Looks complete. Preview the quote, review every line, then send it when you are ready. Nothing sends on its own.'
  };
}

/* Render the guidance card HTML. Returns '' when not a new quoter. */
function h38RenderGuide(){
  if(!h38IsNewQuoter()) return '';
  const s=h38ChecklistState();
  const next=h38NextStep();
  const step=(done,label)=>`<div class="h38-guide-step${done?' done':''}"><span class="h38-guide-check">${done?'✓':'○'}</span><span>${esc(label)}</span></div>`;
  const emptyDraft=!s.lines||!s.hasPrices;
  return `<section class="card h38-first-quote-guide" id="firstQuoteGuide">
    <h2>Your first quotes — step by step</h2>
    <p class="muted small">Follow along; nothing here blocks you. Every step works by hand.</p>
    <div class="h38-guide-steps">
      ${step(s.scope,'Describe the scope of work')}
      ${step(s.measurements,'Add measurements & site notes')}
      ${step(s.lines,'Add line items with prices')}
      ${step(s.photos,'Add photos (recommended)')}
      ${step(s.lines&&s.hasPrices,'Preview, review, then send')}
    </div>
    <div class="h38-guide-next">
      <strong>Next: ${esc(next.label)}.</strong>
      <p class="muted small">${esc(next.detail)}</p>
    </div>
    ${emptyDraft?`<div class="notice">
      <strong>Heads up:</strong> this draft ${!s.lines?'has no line items yet':'totals $0'}.
      That's fine for a draft — add lines and prices when you're ready, then save again.
      <div class="row-actions" style="margin-top:8px">
        <button type="button" class="secondary" id="kitHelpQuoteBtn">Ask Kit to draft the lines</button>
      </div>
      <p class="muted small" style="margin:6px 0 0">Kit drafts from your scope text and the price book. You review every line before it goes in — nothing is final until you say so.</p>
    </div>`:''}
  </section>`;
}

/* Wire the "Ask Kit" button. Called after render. */
function h38WireGuide(){
  const btn=$('kitHelpQuoteBtn');
  if(!btn||btn.dataset.wired) return;
  btn.dataset.wired='1';
  btn.onclick=async ()=>{
    const q=(typeof state!=='undefined'&&state.quote)||{};
    const scopeText=[q.projectTitle,q.scope,q.measurementNotes].filter(Boolean).join('\n');
    if(!scopeText.trim()){ toast('Describe the scope first — Kit needs something to work from.',true); return; }
    if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.runTask!=='function'){
      toast('AI helper is not available right now. Add lines by hand — everything works manually.',true);
      return;
    }
    btn.disabled=true; btn.textContent='Kit is drafting…';
    try{
      const result=await window.H38_AI_HANDOFF.runTask('quote_build',{
        projectTitle:q.projectTitle||'',
        scope:q.scope||'',
        measurementNotes:q.measurementNotes||'',
        businessId:state.businessId
      });
      const lines=(result&&(result.draft&&result.draft.suggestedLines))||result.suggestedLines||[];
      if(!lines.length) throw new Error('Kit returned no lines.');
      // Stage as reviewable suggestions — do NOT auto-insert into the quote.
      // Show them in a confirm dialog; owner picks which to add.
      const preview=lines.slice(0,12).map((l,i)=>`${i+1}. ${l.description||'Suggested work'} — ${l.quantity||1} × $${num(l.unitPrice||0).toFixed(2)}`).join('\n');
      const extra=lines.length>12?`\n…plus ${lines.length-12} more.`:'';
      if(confirm(`Kit drafted ${lines.length} line(s) from your scope. Review:\n\n${preview}${extra}\n\nAdd all ${lines.length} to the quote as draft lines? You can edit or remove any of them.`)){
        lines.forEach(l=>{
          (state.quote.lines=state.quote.lines||[]).push({
            quoteLineId:newId('QUOTE-LINE'),
            description:String(l.description||'Suggested work'),
            quantity:Math.max(0.01,num(l.quantity||1)),
            unit:String(l.unit||'each'),
            unitPrice:num(l.unitPrice||0),
            priceSource:'Kit draft — owner review required',
            priceStatus:'Owner review required'
          });
        });
        if(typeof renderQuoteLines==='function') renderQuoteLines();
        toast(`${lines.length} draft line(s) added. Review prices before saving.`);
      }
    }catch(err){
      toast('Kit could not draft lines: '+(err&&err.message||err)+'. Add them by hand — nothing is blocked.',true);
    }finally{
      btn.disabled=false; btn.textContent='Ask Kit to draft the lines';
    }
  };
}

/* Call after saveQuote completes: toast the next step when the draft is thin. */
function h38AfterSave(total,lineCount){
  if(!h38IsNewQuoter()) return;
  const next=h38NextStep();
  if(!lineCount||!total){
    // The save toast already fired; add guidance as a second toast.
    setTimeout(()=>{
      toast(`Saved. Next: ${next.label} — ${next.detail}`,false);
    },600);
  }
}

/* Expose for app-06.js integration */
window.H38FirstQuoteGuide={
  isNewQuoter:h38IsNewQuoter,
  render:h38RenderGuide,
  wire:h38WireGuide,
  afterSave:h38AfterSave,
  nextStep:h38NextStep,
  checklistState:h38ChecklistState
};
})();
