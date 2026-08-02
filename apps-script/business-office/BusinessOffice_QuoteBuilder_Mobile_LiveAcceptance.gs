/** Live production acceptance for the Android Quote Builder photo, pricing, and draft-edit workflow. */

function boQuoteBuilderMobileAcceptanceDraft_(result) {
  if (result && result.draft) return result.draft;
  try {
    return JSON.parse(result && result.staged && result.staged.Details || '{}');
  } catch (error) {
    return {};
  }
}

function boQuoteBuilderMobileAcceptanceText_(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value == null ? '' : value);
}

function boQuoteBuilderMobileAcceptanceLineText_(line) {
  line = line || {};
  return [
    line.description || '',
    line.searchQuery || '',
    line.evidence || '',
    line.catalogName || '',
    line.catalogDescription || '',
    line.catalogSource || ''
  ].join(' ');
}

function boQuoteBuilderMobileAcceptanceComponent_(line) {
  const text = boQuoteBuilderMobileAcceptanceLineText_(line);
  if (/(?:leaf|gutter)\s*guards?|gutter\s*protection|leaf\s*protection/i.test(text)) return 'gutter_guard';
  const normalized = text.toLowerCase()
    .replace(/\bdownspouts?\b|\bdrainpipes?\b/g, ' downspout ')
    .replace(/\bguttering\b|\bgutters?\b/g, ' gutter ');
  const downspoutIndex = normalized.indexOf('downspout');
  const gutterIndex = normalized.indexOf('gutter');
  if (downspoutIndex >= 0 && gutterIndex >= 0) return downspoutIndex < gutterIndex ? 'downspout' : 'gutter';
  if (downspoutIndex >= 0) return 'downspout';
  if (gutterIndex >= 0) return 'gutter';
  return '';
}

function boQuoteBuilderMobileAcceptanceFind_(lines, component) {
  return (lines || []).find(function (line) {
    return boQuoteBuilderMobileAcceptanceComponent_(line) === component;
  }) || null;
}

function boQuoteBuilderMobileAcceptanceAssertComponents_(lines, label) {
  const counts = { gutter:0, downspout:0, gutter_guard:0 };
  (lines || []).forEach(function (line) {
    const component = boQuoteBuilderMobileAcceptanceComponent_(line);
    if (component && Object.prototype.hasOwnProperty.call(counts, component)) counts[component] += 1;
  });
  boAssert_(counts.gutter === 1, label + ' must contain exactly one gutter component; found ' + counts.gutter + '.');
  boAssert_(counts.downspout === 1, label + ' must contain exactly one downspout component; found ' + counts.downspout + '.');
  boAssert_(counts.gutter_guard === 1, label + ' must contain exactly one leaf-guard component; found ' + counts.gutter_guard + '.');
  return counts;
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
        boNormalizeText_(row.Status || 'Draft') === 'Draft' &&
        boNormalizeText_(row['Approval Status'] || 'Owner Approval Required') !== 'Approved' &&
        boNormalizeText_(row['Customer Action'] || 'Not Sent') !== 'Sent';
    })
    .sort(function (a, b) {
      return String(b['Updated Time'] || b['Created Time'] || '').localeCompare(String(a['Updated Time'] || a['Created Time'] || ''));
    });
  boAssert_(rows.length, 'The saved gutter draft was not available for edit acceptance.');
  return rows[0]['Quote ID'];
}

function boQuoteBuilderMobileAcceptancePriceLines_(draft) {
  const suggested = Array.isArray(draft && draft.suggestedLines) ? draft.suggestedLines : [];
  return suggested.slice(0, 8).map(function (line) {
    const query = boNormalizeText_(line.searchQuery || line.description || line.catalogId || '');
    const result = boQuoteBuilderResolveLinePrice({
      query: query,
      catalogId: line.catalogId || '',
      description: line.description || '',
      unit: line.unit || '',
      taxable: false
    });
    const item = result && result.item || {};
    return {
      catalogId: result && result.catalogId || item['Product / Service ID'] || '',
      description: line.description || item['Customer Description'] || item.Name || query,
      quantity: Number(line.quantity || 0),
      unit: item.Unit || line.unit || '',
      rate: Number(item['Standard Selling Price'] || item.Price || 0),
      source: result && result.source || '',
      matched: result && result.matched === true,
      researched: result && result.researched === true,
      ownerReviewRequired: result && result.ownerReviewRequired === true,
      finalPriceApproved: result && result.finalPriceApproved === true,
      catalogName: item.Name || '',
      catalogDescription: item['Customer Description'] || item.Description || '',
      catalogSource: item['Catalog Source'] || '',
      notes: line.evidence || ''
    };
  });
}

