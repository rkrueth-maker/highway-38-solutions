/** Quote Builder cache invalidation hooks for shared Business Office writes. */

function boQuoteBuilderSaveRecord_(moduleKey, recordId, values) {
  const result = boSaveRecord(moduleKey, recordId, values);
  const key = boNormalizeText_(moduleKey).toLowerCase();
  if (key === 'quotes') boQuoteBuilderInvalidateCache_('quotes');
  else if (key === 'customers') boQuoteBuilderInvalidateCache_('customers');
  else if (key === 'documents') boQuoteBuilderInvalidateCache_('documents');
  else if (key === 'setup') {
    boQuoteBuilderInvalidateCache_('products');
    boQuoteBuilderInvalidateCache_('templates');
  }
  return result;
}

function boQuoteBuilderUploadDocument_(payload) {
  const result = boUploadDocument(payload || {});
  boQuoteBuilderInvalidateCache_('documents');
  return result;
}

function boQuoteBuilderReviseQuote_(quoteId, changes) {
  const result = boReviseQuote(quoteId, changes || {});
  boQuoteBuilderInvalidateCache_('quotes');
  return result;
}
