/** Deterministic Price Book-first resolution for mobile AI quote lines. */

function boQuoteBuilderPriceNormalize_(value) {
  return boNormalizeText_(value).toLowerCase().replace(/(\d)\s*[-–]\s*(inch|inches|in|foot|feet|ft)\b/g, '$1 $2').replace(/[^a-z0-9]+/g, ' ').trim();
}

function boQuoteBuilderPriceTokens_(value) {
  const stop = {
    a:1, an:1, and:1, are:1, as:1, at:1, be:1, by:1, for:1, from:1, in:1, into:1, is:1, it:1,
    of:1, on:1, or:1, per:1, the:1, this:1, to:1, with:1, work:1, scope:1, project:1, existing:1,
    replace:1, replacement:1, install:1, installed:1, installation:1, material:1, materials:1, labor:1,
    white:1, visible:1, related:1, component:1, components:1, required:1, typical:1, local:1, price:1,
    approximate:1, length:1, remove:1, new:1, including:1
  };
  const seen = {};
  return boQuoteBuilderPriceNormalize_(value).split(/\s+/).map(function (token) {
    if (token.length > 4 && /s$/.test(token) && !/ss$/.test(token)) token = token.slice(0, -1);
    return token;
  }).filter(function (token) {
    if (!token || token.length < 3 || stop[token] || seen[token]) return false;
    seen[token] = true;
    return true;
  });
}

function boQuoteBuilderPriceSemantics_(value) {
  const text = boQuoteBuilderPriceNormalize_(value)
    .replace(/\b(?:leaf|gutter)\s*guards?\b|\bgutter\s*protection\b|\bleaf\s*protection\b/g, ' gutterguard ')
    .replace(/\bdownspouts?\b|\bdrainpipes?\b/g, ' downspout ')
    .replace(/\bguttering\b|\bgutters?\b/g, ' gutter ');
  const gutterGuard = /\bgutterguard\b/.test(text);
  const downspout = /\bdownspout\b/.test(text);
  const gutter = /\bgutter\b/.test(text);
  const downspoutIndex = text.indexOf('downspout');
  const gutterIndex = text.indexOf('gutter');
  let dominant = '';
  if (gutterGuard) dominant = 'gutter_guard';
  else if (downspout && gutter) dominant = downspoutIndex < gutterIndex ? 'downspout' : 'gutter';
  else if (downspout) dominant = 'downspout';
  else if (gutter) dominant = 'gutter';
  return { gutterGuard:gutterGuard, downspout:downspout, gutter:gutter, dominant:dominant };
}

function boQuoteBuilderPriceSemanticsCompatible_(requested, item) {
  requested = requested || {};
  item = item || {};
  if (requested.dominant === 'gutter_guard') return item.gutterGuard === true;
  if (requested.dominant === 'downspout') return item.downspout === true;
  if (requested.dominant === 'gutter') return item.gutter === true && item.gutterGuard !== true && item.dominant !== 'downspout';
  return true;
}

function boQuoteBuilderPriceValue_(item) {
  return Number(String(item['Standard Selling Price'] || item.Price || 0).replace(/[$,]/g, '')) || 0;
}

function boQuoteBuilderPriceSource_(item) {
  const raw = boNormalizeText_(item && item['Catalog Source']);
  if (!raw || raw.charAt(0) !== '{') return {};
  try { return JSON.parse(raw); } catch (error) { return {}; }
}

function boQuoteBuilderNormalizeMobilePriceItem_(item) {
  item = item || {};
  const source = boQuoteBuilderPriceSource_(item);
  const rawName = boNormalizeText_(item.Name);
  const perMatch = rawName.match(/\s*\[per\s+([^\]]+)\]\s*$/i);
  const name = boNormalizeText_(rawName.replace(/\s*\[per\s+[^\]]+\]\s*$/i, '')) || boNormalizeText_(source.description);
  const id = boNormalizeText_(item['Product / Service ID'] || item['Catalog ID']);
  const unit = boNormalizeText_(item.Unit || source.unit || (perMatch && perMatch[1]) || 'each') || 'each';
  const description = boNormalizeText_(item['Customer Description'] || item.Description || source.description || name);
  const price = boQuoteBuilderPriceValue_(item);
  const status = boNormalizeText_(item.Status || (boNormalizeText_(item.Active).toLowerCase() === 'no' ? 'Inactive' : 'Active')) || 'Active';
  return {
    'Product / Service ID': id,
    Name: name,
    Description: description,
    'Customer Description': description,
    Category: boNormalizeText_(item.Category || item.Family || item['Record Type'] || 'Price Book'),
    Unit: unit,
    'Standard Selling Price': price,
    Price: price,
    Status: status,
    'Catalog Source': item['Catalog Source'] || ''
  };
}

function boQuoteBuilderMobilePriceItems_() {
  const items = [];
  const seen = {};
  function add(item) {
    const normalized = boQuoteBuilderNormalizeMobilePriceItem_(item);
    if (!(boQuoteBuilderPriceValue_(normalized) > 0) || boNormalizeText_(normalized.Status).toLowerCase() === 'inactive') return;
    const key = boNormalizeText_(normalized['Product / Service ID']).toLowerCase() || [
      boQuoteBuilderPriceNormalize_(normalized.Name), boQuoteBuilderPriceNormalize_(normalized.Unit)
    ].join('|');
    if (!key || seen[key]) return;
    seen[key] = true;
    items.push(normalized);
  }
  try { (boQuoteBuilderPriceBook_({}) || []).forEach(add); } catch (error) {}
  try { boQuoteBuilderSnapshot_(H38_BO_SHEETS.PRODUCTS, { includeVoided:true }).rows.forEach(add); } catch (error) {}
  return items;
}

