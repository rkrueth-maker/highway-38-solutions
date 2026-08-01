/** Live production acceptance for the Android Quote Builder photo, pricing, and draft-edit workflow. */

function boQuoteBuilderMobileAcceptanceDraft_(result) {
  if (result && result.draft) return result.draft;
  try {
    return JSON.parse(result && result.staged && result.staged.Details || '{}');
  } catch (error) {
    return {};
  }
}

function boQuoteBuilderMobileAcceptancePhotoIds_() {
  const names = ['1000007797.jpg', '1000007798.jpg'];
  const rows = boQuoteBuilderSnapshot_(H38_BO_SHEETS.DOCUMENTS, { includeVoided: true }).rows
    .filter(function (row) {
      return names.indexOf(row['File Name']) >= 0 &&
        row['Is Voided'] !== 'Yes' &&
        /^image\/jpeg$/i.test(row['MIME Type'] || '') &&
        Number(row['Size Bytes'] || 0) > 1000000;
    })
    .sort(function (a, b) {
      return String(b['Uploaded Time'] || '').localeCompare(String(a['Uploaded Time'] || ''));
    });
  const selected = [];
  names.forEach(function (name) {
    const row = rows.find(function (candidate) { return candidate['File Name'] === name; });
    if (row && selected.indexOf(row['Document ID']) < 0) selected.push(row['Document ID']);
  });
  boAssert_(selected.length === 2, 'The two real gutter test photos were not available for production acceptance.');
  return selected;
}

function boQuoteBuilderMobileAcceptanceQuoteId_() {
  const rows = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true }).rows
    .filter(function (row) {
      return row['Is Voided'] !== 'Yes' &&
        row['Project Title'] === 'Gutters' &&
        boQuoteBuilderEditableStatus_(row.Status);
    })
    .sort(function (a, b) {
      return String(b['Updated Time'] || b['Created Time'] || '').localeCompare(String(a['Updated Time'] || a['Created Time'] || ''));
    });
  boAssert_(rows.length, 'The saved gutter draft was not available for edit acceptance.');
  return rows[0]['Quote ID'];
}

