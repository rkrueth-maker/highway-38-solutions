/** Quote Builder — one-tap camera capture and quote attachment support. */

function boQuoteBuilderRememberCreatedQuote_(quote) {
  if (!quote || !quote['Quote ID']) return quote;
  CacheService.getUserCache().put('H38QB_LAST_CREATED_QUOTE', JSON.stringify({
    quoteId: quote['Quote ID'],
    quoteNumber: quote['Quote Number'] || '',
    customerId: quote['Customer ID'] || '',
    projectTitle: quote['Project Title'] || '',
    createdMs: Date.now()
  }), 900);
  return quote;
}

function boQuoteBuilderLastCreatedQuote_() {
  boQuoteBuilderRequireAction_('View');
  const raw = CacheService.getUserCache().get('H38QB_LAST_CREATED_QUOTE');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return null; }
}

function boQuoteBuilderSaveCapturedPhoto_(payload) {
  return boSafeExecute_('Save quote photo', function () {
    const started = Date.now();
    boQuoteBuilderRequireAction_('Edit');
    boAssert_(payload && payload.quoteId, 'Quote ID is required before saving a picture.');
    const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true });
    const quote = quoteSnapshot.rows.find(function (row) {
      return row['Quote ID'] === payload.quoteId && row['Is Voided'] !== 'Yes' && row.Status !== 'Voided';
    });
    boAssert_(quote, 'The quote was not found or is no longer active.');
    const document = boQuoteBuilderUploadDocument_({
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      base64Data: payload.base64Data,
      documentType: 'Quote Field Photo',
      sourceType: 'Quote',
      sourceId: payload.quoteId,
      accessClassification: 'Private Customer'
    });
    boProof_('CAPTURE QUOTE PHOTO', 'Quote', payload.quoteId, 'PASS', document['Document ID'] + '; private original attached.', boGetActiveEmail_());
    boQuoteBuilderTiming_('capture_quote_photo', started, { quoteId: payload.quoteId, bytes: document['Size Bytes'] || 0 });
    return {
      documentId: document['Document ID'],
      fileName: document['File Name'],
      fileId: document['File ID'],
      fileUrl: document['File URL'],
      mimeType: document['MIME Type'],
      uploadedTime: document['Uploaded Time'],
      reviewStatus: document['Review Status']
    };
  }, 'Quote', payload && payload.quoteId);
}

function boQuoteBuilderQuoteDocuments_(quoteId) {
  boQuoteBuilderRequireAction_('View');
  boAssert_(quoteId, 'Quote ID is required.');
  const access = boQuoteBuilderAccessContext_();
  if (!access.permissions.documents) return [];
  const snapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.DOCUMENTS, { includeVoided: true });
  return snapshot.rows.filter(function (row) {
    return row['Source Type'] === 'Quote' && row['Source ID'] === quoteId && row['Is Voided'] !== 'Yes';
  }).sort(function (a, b) {
    return String(b['Uploaded Time'] || b['Created Time']).localeCompare(String(a['Uploaded Time'] || a['Created Time']));
  }).map(function (row) {
    return {
      documentId: row['Document ID'],
      fileName: row['File Name'],
      fileId: row['File ID'],
      fileUrl: row['File URL'],
      mimeType: row['MIME Type'],
      documentType: row['Document Type'],
      uploadedTime: row['Uploaded Time'] || row['Created Time'],
      reviewStatus: row['Review Status'],
      approvalStatus: row['Approval Status']
    };
  });
}
