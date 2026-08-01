/** Quote Builder local-price research and learned Price Book entries. */

function boQuoteBuilderResearchLocalPrice(payload) {
  return boSafeExecute_('Quote Builder local price research', function () {
    boQuoteBuilderRequireAction_('Create');
    boQuoteBuilderRequireAction_('priceBook');
    payload = payload || {};
    const query = boNormalizeText_(payload.query).slice(0, 500);
    const market = boNormalizeText_(payload.market || boPackValue_('pricing.defaultMarket', '')).slice(0, 160);
    boAssert_(query, 'Describe the item or service to research.');
    boAssert_(market, 'Enter the city, state, or ZIP code for local pricing.');

    const result = boQuoteBuilderLocalPriceOpenAi_(query, market);
    const researchId = boId_('LOCAL-PRICE');
    result.researchId = researchId;
    result.query = query;
    result.market = result.market || market;
    result.reviewStatus = 'Owner Review Required';
    result.finalPriceApproved = false;
    result.priceBookSaved = false;

    CacheService.getUserCache().put('H38_QB_LOCAL_PRICE:' + researchId, JSON.stringify(result), 1800);
    boAppendRecord_(H38_BO_SHEETS.ACTIVITY, {
      'Activity ID': researchId,
      'Activity Type': 'Local Price Research',
      'Record Type': 'Price Book',
      'Record ID': '',
      Status: 'Owner Review Required',
      Summary: result.itemName + ' — ' + result.market,
      Details: JSON.stringify(result),
      'Created By': boGetCurrentUser_()['User ID'],
      'Created Time': boNow_()
    }, 'Quote Builder local price research');
    boProof_('RESEARCH LOCAL PRICE', 'Price Book', researchId, 'PASS', result.itemName + '; ' + result.market + '; sources=' + result.sources.length, boGetActiveEmail_());
    return result;
  }, 'Price Book', payload && payload.query);
}

function boQuoteBuilderRememberLocalPrice(payload) {
  return boSafeExecute_('Remember Quote Builder local price', function () {
    boQuoteBuilderRequireAction_('Create');
    boQuoteBuilderRequireAction_('priceBook');
    payload = payload || {};
    const researchId = boNormalizeText_(payload.researchId);
    const tier = boNormalizeText_(payload.tier).toLowerCase();
    boAssert_(researchId, 'Local price research ID is required.');
    boAssert_(['low', 'typical', 'high'].indexOf(tier) >= 0, 'Choose the low, typical, or high researched price.');

    const raw = CacheService.getUserCache().get('H38_QB_LOCAL_PRICE:' + researchId);
    boAssert_(raw, 'The local price research expired. Run the search again.');
    const research = JSON.parse(raw);
    const selectedRate = boMoney_(research[tier]);
    boAssert_(selectedRate > 0, 'The selected researched price is not usable.');

    const unit = boNormalizeText_(research.unit || 'each') || 'each';
    const displayName = boNormalizeText_(research.itemName || research.query || 'Locally researched item');
    const storedName = displayName + ' [per ' + unit + ']';
    const sourceRecord = {
      type: 'local_price_research',
      researchId: researchId,
      market: research.market,
      asOfDate: research.asOfDate,
      confidence: research.confidence,
      selectedTier: tier,
      unit: unit,
      description: research.description || '',
      notes: research.notes || '',
      assumptions: research.assumptions || [],
      sources: (research.sources || []).slice(0, 8)
    };
    const snapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.PRODUCTS, { includeVoided: true });
    const existing = snapshot.rows.find(function (row) {
      return boNormalizeText_(row['Record Type']) === 'Learned Price' &&
        boNormalizeText_(row.Name).toLowerCase() === storedName.toLowerCase();
    });
    const values = {
      'Record Type': 'Learned Price',
      Name: storedName,
      Family: 'Locally Researched Prices',
      Price: selectedRate,
      'Component IDs': '',
      Taxable: payload.taxable === true ? 'Yes' : 'No',
      'Revenue Account': '4000',
      Active: 'Yes',
      'Catalog Source': JSON.stringify(sourceRecord),
      Version: research.asOfDate || Utilities.formatDate(new Date(), boTimeZone_(), 'yyyy-MM-dd'),
      'External Action Boundary': 'Owner-selected researched draft price; verify before customer release.',
      'Updated Time': boNow_()
    };
    let saved;
    let updated = false;
    if (existing) {
      saved = boUpdateRecord_(H38_BO_SHEETS.PRODUCTS, existing['Catalog ID'], values, 'Quote Builder learned local price');
      updated = true;
    } else {
      values['Catalog ID'] = boId_('LOCALPRICE');
      saved = boAppendRecord_(H38_BO_SHEETS.PRODUCTS, values, 'Quote Builder learned local price');
    }
    boQuoteBuilderInvalidateCache_('products');
    boProof_('REMEMBER LOCAL PRICE', 'Price Book', saved['Catalog ID'], 'PASS', researchId + '; tier=' + tier + '; rate=' + selectedRate, boGetActiveEmail_());
    return {
      saved: true,
      updated: updated,
      catalogId: saved['Catalog ID'],
      item: {
        'Product / Service ID': saved['Catalog ID'],
        Name: displayName,
        Description: research.description || displayName,
        'Customer Description': research.description || displayName,
        Unit: unit,
        'Standard Selling Price': selectedRate,
        Price: selectedRate,
        taxable: payload.taxable === true,
        notes: 'Locally researched ' + tier + ' price for ' + research.market + ' as of ' + research.asOfDate + '. Owner review required.'
      }
    };
  }, 'Price Book', payload && payload.researchId);
}