function boQuoteBuilderMobileAcceptanceAssertPricing_(priced, label) {
  boQuoteBuilderMobileAcceptanceAssertComponents_(priced, label);
  const gutter = boQuoteBuilderMobileAcceptanceFind_(priced, 'gutter');
  const downspout = boQuoteBuilderMobileAcceptanceFind_(priced, 'downspout');
  const leafGuard = boQuoteBuilderMobileAcceptanceFind_(priced, 'gutter_guard');
  boAssert_(gutter && gutter.rate > 0, label + ' gutter line did not receive a nonzero reviewed rate.');
  boAssert_(downspout && downspout.rate > 0, label + ' downspout line did not receive a nonzero reviewed rate.');
  boAssert_(leafGuard && leafGuard.rate > 0, label + ' leaf-guard line did not receive a nonzero reviewed rate.');
  boAssert_(leafGuard.catalogId && leafGuard.catalogId !== gutter.catalogId, label + ' leaf guard reused the gutter catalog item.');
  boAssert_(downspout.catalogId && downspout.catalogId !== gutter.catalogId, label + ' downspout reused the gutter catalog item.');
  boAssert_(leafGuard.ownerReviewRequired && downspout.ownerReviewRequired && gutter.ownerReviewRequired, label + ' pricing escaped owner review.');
  boAssert_(leafGuard.finalPriceApproved === false && downspout.finalPriceApproved === false && gutter.finalPriceApproved === false, label + ' pricing was automatically approved.');
  return { gutter:gutter, downspout:downspout, leafGuard:leafGuard };
}

function boQuoteBuilderMobileAcceptanceUpdatePayload_(editable, draft, priced) {
  const quote = editable.quote || {};
  return {
    quoteId: quote.quoteId,
    editToken: editable.editToken,
    customerId: quote.customerId,
    projectTitle: quote.projectTitle || draft.projectTitle || 'Gutters',
    quoteDate: quote.quoteDate || '',
    expirationDate: quote.expirationDate || '',
    paymentTerms: quote.paymentTerms || 'Net 15',
    scope: boQuoteBuilderMobileAcceptanceText_(draft.scope || quote.scope || ''),
    assumptions: boQuoteBuilderMobileAcceptanceText_(draft.assumptions || quote.assumptions || ''),
    exclusions: boQuoteBuilderMobileAcceptanceText_(draft.exclusions || quote.exclusions || ''),
    customerNotes: quote.customerNotes || '',
    internalNotes: quote.internalNotes || '',
    deposit: Number(quote.deposit || 0),
    lines: (priced || []).map(function (line) {
      return {
        catalogId: line.catalogId || '',
        description: line.description || '',
        quantity: Number(line.quantity || 0),
        unit: line.unit || 'each',
        rate: Number(line.rate || 0),
        discount: 0,
        taxable: false,
        taxRate: 0,
        accountCode: '4000',
        jobCostCategory: 'Service Revenue',
        notes: line.notes || 'Owner review required.'
      };
    })
  };
}

function boQuoteBuilderMobileAcceptanceRestorePayload_(current, original) {
  const quote = original.quote || {};
  return {
    quoteId: quote.quoteId,
    editToken: current.editToken,
    customerId: quote.customerId,
    projectTitle: quote.projectTitle,
    quoteDate: quote.quoteDate || '',
    expirationDate: quote.expirationDate || '',
    paymentTerms: quote.paymentTerms || 'Net 15',
    scope: quote.scope || '',
    assumptions: quote.assumptions || '',
    exclusions: quote.exclusions || '',
    customerNotes: quote.customerNotes || '',
    internalNotes: quote.internalNotes || '',
    deposit: Number(quote.deposit || 0),
    lines: original.lines || []
  };
}

