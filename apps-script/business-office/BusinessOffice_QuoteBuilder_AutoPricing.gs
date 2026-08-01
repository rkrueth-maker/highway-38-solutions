/** Automatic Price Book fallback for missing searched items. */

function boQuoteBuilderAutoLocalPrice(payload) {
  return boSafeExecute_('Automatic Quote Builder local price', function () {
    boQuoteBuilderRequireAction_('Create');
    boQuoteBuilderRequireAction_('priceBook');
    payload = payload || {};
    const query = boNormalizeText_(payload.query).slice(0, 500);
    const configuredMarket = typeof boBusinessDefaultLocalMarket_ === 'function' ? boBusinessDefaultLocalMarket_() : boPackValue_('pricing.defaultMarket', '');
    const market = boNormalizeText_(payload.market || configuredMarket).slice(0, 160);
    boAssert_(query, 'Price Book search text is required.');
    boAssert_(market, 'Automatic pricing needs a configured local market.');

    const research = boQuoteBuilderResearchLocalPrice({ query: query, market: market });
    const saved = boQuoteBuilderRememberLocalPrice({
      researchId: research.researchId,
      tier: 'typical',
      taxable: payload.taxable === true
    });
    boProof_(
      'AUTO LEARN LOCAL PRICE',
      'Price Book',
      saved.catalogId,
      'PASS',
      query + '; market=' + market + '; tier=typical; rate=' + saved.item.Price,
      boGetActiveEmail_()
    );
    return {
      saved: true,
      updated: saved.updated === true,
      catalogId: saved.catalogId,
      automaticTier: 'typical',
      item: saved.item,
      sourceSummary: {
        market: research.market,
        asOfDate: research.asOfDate,
        confidence: research.confidence,
        sourceCount: (research.sources || []).length
      },
      finalPriceApproved: false,
      ownerReviewRequired: true
    };
  }, 'Price Book', payload && payload.query);
}