function boQuoteBuilderExistingLinePrice_(payload) {
  payload = payload || {};
  const requestedId = boNormalizeText_(payload.catalogId).toLowerCase();
  const primary = boNormalizeText_(payload.description || payload.query);
  const query = boNormalizeText_([primary, payload.query].filter(Boolean).join(' '));
  const normalizedPrimary = boQuoteBuilderPriceNormalize_(primary);
  const normalizedQuery = boQuoteBuilderPriceNormalize_(query);
  const primaryTokens = boQuoteBuilderPriceTokens_(primary);
  const queryTokens = boQuoteBuilderPriceTokens_(query);
  const requestedSemantics = boQuoteBuilderPriceSemantics_(primary || query);
  const items = boQuoteBuilderMobilePriceItems_();
  let best = null;

  items.forEach(function (item) {
    const price = boQuoteBuilderPriceValue_(item);
    if (!(price > 0)) return;
    const itemId = boNormalizeText_(item['Product / Service ID']).toLowerCase();
    const searchableText = [
      item['Product / Service ID'], item.Name, item['Customer Description'], item.Description, item.Category, item.Unit, item['Catalog Source']
    ].join(' ');
    if (!boQuoteBuilderPriceSemanticsCompatible_(requestedSemantics, boQuoteBuilderPriceSemantics_(searchableText))) return;
    if (requestedId && itemId === requestedId) {
      best = { item:item, score:1000, reason:'catalog_id' };
      return;
    }
    if (best && best.score >= 1000) return;
    const name = boQuoteBuilderPriceNormalize_(item.Name || '');
    const customerDescription = boQuoteBuilderPriceNormalize_(item['Customer Description'] || item.Description || '');
    const searchable = boQuoteBuilderPriceNormalize_(searchableText);
    if (!searchable) return;
    const itemTokens = boQuoteBuilderPriceTokens_(searchable);
    const nameTokens = boQuoteBuilderPriceTokens_(name);

    let score = 0;
    let overlaps = 0;
    let primaryOverlaps = 0;
    let strongest = 0;
    if (name.length >= 5 && normalizedPrimary && (normalizedPrimary.indexOf(name) >= 0 || name.indexOf(normalizedPrimary) >= 0)) score += 14;
    if (customerDescription.length >= 8 && normalizedQuery.indexOf(customerDescription) >= 0) score += 10;
    queryTokens.forEach(function (token) {
      if (itemTokens.indexOf(token) < 0) return;
      overlaps += 1;
      if (primaryTokens.indexOf(token) >= 0) primaryOverlaps += 1;
      const weight = token.length >= 8 ? 4 : token.length >= 6 ? 3 : token.length >= 5 ? 2 : 1;
      strongest = Math.max(strongest, weight);
      score += weight;
      if (nameTokens.indexOf(token) >= 0) score += 2;
    });
    const requestedUnit = boQuoteBuilderPriceNormalize_(payload.unit || '');
    const itemUnit = boQuoteBuilderPriceNormalize_(item.Unit || '');
    if (requestedUnit && itemUnit && requestedUnit === itemUnit) score += 2;
    const strongSingle = primaryOverlaps === 1 && strongest >= 3 && score >= 5;
    if (!(score >= 10 || (primaryOverlaps >= 1 && (overlaps >= 2 || strongSingle)))) return;
    if (!best || score > best.score) best = { item:item, score:score, reason:'token_match' };
  });
  return best;
}

function boQuoteBuilderResolveLinePrice(payload) {
  return boSafeExecute_('Resolve mobile AI quote line price', function () {
    boQuoteBuilderRequireAction_('Create');
    boQuoteBuilderRequireAction_('priceBook');
    payload = payload || {};
    const query = boNormalizeText_(payload.query).slice(0, 500);
    boAssert_(query || payload.catalogId, 'A quote line description or catalog ID is required.');
    const match = boQuoteBuilderExistingLinePrice_(payload);
    if (match) {
      boProof_('AUTO MATCH PRICE BOOK', 'Price Book', match.item['Product / Service ID'] || 'MATCH', 'PASS',
        'score=' + match.score + '; reason=' + match.reason + '; query=' + query, boGetActiveEmail_());
      return {
        source:'price_book_match',
        matched:true,
        researched:false,
        catalogId:match.item['Product / Service ID'] || '',
        item:match.item,
        matchScore:match.score,
        matchReason:match.reason,
        finalPriceApproved:false,
        ownerReviewRequired:true
      };
    }
    const learned = boQuoteBuilderAutoLocalPrice({
      query:query,
      market:payload.market || '',
      taxable:payload.taxable === true
    });
    learned.source = 'local_research';
    learned.matched = false;
    learned.researched = true;
    return learned;
  }, 'Price Book', payload && (payload.catalogId || payload.query));
}
