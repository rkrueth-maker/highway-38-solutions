/** Quote Builder — reliable chunked intake uploads and AI-draft application. */

function boQuoteBuilderUploadSessionKey_(sessionId) {
  return 'H38QB_UPLOAD_SESSION:' + boNormalizeText_(sessionId);
}

function boQuoteBuilderUploadSession_(sessionId) {
  const key = boQuoteBuilderUploadSessionKey_(sessionId);
  const raw = CacheService.getUserCache().get(key);
  boAssert_(raw, 'The upload session expired. The quote remains saved; select the file again to attach it.');
  let session;
  try { session = JSON.parse(raw); } catch (error) { session = null; }
  boAssert_(session && session.sessionId === sessionId, 'The upload session is invalid.');
  return session;
}

function boQuoteBuilderStoreUploadSession_(session) {
  CacheService.getUserCache().put(
    boQuoteBuilderUploadSessionKey_(session.sessionId),
    JSON.stringify(session),
    1800
  );
  return session;
}

function boQuoteBuilderTrashUploadParts_(session) {
  Object.keys((session && session.parts) || {}).forEach(function (key) {
    try { DriveApp.getFileById(session.parts[key]).setTrashed(true); } catch (error) { console.log('H38 quote upload cleanup: ' + error.message); }
  });
}

function boQuoteBuilderUploadBegin_(payload) {
  return boSafeExecute_('Begin quote upload', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    payload = payload || {};
    boAssert_(payload.quoteId, 'Quote ID is required before uploading a file.');
    boAssert_(payload.fileName && payload.mimeType, 'File name and type are required.');
    const quote = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES).rows.find(function (row) {
      return row['Quote ID'] === payload.quoteId;
    });
    boAssert_(quote, 'The saved quote was not found.');
    const mimeType = boNormalizeText_(payload.mimeType).toLowerCase();
    boAssert_(H38_BO.ALLOWED_MIME_TYPES.indexOf(mimeType) >= 0, 'Unsupported file type: ' + mimeType);
    const sizeBytes = Number(payload.sizeBytes || 0);
    const base64Length = Number(payload.base64Length || 0);
    const chunkCount = Number(payload.chunkCount || 0);
    boAssert_(sizeBytes > 0 && sizeBytes <= H38_BO.MAX_UPLOAD_BYTES, 'File exceeds the 20 MB upload limit.');
    boAssert_(base64Length > 0 && base64Length <= 30000000, 'Encoded file is too large for private upload.');
    boAssert_(Number.isInteger(chunkCount) && chunkCount > 0 && chunkCount <= 40, 'Invalid upload chunk count.');
    const session = {
      sessionId: boId_('QBUP'),
      quoteId: payload.quoteId,
      fileName: boSanitizeFilename_(payload.fileName),
      mimeType: mimeType,
      sizeBytes: sizeBytes,
      base64Length: base64Length,
      chunkCount: chunkCount,
      parts: {},
      startedBy: access.user.email,
      startedTime: boNow_()
    };
    boQuoteBuilderStoreUploadSession_(session);
    return { sessionId: session.sessionId, quoteId: session.quoteId, chunkCount: session.chunkCount };
  }, 'Quote', payload && payload.quoteId);
}

function boQuoteBuilderUploadChunk_(payload) {
  return boSafeExecute_('Upload quote file chunk', function () {
    boQuoteBuilderRequireAction_('Edit');
    payload = payload || {};
    const session = boQuoteBuilderUploadSession_(payload.sessionId);
    const index = Number(payload.index);
    const data = String(payload.data || '');
    boAssert_(Number.isInteger(index) && index >= 0 && index < session.chunkCount, 'Invalid upload chunk index.');
    boAssert_(data && data.length <= 2100000, 'Upload chunk exceeds the safe request size.');
    if (session.parts[String(index)]) return { sessionId: session.sessionId, index: index, duplicatePrevented: true };
    const folder = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
    const part = folder.createFile(Utilities.newBlob(data, 'text/plain', '.h38-' + session.sessionId + '-' + index + '.part'));
    part.setDescription('Temporary private Quote Builder upload part. Quote: ' + session.quoteId);
    session.parts[String(index)] = part.getId();
    boQuoteBuilderStoreUploadSession_(session);
    return { sessionId: session.sessionId, index: index, received: Object.keys(session.parts).length };
  }, 'Quote', payload && payload.quoteId);
}

function boQuoteBuilderUploadFinalize_(payload) {
  payload = payload || {};
  const session = boQuoteBuilderUploadSession_(payload.sessionId);
  try {
    return boSafeExecute_('Finalize quote upload', function () {
      const access = boQuoteBuilderRequireAction_('Edit');
      boAssert_(Object.keys(session.parts).length === session.chunkCount, 'The file upload is incomplete. The quote remains saved.');
      let base64Data = '';
      for (let index = 0; index < session.chunkCount; index += 1) {
        const fileId = session.parts[String(index)];
        boAssert_(fileId, 'Upload chunk ' + (index + 1) + ' is missing.');
        base64Data += DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8');
      }
      boAssert_(base64Data.length === session.base64Length, 'The uploaded file did not pass completeness verification.');
      const document = boQuoteBuilderUploadDocument_({
        fileName: session.fileName,
        mimeType: session.mimeType,
        base64Data: base64Data,
        documentType: 'Quote Intake Document',
        sourceType: 'Quote',
        sourceId: session.quoteId,
        accessClassification: 'Private Customer'
      });
      boProof_('CHUNKED QUOTE UPLOAD', 'Quote', session.quoteId, 'PASS', document['Document ID'] + '; ' + session.chunkCount + ' chunks verified.', access.user.email);
      return document;
    }, 'Quote', session.quoteId);
  } finally {
    boQuoteBuilderTrashUploadParts_(session);
    CacheService.getUserCache().remove(boQuoteBuilderUploadSessionKey_(session.sessionId));
  }
}

