/** Public web-app entry points for the integrated Quote Builder AI controls. */
function boBuildAiQuoteDraft(payload){
  payload = payload || {};
  boGuardApiRequest_('prepareAiQuoteDraft',payload);
  return boQuoteBuilderPreserveRequiredScope_(boBuildAiQuoteDraft_(payload), payload);
}

function boQuoteBuilderPreserveRequiredScope_(result, payload) {
  result = result || {};
  payload = payload || {};
  let draft = result.draft;
  let stagedDetails = {};
  if (result.staged && result.staged.Details) {
    try { stagedDetails = JSON.parse(result.staged.Details || '{}'); } catch (error) { stagedDetails = {}; }
  }
  if (!draft || typeof draft !== 'object') draft = stagedDetails;
  if (!draft || typeof draft !== 'object') return result;

  const required = boQuoteBuilderRequiredScopeItems_(payload);
  const lines = Array.isArray(draft.suggestedLines) ? draft.suggestedLines.slice() : [];
  const added = [];
  required.forEach(function (item) {
    if (boQuoteBuilderScopeItemRepresented_(item, lines)) return;
    const source = boQuoteBuilderScopeSourceLine_(item, lines);
    const line = {
      catalogId:'',
      description:boQuoteBuilderScopeDescription_(item),
      quantity:source && Number(source.quantity) > 0 ? Number(source.quantity) : 1,
      unit:source && source.unit ? source.unit : boQuoteBuilderScopeUnit_(item),
      rate:'',
      priceStatus:'manual_entry_required',
      confidence:'high',
      evidence:'Explicitly entered by the user and preserved as required scope. Quantity and price require owner review.',
      searchQuery:item
    };
    lines.push(line);
    added.push(line.description);
  });

  draft.suggestedLines = lines;
  draft.requiredScopeItems = required;
  draft.requiredScopeAdded = added;
  result.draft = draft;

  if (result.staged) {
    stagedDetails.suggestedLines = lines;
    stagedDetails.requiredScopeItems = required;
    stagedDetails.requiredScopeAdded = added;
    result.staged.Details = JSON.stringify(stagedDetails);
    const activityId = result.staged['Activity ID'] || '';
    if (activityId && added.length && typeof boUpdateRecord_ === 'function' && typeof H38_BO_SHEETS !== 'undefined') {
      try {
        boUpdateRecord_(H38_BO_SHEETS.ACTIVITY, activityId, {
          Details:result.staged.Details,
          Status:'Owner Review Required'
        }, 'Preserve explicitly typed Quote Builder scope');
      } catch (error) {
        console.log('Typed scope activity update: ' + error.message);
      }
    }
  }
  return result;
}

function boQuoteBuilderRequiredScopeItems_(payload) {
  payload = payload || {};
  const raw = [];
  if (Array.isArray(payload.requiredScopeItems)) {
    payload.requiredScopeItems.forEach(function (item) { if (String(item || '').trim()) raw.push(String(item)); });
  }
  if (String(payload.scope || '').trim()) raw.push(String(payload.scope));

  const notes = String(payload.notes || '');
  const beforeMethod = notes.split(/ESTIMATING METHOD FOR THIS INTERNAL DRAFT:/i)[0];
  beforeMethod.split(/\r?\n/).forEach(function (line) {
    const text = String(line || '').trim();
    if (!text) return;
    const match = text.match(/^(?:Scope|Field description|Customer notes|Field notes|Internal notes|Requested work|Work requested)\s*:\s*(.+)$/i);
    if (match && match[1]) raw.push(match[1]);
  });
  if (!raw.length && beforeMethod.trim()) raw.push(beforeMethod.trim());

  const items = [];
  const seen = {};
  raw.forEach(function (text) {
    boQuoteBuilderSplitRequiredScopeText_(text).forEach(function (item) {
      const key = boQuoteBuilderScopeCanonicalText_(item);
      if (!key || seen[key] || !boQuoteBuilderLooksLikeScopeItem_(item)) return;
      seen[key] = true;
      items.push(item);
    });
  });
  return items;
}