function boQuoteBuilderLocalPriceOpenAi_(query, market) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('OPENAI_API_KEY');
  boAssert_(key, 'Local price research requires the configured H38 AI connection.');
  const today = Utilities.formatDate(new Date(), boTimeZone_(), 'yyyy-MM-dd');
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['itemName', 'description', 'unit', 'low', 'typical', 'high', 'currency', 'market', 'asOfDate', 'confidence', 'notes', 'assumptions', 'sources'],
    properties: {
      itemName: { type: 'string' },
      description: { type: 'string' },
      unit: { type: 'string' },
      low: { type: 'number' },
      typical: { type: 'number' },
      high: { type: 'number' },
      currency: { type: 'string', enum: ['USD'] },
      market: { type: 'string' },
      asOfDate: { type: 'string' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      notes: { type: 'string' },
      assumptions: { type: 'array', items: { type: 'string' } },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url', 'seller', 'priceText'],
          properties: {
            title: { type: 'string' },
            url: { type: 'string' },
            seller: { type: 'string' },
            priceText: { type: 'string' }
          }
        }
      }
    }
  };
  const request = {
    model: props.getProperty('OPENAI_MODEL') || 'gpt-5-mini',
    instructions: 'Research current public local pricing for the requested material, product, rental, or service. Use web search. Prefer official retailer, supplier, rental-company, manufacturer, or service-provider pages. Keep low, typical, and high prices on the same clearly stated unit and in USD before tax. Do not invent a price without sources. If exact local sources are limited, use the nearest regional sources, explain that in notes, and lower confidence. Return only the required structured result. URLs must be sources actually consulted.',
    input: JSON.stringify({ requestedItemOrService: query, requestedMarket: market, currentDate: today }),
    tools: [{ type: 'web_search', search_context_size: 'medium' }],
    include: ['web_search_call.action.sources'],
    text: { format: { type: 'json_schema', name: 'local_price_research', strict: true, schema: schema } },
    max_output_tokens: 1600,
    store: false
  };
  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const raw = response.getContentText();
  boAssert_(code >= 200 && code < 300, 'Local price research failed (' + code + ').');
  const json = JSON.parse(raw);
  const text = boNormalizeText_(json.output_text || (typeof boAiExtractText_ === 'function' ? boAiExtractText_(json) : ''));
  boAssert_(text, 'Local price research returned no structured result.');
  let data;
  try { data = JSON.parse(text); } catch (error) { throw new Error('Local price research returned invalid structured data.'); }
  return boQuoteBuilderNormalizeLocalPrice_(data, market, today, json);
}

function boQuoteBuilderNormalizeLocalPrice_(data, requestedMarket, today, responseJson) {
  const result = {
    itemName: boNormalizeText_(data.itemName).slice(0, 180),
    description: boNormalizeText_(data.description).slice(0, 600),
    unit: boNormalizeText_(data.unit || 'each').slice(0, 80),
    low: boMoney_(data.low),
    typical: boMoney_(data.typical),
    high: boMoney_(data.high),
    currency: 'USD',
    market: boNormalizeText_(data.market || requestedMarket).slice(0, 160),
    asOfDate: boNormalizeText_(data.asOfDate || today).slice(0, 20),
    confidence: ['low', 'medium', 'high'].indexOf(boNormalizeText_(data.confidence).toLowerCase()) >= 0 ? boNormalizeText_(data.confidence).toLowerCase() : 'low',
    notes: boNormalizeText_(data.notes).slice(0, 1000),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions.map(function (value) { return boNormalizeText_(value).slice(0, 300); }).filter(Boolean).slice(0, 10) : [],
    sources: []
  };
  boAssert_(result.itemName, 'Local price research did not identify the item or service.');
  boAssert_(result.low > 0 && result.typical > 0 && result.high > 0, 'Local price research did not return usable prices.');
  const ordered = [result.low, result.typical, result.high].sort(function (a, b) { return a - b; });
  result.low = ordered[0]; result.typical = ordered[1]; result.high = ordered[2];
  const seen = {};
  (Array.isArray(data.sources) ? data.sources : []).forEach(function (source) {
    const url = boNormalizeText_(source && source.url);
    if (!/^https?:\/\//i.test(url) || seen[url]) return;
    seen[url] = true;
    result.sources.push({
      title: boNormalizeText_(source.title || source.seller || url).slice(0, 220),
      url: url.slice(0, 1200),
      seller: boNormalizeText_(source.seller).slice(0, 160),
      priceText: boNormalizeText_(source.priceText).slice(0, 240)
    });
  });
  (responseJson.output || []).forEach(function (item) {
    if (item.type !== 'web_search_call' || !item.action || !Array.isArray(item.action.sources)) return;
    item.action.sources.forEach(function (source) {
      const url = boNormalizeText_(source && source.url);
      if (!/^https?:\/\//i.test(url) || seen[url]) return;
      seen[url] = true;
      result.sources.push({ title: url, url: url.slice(0, 1200), seller: '', priceText: '' });
    });
  });
  result.sources = result.sources.slice(0, 8);
  boAssert_(result.sources.length, 'Local price research found no reviewable source links.');
  return result;
}