function boQuoteBuilderRunMobileProductionAcceptance() {
  return boSafeExecute_('Quote Builder mobile production acceptance', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    const started = Date.now();
    let syntheticDocumentId = '';
    let syntheticFileId = '';
    let quoteId = '';
    let originalEditable = null;
    let quoteModified = false;
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
      const analysisPayload = {
        customerId: 'CUST-H38-GENERIC-QUOTE',
        projectTitle: 'Gutters',
        notes: [
          'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard to all new gutter runs.',
          'Known dimensions and assumptions: Door with window is 36 inches by 80 inches.',
          'Use the visible door only as a scale reference. Identify visible gutter runs, one downspout, and related components.',
          'Internal owner-review draft only. Do not approve or send.'
        ].join('\n'),
        photoDocumentIds: photoIds
      };

      const analysisStarted = Date.now();
      const firstResult = boBuildAiQuoteDraft(analysisPayload);
      const firstDraft = boQuoteBuilderMobileAcceptanceDraft_(firstResult);
      const firstSuggested = Array.isArray(firstDraft.suggestedLines) ? firstDraft.suggestedLines : [];
      boQuoteBuilderMobileAcceptanceAssertComponents_(firstSuggested, 'First photo analysis');
      const firstPricing = boQuoteBuilderMobileAcceptancePriceLines_(firstDraft);
      const firstComponents = boQuoteBuilderMobileAcceptanceAssertPricing_(firstPricing, 'First pricing pass');

      quoteId = boQuoteBuilderMobileAcceptanceQuoteId_();
      originalEditable = boQuoteBuilderEditableQuote({ quoteId: quoteId });
      boAssert_(originalEditable && originalEditable.quote && originalEditable.quote.quoteId === quoteId, 'The saved draft did not open for the save acceptance.');
      boQuoteBuilderUpdateEditableQuote(boQuoteBuilderMobileAcceptanceUpdatePayload_(originalEditable, firstDraft, firstPricing));
      quoteModified = true;

      const firstReopen = boQuoteBuilderEditableQuote({ quoteId: quoteId });
      boQuoteBuilderMobileAcceptanceAssertComponents_(firstReopen.lines, 'First saved draft reopen');
      boAssert_(firstReopen.quote.projectTitle === 'Gutters', 'The saved gutter project title was not restored.');
      boAssert_(Array.isArray(firstReopen.customers) && firstReopen.customers.length, 'Customer choices were not restored for editing.');

      const reprocessStarted = Date.now();
      const secondResult = boBuildAiQuoteDraft(analysisPayload);
      const secondDraft = boQuoteBuilderMobileAcceptanceDraft_(secondResult);
      const secondSuggested = Array.isArray(secondDraft.suggestedLines) ? secondDraft.suggestedLines : [];
      boQuoteBuilderMobileAcceptanceAssertComponents_(secondSuggested, 'Reprocessed photo analysis');
      const secondPricing = boQuoteBuilderMobileAcceptancePriceLines_(secondDraft);
      const secondComponents = boQuoteBuilderMobileAcceptanceAssertPricing_(secondPricing, 'Reprocessed pricing pass');
      boQuoteBuilderUpdateEditableQuote(boQuoteBuilderMobileAcceptanceUpdatePayload_(firstReopen, secondDraft, secondPricing));

      const finalReopen = boQuoteBuilderEditableQuote({ quoteId: quoteId });
      const finalCounts = boQuoteBuilderMobileAcceptanceAssertComponents_(finalReopen.lines, 'Reprocessed saved draft');
      boAssert_(finalReopen.quote.projectTitle === 'Gutters', 'The reprocessed draft did not retain the project title.');
      boAssert_(Array.isArray(finalReopen.customers) && finalReopen.customers.length, 'The reprocessed draft did not retain customer choices.');

      boProof_(
        'QUOTE BUILDER MOBILE LIVE ACCEPTANCE',
        'Quote',
        quoteId,
        'PASS',
        photoIds.length + ' real photos analyzed; gutter, downspout, and leaf guard separately priced; saved draft reopened and reprocessed without duplicate components; nothing approved or sent.',
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
          projectTitle: firstDraft.projectTitle || '',
          observations: firstDraft.photoObservations || [],
          lineCount: firstSuggested.length,
          requiredScopePreserved: true,
          requiredScopeLine: firstComponents.leafGuard.description || 'Leaf guard',
          observedDownspoutPreserved: true,
          downspoutLine: firstComponents.downspout.description || 'Downspout'
        },
        pricing: firstPricing,
        editDraft: {
          quoteId: quoteId,
          quoteNumber: finalReopen.quote.quoteNumber,
          projectTitle: finalReopen.quote.projectTitle,
          lineCount: finalReopen.lines.length,
          customerCount: finalReopen.customers.length
        },
        reprocess: {
          durationMs: Date.now() - reprocessStarted,
          lineCount: finalReopen.lines.length,
          componentCounts: finalCounts,
          gutterCatalogId: secondComponents.gutter.catalogId,
          downspoutCatalogId: secondComponents.downspout.catalogId,
          leafGuardCatalogId: secondComponents.leafGuard.catalogId,
          duplicateComponents: false
        },
        ownerReviewRequired: true,
        approved: false,
        sent: false,
        durationMs: Date.now() - started
      };
    } finally {
      const cleanupErrors = [];
      if (quoteModified && quoteId && originalEditable) {
        try {
          const current = boQuoteBuilderEditableQuote({ quoteId: quoteId });
          boQuoteBuilderUpdateEditableQuote(boQuoteBuilderMobileAcceptanceRestorePayload_(current, originalEditable));
        } catch (error) {
          cleanupErrors.push('quote restore: ' + error.message);
        }
      }
      if (syntheticFileId) {
        try { DriveApp.getFileById(syntheticFileId).setTrashed(true); }
        catch (error) { cleanupErrors.push('temporary file cleanup: ' + error.message); }
      }
      if (syntheticDocumentId) {
        try {
          boUpdateRecord_(H38_BO_SHEETS.DOCUMENTS, syntheticDocumentId, {
            'Is Voided': 'Yes',
            'Review Status': 'Acceptance Cleanup',
            'Approval Status': 'Not Applicable'
          }, 'Quote Builder mobile acceptance cleanup');
        } catch (error) {
          cleanupErrors.push('temporary document cleanup: ' + error.message);
        }
      }
      if (cleanupErrors.length) throw new Error('Mobile acceptance cleanup failed: ' + cleanupErrors.join('; '));
    }
  }, 'Quote', 'GUTTERS-MOBILE-ACCEPTANCE');
}
