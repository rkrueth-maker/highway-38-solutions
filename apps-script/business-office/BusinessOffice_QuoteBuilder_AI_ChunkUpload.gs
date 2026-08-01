/** Raw-file chunk staging for Android Quote Builder photo analysis. */

function boQuoteBuilderAiChunkKey_(sessionId) {
  return 'H38QB_AI_CHUNK:' + boNormalizeText_(sessionId);
}

function boQuoteBuilderAiChunkSession_(sessionId) {
  const raw = CacheService.getUserCache().get(boQuoteBuilderAiChunkKey_(sessionId));
  boAssert_(raw, 'The photo upload session expired. Choose the photo again.');
  let session;
  try { session = JSON.parse(raw); } catch (error) { session = null; }
  boAssert_(session && session.sessionId === sessionId, 'The photo upload session is invalid.');
  return session;
}

function boQuoteBuilderStoreAiChunk_(session) {
  CacheService.getUserCache().put(boQuoteBuilderAiChunkKey_(session.sessionId), JSON.stringify(session), 1800);
  return session;
}

function boQuoteBuilderTrashAiChunks_(session) {
  Object.keys((session && session.parts) || {}).forEach(function (key) {
    try { DriveApp.getFileById(session.parts[key]).setTrashed(true); } catch (error) { console.log('H38 AI chunk cleanup: ' + error.message); }
  });
}

function boQuoteBuilderAiChunkBegin(payload) {
  boGuardApiRequest_('prepareAiQuoteDraft', payload || {});
  return boSafeExecute_('Begin raw AI photo upload', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    payload = payload || {};
    const customerId = boNormalizeText_(payload.customerId || 'CUST-H38-GENERIC-QUOTE');
    const mimeType = boNormalizeText_(payload.mimeType).toLowerCase();
    const sizeBytes = Number(payload.sizeBytes || 0);
    const chunkCount = Number(payload.chunkCount || 0);
    boAssert_(customerId, 'A quote customer reference is required.');
    boAssert_(/^image\/(jpeg|png|webp)$/.test(mimeType), 'Use a JPEG, PNG, or WebP photo.');
    boAssert_(sizeBytes > 0 && sizeBytes <= H38_BO.MAX_UPLOAD_BYTES, 'Photo exceeds the 20 MB upload limit.');
    boAssert_(Number.isInteger(chunkCount) && chunkCount > 0 && chunkCount <= 28, 'Invalid photo chunk count.');
    const session = {
      sessionId: boId_('QBAIUP'),
      customerId: customerId,
      fileName: boSanitizeFilename_(payload.fileName || ('quote-photo-' + Date.now() + '.jpg')),
      mimeType: mimeType,
      sizeBytes: sizeBytes,
      chunkCount: chunkCount,
      parts: {},
      startedBy: access.user.email,
      startedTime: boNow_()
    };
    boQuoteBuilderStoreAiChunk_(session);
    return { sessionId: session.sessionId, chunkCount: session.chunkCount };
  }, 'Customer', payload && payload.customerId);
}

function boQuoteBuilderAiChunkPart(payload) {
  return boSafeExecute_('Upload raw AI photo chunk', function () {
    boQuoteBuilderRequireAction_('Create');
    payload = payload || {};
    const session = boQuoteBuilderAiChunkSession_(payload.sessionId);
    const index = Number(payload.index);
    const data = String(payload.data || '');
    boAssert_(Number.isInteger(index) && index >= 0 && index < session.chunkCount, 'Invalid photo chunk index.');
    boAssert_(data && data.length <= 1100000, 'Photo chunk exceeds the safe request size.');
    if (index < session.chunkCount - 1) boAssert_(data.indexOf('=') < 0, 'A non-final photo chunk was padded unexpectedly.');
    if (session.parts[String(index)]) return { sessionId: session.sessionId, index: index, duplicatePrevented: true };
    const folder = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
    const part = folder.createFile(Utilities.newBlob(data, 'text/plain', '.h38-ai-' + session.sessionId + '-' + index + '.part'));
    part.setDescription('Temporary private Quote Builder AI photo part. Customer: ' + session.customerId);
    session.parts[String(index)] = part.getId();
    boQuoteBuilderStoreAiChunk_(session);
    return { sessionId: session.sessionId, index: index, received: Object.keys(session.parts).length };
  }, 'Customer', payload && payload.customerId);
}

