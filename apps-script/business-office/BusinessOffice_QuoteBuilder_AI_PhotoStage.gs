/** Server-staged Quote Builder photos keep large image payloads out of the phone tab. */

function boQuoteBuilderStageAiPhoto(payload) {
  boGuardApiRequest_('prepareAiQuoteDraft', payload || {});
  return boSafeExecute_('Stage AI quote photo', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    payload = payload || {};
    const customerId = boNormalizeText_(payload.customerId || 'CUST-H38-GENERIC-QUOTE');
    const mimeType = boNormalizeText_(payload.mimeType).toLowerCase();
    boAssert_(customerId, 'A quote customer reference is required.');
    boAssert_(/^image\/(jpeg|png|webp)$/.test(mimeType), 'Use a JPEG, PNG, or WebP photo.');
    boAssert_(payload.base64Data, 'Photo data is required.');

    const bytes = boDecodeUpload_(payload.base64Data);
    boAssert_(bytes.length <= H38_BO.MAX_UPLOAD_BYTES, 'Photo exceeds the 20 MB upload limit.');
    const safeName = boSanitizeFilename_(payload.fileName || ('quote-photo-' + Date.now() + '.jpg'));
    const hash = boHashBytes_(bytes);
    const duplicate = boReadTable_(H38_BO_SHEETS.DOCUMENTS, { includeVoided: true }).find(function (row) {
      return row.SHA256 === hash && row['Is Voided'] !== 'Yes' && /^image\//i.test(row['MIME Type'] || '');
    });
    if (duplicate) {
      boProof_('REUSE AI QUOTE PHOTO', 'Document', duplicate['Document ID'], 'PASS', duplicate['File ID'], access.user.email);
      return {
        documentId: duplicate['Document ID'],
        fileId: duplicate['File ID'],
        mimeType: duplicate['MIME Type'],
        fileName: duplicate['File Name'],
        sizeBytes: Number(duplicate['Size Bytes'] || bytes.length),
        reused: true
      };
    }

    const documentId = boId_('DOC');
    const blob = Utilities.newBlob(bytes, mimeType, documentId + '-' + safeName);
    const folder = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
    const file = folder.createFile(blob);
    file.setDescription('Private Quote Builder AI field photo. Document ID: ' + documentId);
    const document = boAppendRecord_(H38_BO_SHEETS.DOCUMENTS, {
      'Document ID': documentId,
      'File ID': file.getId(),
      'File URL': file.getUrl(),
      'File Name': safeName,
      'MIME Type': mimeType,
      'Size Bytes': bytes.length,
      SHA256: hash,
      'Source Type': 'Quote Builder AI',
      'Source ID': customerId,
      'Document Type': 'Quote Field Photo',
      'Original File ID': file.getId(),
      'Preview File ID': '',
      'Upload State': 'Uploaded',
      'OCR State': 'Not Requested',
      'Review Status': 'Needs Review',
      'Approval Status': 'Owner Approval Required',
      'Posted Status': 'Not Posted',
      'Export Status': 'Not Exported',
      'Duplicate Key': boGetBusinessId_() + '|' + hash,
      'Is Original': 'Yes',
      'Is Voided': 'No',
      'Access Classification': 'Private Customer',
      'Uploaded By': access.user.id,
      'Uploaded Time': boNow_()
    }, 'Quote Builder AI photo staging');
    boProof_('STAGE AI QUOTE PHOTO', 'Document', documentId, 'PASS', file.getId() + '; original preserved.', access.user.email);
    return {
      documentId: document['Document ID'],
      fileId: document['File ID'],
      mimeType: document['MIME Type'],
      fileName: document['File Name'],
      sizeBytes: Number(document['Size Bytes'] || bytes.length),
      reused: false
    };
  }, 'Customer', payload && payload.customerId);
}

function boQuoteBuilderAiPhotoInputs_(payload) {
  payload = payload || {};
  const ids = (payload.photoDocumentIds || []).map(boNormalizeText_).filter(Boolean);
  const unique = [];
  ids.forEach(function (id) { if (unique.indexOf(id) < 0) unique.push(id); });
  const selected = unique.slice(0, 4);
  const urls = [];
  const acceptedIds = [];
  let totalBytes = 0;

  selected.forEach(function (documentId) {
    const document = boFindRecord_(H38_BO_SHEETS.DOCUMENTS, documentId, { includeVoided: true }).record;
    boAssert_(document['Is Voided'] !== 'Yes', 'A staged quote photo was voided.');
    const mimeType = boNormalizeText_(document['MIME Type']).toLowerCase();
    boAssert_(/^image\/(jpeg|png|webp)$/.test(mimeType), 'A staged quote photo is not a supported image.');
    const blob = DriveApp.getFileById(document['File ID']).getBlob();
    const bytes = blob.getBytes();
    totalBytes += bytes.length;
    boAssert_(totalBytes <= 18 * 1024 * 1024, 'The selected photos are too large to analyze together. Use fewer photos.');
    urls.push('data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes));
    acceptedIds.push(documentId);
  });

  return { urls: urls, documentIds: acceptedIds, totalBytes: totalBytes };
}