function boQuoteBuilderSplitRequiredScopeText_(text) {
  const verbs = '(?:add|install|replace|remove|repair|clean|build|paint|seal|supply|provide|furnish|dispose|haul|trim|grade|excavate|demolish|inspect|service|restore|reconfigure|relocate|connect|mount|apply|include|including|reinstall|upgrade)';
  let prepared = String(text || '')
    .replace(/[•·]/g, ';')
    .replace(/([.!?])\s+/g, '$1\n')
    .replace(new RegExp(',\\s+(?=' + verbs + '\\b)', 'gi'), '\n')
    .replace(new RegExp('\\s+(?:and|plus|also)\\s+(?=' + verbs + '\\b)', 'gi'), '\n');
  const items = [];
  prepared.split(/\r?\n|;/).forEach(function (part) {
    let item = String(part || '')
      .replace(/^[-–—*\d.)\s]+/, '')
      .replace(/^(?:and|plus|also)\s+/i, '')
      .replace(/[.!?]+$/, '')
      .trim();
    if (!item) return;
    if (item.indexOf(',') >= 0 && !new RegExp('\\b' + verbs + '\\b', 'i').test(item)) {
      const pieces = item.split(',').map(function (piece) { return piece.trim(); }).filter(Boolean);
      if (pieces.length > 1 && pieces.every(function (piece) { return piece.split(/\s+/).length <= 8; })) {
        pieces.forEach(function (piece) { items.push(piece); });
        return;
      }
    }
    items.push(item);
  });
  return items;
}

function boQuoteBuilderLooksLikeScopeItem_(item) {
  const text = String(item || '').trim();
  if (text.length < 3) return false;
  if (/^(?:known dimensions?|assumptions?|measurement|reference|door with window)\b/i.test(text)) return false;
  if (/^\d+(?:\.\d+)?\s*(?:inches?|in\.?|feet|foot|ft\.?|yards?|yd\.?)\b/i.test(text)) return false;
  return true;
}

function boQuoteBuilderScopeCanonicalText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(?:leaf|gutter)\s*guards?\b|\bgutter\s*protection\b|\bleaf\s*protection\b/g, ' gutterguard ')
    .replace(/\bdownspouts?\b|\bdrainpipes?\b/g, ' downspout ')
    .replace(/\bguttering\b|\bgutters?\b/g, ' gutter ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function boQuoteBuilderScopeLineText_(line) {
  line = line || {};
  return boQuoteBuilderScopeCanonicalText_([
    line.description || '',
    line.searchQuery || '',
    line.evidence || '',
    line.catalogId || ''
  ].join(' '));
}

function boQuoteBuilderScopeItemRepresented_(item, lines) {
  const required = boQuoteBuilderScopeCanonicalText_(item);
  const combined = (lines || []).map(boQuoteBuilderScopeLineText_).join(' ');
  if (!required) return true;
  if (/\bgutterguard\b/.test(required)) return /\bgutterguard\b/.test(combined);
  if (/\bdownspout\b/.test(required) && !/\bgutter\b/.test(required.replace(/\bdownspout\b/g, ''))) return /\bdownspout\b/.test(combined);

  const stop = {
    a:1,an:1,the:1,all:1,new:1,existing:1,current:1,visible:1,requested:1,work:1,scope:1,
    add:1,install:1,replace:1,remove:1,repair:1,clean:1,build:1,paint:1,seal:1,supply:1,provide:1,
    furnish:1,dispose:1,haul:1,trim:1,grade:1,excavate:1,demolish:1,inspect:1,service:1,restore:1,
    reconfigure:1,relocate:1,connect:1,mount:1,apply:1,include:1,including:1,reinstall:1,upgrade:1,
    with:1,for:1,to:1,of:1,on:1,at:1,in:1,and:1,plus:1,also:1,any:1
  };
  const tokens = required.split(' ').filter(function (token) { return token && !stop[token]; });
  if (!tokens.length) return true;
  return tokens.every(function (token) { return combined.indexOf(token) >= 0; });
}

function boQuoteBuilderScopeSourceLine_(item, lines) {
  const required = boQuoteBuilderScopeCanonicalText_(item);
  if (!/\bgutterguard\b/.test(required)) return null;
  return (lines || []).find(function (line) {
    const text = boQuoteBuilderScopeLineText_(line);
    return /\bgutter\b/.test(text) && !/\bgutterguard\b/.test(text) && Number(line.quantity) > 0;
  }) || null;
}

function boQuoteBuilderScopeDescription_(item) {
  const text = String(item || '').replace(/^(?:Scope|Requested work|Work requested)\s*:\s*/i, '').trim().slice(0, 220);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Required scope item';
}

function boQuoteBuilderScopeUnit_(item) {
  const text = boQuoteBuilderScopeCanonicalText_(item);
  if (/\bgutterguard\b|\bgutter\b/.test(text)) return 'linear foot';
  if (/\bdownspout\b/.test(text)) return 'each';
  return 'job';
}

function boCreateAiCompletionVisual(payload){
  boGuardApiRequest_('prepareAiQuoteDraft',payload||{});
  return boCreateAiCompletionVisual_(payload||{});
}