function boQuoteBuilderAiChunkFinish(payload) {
  payload = payload || {};
  const session = boQuoteBuilderAiChunkSession_(payload.sessionId);
  try {
    return boSafeExecute_('Finalize raw AI photo upload', function () {
      boQuoteBuilderRequireAction_('Create');
      boAssert_(Object.keys(session.parts).length === session.chunkCount, 'The photo upload is incomplete. Choose the photo again.');
      let base64Data = '';
      for (let index = 0; index < session.chunkCount; index += 1) {
        boAssert_(session.parts[String(index)], 'Photo chunk ' + (index + 1) + ' is missing.');
        base64Data += DriveApp.getFileById(session.parts[String(index)]).getBlob().getDataAsString('UTF-8');
      }
      const bytes = Utilities.base64Decode(base64Data);
      boAssert_(bytes.length === session.sizeBytes, 'The uploaded photo did not pass completeness verification.');
      const staged = boQuoteBuilderStageAiPhoto({
        customerId: session.customerId,
        fileName: session.fileName,
        mimeType: session.mimeType,
        base64Data: 'data:' + session.mimeType + ';base64,' + base64Data
      });
      boProof_('RAW CHUNKED AI QUOTE PHOTO', 'Customer', session.customerId, 'PASS', staged.documentId + '; ' + session.chunkCount + ' chunks verified.', session.startedBy);
      return staged;
    }, 'Customer', session.customerId);
  } finally {
    boQuoteBuilderTrashAiChunks_(session);
    CacheService.getUserCache().remove(boQuoteBuilderAiChunkKey_(session.sessionId));
  }
}

function boQuoteBuilderAiChunkAbort(payload) {
  payload = payload || {};
  const session = boQuoteBuilderAiChunkSession_(payload.sessionId);
  boQuoteBuilderTrashAiChunks_(session);
  CacheService.getUserCache().remove(boQuoteBuilderAiChunkKey_(session.sessionId));
  return { aborted: true, customerId: session.customerId };
}

function boQuoteBuilderAttachStagedAiPhotos(payload) {
  return boSafeExecute_('Attach staged AI photos to quote', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    payload = payload || {};
    const quoteId = boNormalizeText_(payload.quoteId);
    const ids = (payload.documentIds || []).map(boNormalizeText_).filter(Boolean).slice(0, 4);
    boAssert_(quoteId, 'Quote ID is required.');
    const quote = boFindRecord_(H38_BO_SHEETS.QUOTES, quoteId, { includeVoided: true }).record;
    boAssert_(quote && quote['Is Voided'] !== 'Yes', 'The saved quote was not found.');
    ids.forEach(function (documentId) {
      const document = boFindRecord_(H38_BO_SHEETS.DOCUMENTS, documentId, { includeVoided: true }).record;
      boAssert_(document && document['Is Voided'] !== 'Yes', 'A staged quote photo was not found.');
      boAssert_(document['Source Type'] === 'Quote Builder AI' || document['Source ID'] === quoteId, 'The document is not a staged Quote Builder photo.');
      boUpdateRecord_(H38_BO_SHEETS.DOCUMENTS, documentId, {
        'Source Type': 'Quote',
        'Source ID': quoteId,
        'Document Type': 'Quote Field Photo',
        'Access Classification': 'Private Customer'
      }, 'Attach staged AI photo to saved quote');
    });
    boProof_('ATTACH STAGED AI PHOTOS', 'Quote', quoteId, 'PASS', ids.length + ' private photos linked; nothing sent.', access.user.email);
    boQuoteBuilderInvalidateCache_('documents');
    return { quoteId: quoteId, attached: ids.length, documentIds: ids };
  }, 'Quote', payload && payload.quoteId);
}