function boQuoteBuilderRunMobileProductionAcceptance() {
  return boSafeExecute_('Quote Builder mobile production acceptance', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    const started = Date.now();
    let syntheticDocumentId = '';
    let syntheticFileId = '';
    try {
      const targetUploadBytes = 4800000;
      const uniqueText = new Array(targetUploadBytes + 1).join('A') + new Date().toISOString();
      const uniqueBytes = Utilities.newBlob(uniqueText, 'image/jpeg').getBytes();
      const staged = boQuoteBuilderStageAiPhoto({
        customerId: 'CUST-H38-GENERIC-QUOTE',
        fileName: 'h38-mobile-upload-acceptance-' + Date.now() + '.jpg',
        mimeType: 'image/jpeg',
        base64Data: 'data:image/jpeg;base64,' + Utilities.base64Encode(uniqueBytes)
      });
      syntheticDocumentId = staged.documentId;
      syntheticFileId = staged.fileId;
      boAssert_(syntheticDocumentId && syntheticFileId, 'The live single-request photo upload path did not return a saved document.');
      boAssert_(Number(staged.sizeBytes || 0) >= targetUploadBytes, 'The live upload acceptance did not preserve a normal phone-photo-sized payload.');

      const photoIds = boQuoteBuilderMobileAcceptancePhotoIds_();
      const analysisStarted = Date.now();
      const analysisResult = boBuildAiQuoteDraft({
        customerId: 'CUST-H38-GENERIC-QUOTE',
        projectTitle: 'Gutters',
        notes: [
          'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard to all new gutter runs.',
          'Known dimensions and assumptions: Door with window is 36 inches by 80 inches.',
          'Use the visible door only as a scale reference. Identify visible gutter runs, one downspout, and related components.',
          'Internal owner-review draft only. Do not approve or send.'
        ].join('\n'),
        photoDocumentIds: photoIds
      });
      const draft = boQuoteBuilderMobileAcceptanceDraft_(analysisResult);
      const suggested = Array.isArray(draft.suggestedLines) ? draft.suggestedLines : [];
      boAssert_(suggested.length >= 2, 'Photo analysis did not return usable gutter and typed-scope quote lines.');
      const leafGuard = suggested.find(function (line) {
        return /(?:leaf|gutter)\s*guard|gutter\s*protection/i.test([
          line.description || '',
          line.searchQuery || '',
          line.evidence || ''
        ].join(' '));
      });
      boAssert_(leafGuard, 'The explicitly typed leaf guard scope was omitted from the live quote draft.');

      const priced = suggested.slice(0, 6).map(function (line) {
        const query = boNormalizeText_([
          line.searchQuery || line.description || line.catalogId || '',
          draft.scope || 'Replace existing gutters with 6-inch white gutters, one downspout, and leaf guard.'
        ].filter(Boolean).join('. Work scope: '));
        const result = boQuoteBuilderResolveLinePrice({
          query: query,
          catalogId: line.catalogId || '',
          description: line.description || '',
          unit: line.unit || '',
          taxable: false
        });
        const item = result && result.item || {};
        return {
          description: line.description || item['Customer Description'] || item.Name || query,
          quantity: Number(line.quantity || 0),
          unit: item.Unit || line.unit || '',
          rate: Number(item['Standard Selling Price'] || item.Price || 0),
          source: result && result.source || '',
          catalogName: item.Name || '',
          catalogDescription: item['Customer Description'] || item.Description || '',
          catalogSource: item['Catalog Source'] || ''
        };
      });

      const gutter = priced.find(function (line) {
        const text = [
          line.description,
          line.catalogName,
          line.catalogDescription,
          line.catalogSource
        ].join(' ');
        return /gutter/i.test(text) && !/(?:leaf|gutter)\s*guard|gutter\s*protection/i.test(text);
      });
      boAssert_(gutter && gutter.rate > 0, 'The live gutter scope did not receive a nonzero Price Book rate.');
      const gutterCoverage = [
        gutter.description,
        gutter.catalogName,
        gutter.catalogDescription,
        gutter.catalogSource,
        draft.scope || '',
        (draft.photoObservations || []).join(' ')
      ].join(' ');
      boAssert_(/downspout/i.test(gutterCoverage), 'The priced gutter scope did not preserve the known downspout component.');

      const quoteId = boQuoteBuilderMobileAcceptanceQuoteId_();
      const editStarted = Date.now();
      const editable = boQuoteBuilderEditableQuote({ quoteId: quoteId });
      boAssert_(editable && editable.quote && editable.quote.quoteId === quoteId, 'The saved draft did not reopen in the editable Quote Builder.');
      boAssert_(editable.quote.projectTitle === 'Gutters', 'The saved gutter project title was not restored.');
      boAssert_(Array.isArray(editable.lines) && editable.lines.length, 'The saved quote lines were not restored for editing.');
      boAssert_(Array.isArray(editable.customers) && editable.customers.length, 'Customer choices were not restored for editing.');

      boProof_(
        'QUOTE BUILDER MOBILE LIVE ACCEPTANCE',
        'Quote',
        quoteId,
        'PASS',
        photoIds.length + ' real photos analyzed; typed leaf guard preserved; gutter scope including one downspout priced; editable draft loaded; nothing sent.',
        access.user.email
      );

      return {
        status: 'PASS',
        photoUpload: {
          mode: 'single_request_immediate_file_read',
          syntheticDocumentId: syntheticDocumentId,
          syntheticUploadBytes: Number(staged.sizeBytes || 0),
          saved: true
        },
        photoAnalysis: {
          documentIds: photoIds,
          durationMs: Date.now() - analysisStarted,
          projectTitle: draft.projectTitle || '',
          observations: draft.photoObservations || [],
          lineCount: suggested.length,
          requiredScopePreserved: true,
          requiredScopeLine: leafGuard.description || leafGuard.searchQuery || 'Leaf guard'
        },
        pricing: priced,
        editDraft: {
          quoteId: quoteId,
          quoteNumber: editable.quote.quoteNumber,
          projectTitle: editable.quote.projectTitle,
          lineCount: editable.lines.length,
          customerCount: editable.customers.length,
          durationMs: Date.now() - editStarted
        },
        ownerReviewRequired: true,
        approved: false,
        sent: false,
        durationMs: Date.now() - started
      };
    } finally {
      if (syntheticFileId) {
        try { DriveApp.getFileById(syntheticFileId).setTrashed(true); } catch (error) { console.log('Mobile acceptance file cleanup: ' + error.message); }
      }
      if (syntheticDocumentId) {
        try {
          boUpdateRecord_(H38_BO_SHEETS.DOCUMENTS, syntheticDocumentId, {
            'Is Voided': 'Yes',
            'Review Status': 'Acceptance Cleanup',
            'Approval Status': 'Not Applicable'
          }, 'Quote Builder mobile acceptance cleanup');
        } catch (error) {
          console.log('Mobile acceptance document cleanup: ' + error.message);
        }
      }
    }
  }, 'Quote', 'GUTTERS-MOBILE-ACCEPTANCE');
}