function boQuoteBuilderUploadAbort_(payload) {
  payload = payload || {};
  const session = boQuoteBuilderUploadSession_(payload.sessionId);
  boQuoteBuilderTrashUploadParts_(session);
  CacheService.getUserCache().remove(boQuoteBuilderUploadSessionKey_(session.sessionId));
  return { aborted: true, quoteId: session.quoteId };
}

function boQuoteBuilderApplyAiDraftToQuote_(quoteId, draftId) {
  return boSafeExecute_('Apply AI review draft to quote', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    boAssert_(quoteId && draftId, 'Quote ID and AI draft ID are required.');
    const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true });
    const quote = quoteSnapshot.rows.find(function (row) { return row['Quote ID'] === quoteId && row.Status !== 'Voided'; });
    boAssert_(quote, 'The saved quote was not found.');
    const activitySnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.ACTIVITY, { includeVoided: true });
    const draft = activitySnapshot.rows.find(function (row) { return row['Activity ID'] === draftId; });
    boAssert_(draft && draft['Activity Type'] === 'AI Quote Draft', 'The AI review draft was not found.');
    boAssert_(draft['Record ID'] === quote['Customer ID'], 'The AI draft customer does not match the quote.');
    let details = {};
    try { details = JSON.parse(draft.Details || '{}'); } catch (error) { details = {}; }
    const suggestions = Array.isArray(details.suggestedLines) ? details.suggestedLines.filter(function (line) {
      return boNormalizeText_(line && line.description);
    }).slice(0, 20) : [];
    if (!suggestions.length) return { quote: quote, appliedLines: 0, reviewRequired: true };

    const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided: true });
    const currentLines = lineSnapshot.rows.filter(function (line) { return line['Quote ID'] === quoteId; });
    boAssert_(currentLines.length === 1 && /^Uploaded quote intake/i.test(currentLines[0].Description || ''), 'AI matches can only replace the untouched upload-intake placeholder line.');
    let subtotal = 0;
    let tax = 0;
    const records = suggestions.map(function (line, index) {
      const quantity = Number(line.quantity || 1) || 1;
      const rate = boMoney_(line.rate || 0);
      const discount = boMoney_(line.discount || 0);
      const taxable = line.taxable === true || line.taxable === 'Yes' ? 'Yes' : 'No';
      const taxRate = Number(line.taxRate || 0);
      const lineSubtotal = boMoney_(Math.max(0, quantity * rate - discount));
      const taxAmount = taxable === 'Yes' ? boMoney_(lineSubtotal * taxRate) : 0;
      subtotal += lineSubtotal;
      tax += taxAmount;
      return {
        'Quote Line ID': index === 0 ? currentLines[0]['Quote Line ID'] : boId_('QL'),
        'Quote ID': quoteId,
        'Line Number': index + 1,
        'Product / Service ID': line.catalogId || '',
        Description: line.description,
        Quantity: quantity,
        Unit: line.unit || 'each',
        Rate: rate,
        Discount: discount,
        Taxable: taxable,
        'Tax Rate': taxRate,
        'Line Subtotal': lineSubtotal,
        'Tax Amount': taxAmount,
        'Line Total': boMoney_(lineSubtotal + taxAmount),
        'Account Code': '4000',
        'Job Cost Category': 'Service Revenue',
        Notes: 'Approved Price Book match staged by AI; owner review required.'
      };
    });
    lineSnapshot.sheet.getRange(currentLines[0].__rowNumber, 1, 1, lineSnapshot.headers.length).setValues([
      boQuoteBuilderPrepareRow_(lineSnapshot, records[0])
    ]);
    boQuoteBuilderAppendBatch_(lineSnapshot, records.slice(1));
    const priorNotes = boNormalizeText_(quote['Internal Notes']);
    const updated = boUpdateRecord_(H38_BO_SHEETS.QUOTES, quoteId, {
      Subtotal: boMoney_(subtotal),
      Tax: boMoney_(tax),
      Total: boMoney_(subtotal + tax),
      'Internal Notes': [priorNotes, 'AI Price Book matches applied from ' + draftId + '; final quantities, scope, pricing, tax, and customer release require owner review.'].filter(Boolean).join('\n')
    }, 'Apply AI review draft to saved quote');
    SpreadsheetApp.flush();
    boAudit_('UPDATE', H38_BO_SHEETS.QUOTE_LINES, quoteId, currentLines, records, 'Replace upload-intake placeholder with AI Price Book matches');
    boProof_('APPLY AI QUOTE DRAFT', 'Quote', quoteId, 'PASS', records.length + ' review-required lines applied; nothing sent.', access.user.email);
    boQuoteBuilderInvalidateCache_('quotes');
    return { quote: updated, appliedLines: records.length, reviewRequired: true };
  }, 'Quote', quoteId);
}
