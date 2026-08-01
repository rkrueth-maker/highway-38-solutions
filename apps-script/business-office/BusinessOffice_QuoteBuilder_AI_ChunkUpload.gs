/** Raw-file chunk staging for Android Quote Builder photo analysis. */

var H38_QB_AI_CACHE_SEGMENT_CHARS = 80000;
var H38_QB_AI_CACHE_BATCH_SIZE = 20;

function boQuoteBuilderAiChunkKey_(sessionId) {
  return 'H38QB_AI_CHUNK:' + boNormalizeText_(sessionId);
}

function boQuoteBuilderAiChunkPartKey_(sessionId, index, segment) {
  return ['H38QB_AI_PART', boNormalizeText_(sessionId), Number(index), Number(segment)].join(':');
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

function boQuoteBuilderAiChunkCacheKeys_(session, index) {
  const meta = session && session.parts && session.parts[String(index)];
  if (!meta || !Number(meta.segments)) return [];
  const keys = [];
  for (let segment = 0; segment < Number(meta.segments); segment += 1) {
    keys.push(boQuoteBuilderAiChunkPartKey_(session.sessionId, index, segment));
  }
  return keys;
}

function boQuoteBuilderCacheAiChunk_(session, index, data) {
  const cache = CacheService.getUserCache();
  const entries = {};
  let segment = 0;
  for (let offset = 0; offset < data.length; offset += H38_QB_AI_CACHE_SEGMENT_CHARS) {
    entries[boQuoteBuilderAiChunkPartKey_(session.sessionId, index, segment)] = data.slice(offset, offset + H38_QB_AI_CACHE_SEGMENT_CHARS);
    segment += 1;
  }
  const keys = Object.keys(entries);
  for (let start = 0; start < keys.length; start += H38_QB_AI_CACHE_BATCH_SIZE) {
    const batch = {};
    keys.slice(start, start + H38_QB_AI_CACHE_BATCH_SIZE).forEach(function (key) { batch[key] = entries[key]; });
    cache.putAll(batch, 1800);
  }
  session.parts[String(index)] = { segments: segment, length: data.length, storage: 'user_cache' };
  return session;
}

function boQuoteBuilderReadAiChunk_(session, index) {
  const keys = boQuoteBuilderAiChunkCacheKeys_(session, index);
  boAssert_(keys.length, 'Photo chunk ' + (Number(index) + 1) + ' is missing.');
  const cache = CacheService.getUserCache();
  const values = cache.getAll(keys);
  const chunks = keys.map(function (key) {
    boAssert_(Object.prototype.hasOwnProperty.call(values, key), 'A temporary photo segment expired. Choose the photo again.');
    return values[key];
  });
  const data = chunks.join('');
  const expected = Number(session.parts[String(index)].length || 0);
  boAssert_(!expected || data.length === expected, 'A temporary photo segment was incomplete. Choose the photo again.');
  return data;
}

function boQuoteBuilderTrashAiChunks_(session) {
  const keys = [];
  Object.keys((session && session.parts) || {}).forEach(function (index) {
    boQuoteBuilderAiChunkCacheKeys_(session, index).forEach(function (key) { keys.push(key); });
  });
  if (keys.length) {
    try { CacheService.getUserCache().removeAll(keys); }
    catch (error) { console.log('H38 AI chunk cleanup: ' + error.message); }
  }
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
    boAssert_(data && data.length <= 9000000, 'Photo chunk exceeds the safe request size.');
    if (index < session.chunkCount - 1) boAssert_(data.indexOf('=') < 0, 'A non-final photo chunk was padded unexpectedly.');
    if (session.parts[String(index)]) return { sessionId: session.sessionId, index: index, duplicatePrevented: true };

    boQuoteBuilderCacheAiChunk_(session, index, data);
    boQuoteBuilderStoreAiChunk_(session);
    return { sessionId: session.sessionId, index: index, received: Object.keys(session.parts).length, storage: 'user_cache' };
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
        base64Data += boQuoteBuilderReadAiChunk_(session, index);
      }
      const bytes = Utilities.base64Decode(base64Data);
      boAssert_(bytes.length === session.sizeBytes, 'The uploaded photo did not pass completeness verification.');
      const staged = boQuoteBuilderStageAiPhoto({
        customerId: session.customerId,
        fileName: session.fileName,
        mimeType: session.mimeType,
        base64Data: 'data:' + session.mimeType + ';base64,' + base64Data
      });
      boProof_('RAW CHUNKED AI QUOTE PHOTO', 'Customer', session.customerId, 'PASS', staged.documentId + '; ' + session.chunkCount + ' cached chunks verified.', session.startedBy);
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
