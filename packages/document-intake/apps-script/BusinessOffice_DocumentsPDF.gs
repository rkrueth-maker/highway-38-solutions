/** Business Office Platform — private document storage, OCR-assisted review, and branded PDF generation. */

function boSanitizeFilename_(name) {
  const sanitized = boNormalizeText_(name)
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .slice(0, 160);
  return sanitized || 'document';
}

function boDecodeUpload_(base64Data) {
  const raw = String(base64Data || '').replace(/^data:[^;]+;base64,/, '');
  boAssert_(raw, 'File data is required.');
  return Utilities.base64Decode(raw);
}

function boHashBytes_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function boUploadDocument(payload) {
  return boSafeExecute_('Document upload', function () {
    const user = boRequirePermission_(BO_SHEETS.DOCUMENTS, 'Create');
    boAssert_(payload && payload.fileName && payload.mimeType && payload.base64Data, 'File name, type, and data are required.');
    const mimeType = boNormalizeText_(payload.mimeType).toLowerCase();
    boAssert_(BO_PLATFORM.ALLOWED_MIME_TYPES.indexOf(mimeType) >= 0, 'Unsupported file type: ' + mimeType);
    const bytes = boDecodeUpload_(payload.base64Data);
    boAssert_(bytes.length <= BO_PLATFORM.MAX_UPLOAD_BYTES, 'File exceeds the 20 MB upload limit.');
    const safeName = boSanitizeFilename_(payload.fileName);
    const hash = boHashBytes_(bytes);
    const duplicate = boReadTable_(BO_SHEETS.DOCUMENTS, { includeVoided: true }).find(function (row) {
      return row.SHA256 === hash && row['Is Voided'] !== 'Yes';
    });
    boAssert_(!duplicate, 'Duplicate upload blocked. Existing document: ' + (duplicate ? duplicate['Document ID'] : 'unknown'));
    const documentId = boId_('DOC');
    const blob = Utilities.newBlob(bytes, mimeType, documentId + '-' + safeName);
    const folder = DriveApp.getFolderById(boGetFolderId_(BO_PLATFORM.DOCUMENT_FOLDER_PROPERTY));
    const file = folder.createFile(blob);
    file.setDescription(boGetBranding_().originalFileDescription + ' Document ID: ' + documentId);
    const conditional = BO_PLATFORM.CONDITIONAL_MIME_TYPES.indexOf(mimeType) >= 0;
    const document = boAppendRecord_(BO_SHEETS.DOCUMENTS, {
      'Document ID': documentId,
      'File ID': file.getId(),
      'File URL': file.getUrl(),
      'File Name': safeName,
      'MIME Type': mimeType,
      'Size Bytes': bytes.length,
      SHA256: hash,
      'Source Type': payload.sourceType || 'Other',
      'Source ID': payload.sourceId || '',
      'Document Type': payload.documentType || 'Other',
      'Original File ID': file.getId(),
      'Preview File ID': '',
      'Upload State': 'Uploaded',
      'OCR State': conditional ? 'Needs Conversion Review' : 'Not Requested',
      'Review Status': 'Needs Review',
      'Approval Status': boApprovalText_('required'),
      'Posted Status': 'Not Posted',
      'Export Status': 'Not Exported',
      'Duplicate Key': boGetBusinessId_() + '|' + hash,
      'Is Original': 'Yes',
      'Is Voided': 'No',
      'Access Classification': payload.accessClassification || 'Private Business',
      'Uploaded By': user['User ID'],
      'Uploaded Time': boNow_()
    }, 'Private document upload');
    boProof_('UPLOAD DOCUMENT', 'Document', documentId, 'PASS', file.getId() + '; original preserved.', user.Email);
    return document;
  }, 'Document', payload && payload.documentId);
}

function boGetDocumentPreview(documentId) {
  const user = boRequirePermission_(BO_SHEETS.DOCUMENTS, 'View');
  const document = boFindRecord_(BO_SHEETS.DOCUMENTS, documentId, { includeVoided: true }).record;
  boAssert_(document['Is Voided'] !== 'Yes', 'This document has been voided.');
  boAudit_('DOCUMENT ACCESS', 'Document', documentId, {}, { user: user.Email }, 'Preview');
  return {
    documentId: documentId,
    fileId: document['File ID'],
    fileUrl: document['File URL'],
    mimeType: document['MIME Type'],
    fileName: document['File Name'],
    reviewStatus: document['Review Status'],
    approvalStatus: document['Approval Status']
  };
}

function boVoidDocument(documentId, reason) {
  const owner = boRequireOwner_();
  const document = boFindRecord_(BO_SHEETS.DOCUMENTS, documentId, { includeVoided: true }).record;
  boAssert_(document['Is Voided'] !== 'Yes', 'Document is already voided.');
  const updated = boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, {
    'Is Voided': 'Yes',
    'Review Status': 'Voided',
    'Approval Status': 'Rejected',
    'Posted Status': 'Voided',
    Notes: 'Soft void: ' + boNormalizeText_(reason)
  }, 'Document soft void');
  boProof_('VOID DOCUMENT', 'Document', documentId, 'PASS', 'Drive original preserved.', owner.Email);
  return updated;
}

function boExtractDocument(documentId) {
  return boSafeExecute_('OCR-assisted extraction', function () {
    const user = boRequirePermission_(BO_SHEETS.DOCUMENTS, 'Edit');
    const document = boFindRecord_(BO_SHEETS.DOCUMENTS, documentId).record;
    boAssert_(document['Review Status'] !== 'Approved' && document['Posted Status'] !== 'Posted', 'Approved or posted documents cannot be re-extracted without a correction workflow.');
    boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, { 'OCR State': 'Processing', 'Upload State': 'Processing' }, 'OCR extraction');
    let text = '';
    try {
      text = boExtractTextWithDriveOcr_(document);
    } catch (error) {
      boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, {
        'OCR State': 'Needs Review',
        'Upload State': 'Uploaded',
        'Review Status': 'Needs Review'
      }, 'OCR unavailable');
      boError_('Drive OCR', 'Document', documentId, error, 'Warning');
      return { documentId: documentId, state: 'Needs Review', providerBoundary: true, message: 'Original preserved. OCR could not complete; manual review remains available.' };
    }
    const suggestions = boParseDocumentText_(document['Document Type'], text);
    suggestions.forEach(function (suggestion) {
      boAppendRecord_(BO_SHEETS.OCR_FIELDS, {
        'OCR Field ID': boId_('OCR'),
        'Document ID': documentId,
        'Field Name': suggestion.fieldName,
        'Extracted Value': suggestion.value,
        Confidence: suggestion.confidence,
        'Suggested Value': suggestion.suggestedValue || suggestion.value,
        'Review Status': 'Needs Review',
        'User Correction': '',
        'Approved Value': '',
        'Source Page': suggestion.page || '1',
        'Source Region': suggestion.region || 'Text'
      }, 'OCR-assisted extraction');
    });
    boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, {
      'OCR State': 'Extraction Complete',
      'Upload State': 'Extraction Complete',
      'Review Status': 'Needs Review'
    }, 'OCR extraction');
    boProof_('OCR EXTRACTION', 'Document', documentId, 'PASS', suggestions.length + ' suggested fields; no posting.', user.Email);
    return { documentId: documentId, state: 'Needs Review', suggestions: suggestions, posted: false };
  }, 'Document', documentId);
}

function boExtractTextWithDriveOcr_(document) {
  const file = DriveApp.getFileById(document['File ID']);
  const mimeType = document['MIME Type'];
  if (mimeType === 'image/heic' || mimeType === 'image/heif') throw new Error('HEIC conversion is not enabled in this deployment.');
  if (mimeType === 'application/pdf' || mimeType.indexOf('image/') === 0) {
    boAssert_(typeof Drive !== 'undefined' && Drive.Files, 'Advanced Drive service is required for OCR.');
    const resource = { name: 'OCR-' + document['Document ID'], mimeType: 'application/vnd.google-apps.document' };
    const converted = Drive.Files.create(resource, file.getBlob(), { ocrLanguage: 'en', fields: 'id' });
    try {
      return DocumentApp.openById(converted.id).getBody().getText();
    } finally {
      DriveApp.getFileById(converted.id).setTrashed(true);
    }
  }
  throw new Error('No OCR handler for ' + mimeType);
}

function boParseDocumentText_(documentType, text) {
  const normalized = String(text || '').replace(/\r/g, '\n');
  const lines = normalized.split(/\n+/).map(boNormalizeText_).filter(Boolean);
  const moneyMatches = normalized.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})/g) || [];
  const dateMatch = normalized.match(/\b(?:20\d{2}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]20\d{2})\b/);
  const total = moneyMatches.length ? moneyMatches[moneyMatches.length - 1].replace(/[$,]/g, '') : '';
  const type = boNormalizeText_(documentType).toLowerCase();
  const results = [];
  function add(fieldName, value, confidence, region) {
    if (boNormalizeText_(value)) results.push({ fieldName: fieldName, value: value, confidence: confidence, region: region || 'Text', page: '1' });
  }
  if (type.indexOf('receipt') >= 0) {
    add('Vendor', lines[0] || '', 0.55, 'Header');
    add('Date', dateMatch ? dateMatch[0] : '', dateMatch ? 0.85 : 0.25, 'Header');
    add('Total', total, total ? 0.80 : 0.20, 'Totals');
    const taxLine = lines.find(function (line) { return /\btax\b/i.test(line); });
    add('Tax', taxLine || '', taxLine ? 0.55 : 0.15, 'Totals');
    add('Suggested Expense Category', boSuggestExpenseCategory_(normalized), 0.45, 'Heuristic');
  } else if (type.indexOf('work order') >= 0) {
    add('Customer', lines[0] || '', 0.45, 'Header');
    add('Work Requested', lines.slice(1, 5).join(' '), 0.50, 'Body');
    add('Due Date', dateMatch ? dateMatch[0] : '', dateMatch ? 0.70 : 0.20, 'Body');
  } else if (type.indexOf('vendor') >= 0 || type.indexOf('invoice') >= 0 || type.indexOf('purchase') >= 0) {
    add('Vendor', lines[0] || '', 0.55, 'Header');
    add('Document Date', dateMatch ? dateMatch[0] : '', dateMatch ? 0.80 : 0.20, 'Header');
    add('Total', total, total ? 0.80 : 0.20, 'Totals');
    const poMatch = normalized.match(/\bPO[-\s:#]*([A-Z0-9-]+)/i);
    add('Purchase Order Reference', poMatch ? poMatch[1] : '', poMatch ? 0.75 : 0.15, 'Header');
  } else {
    add('Document Summary', lines.slice(0, 8).join(' '), 0.35, 'Text');
    add('Date', dateMatch ? dateMatch[0] : '', dateMatch ? 0.60 : 0.15, 'Text');
    add('Total', total, total ? 0.55 : 0.10, 'Text');
  }
  return results;
}

function boSuggestExpenseCategory_(text) {
  const value = String(text || '').toLowerCase();
  if (/fuel|gas station|diesel/.test(value)) return 'Vehicle / Fuel';
  if (/lumber|hardware|fastener|tool|supply/.test(value)) return 'Materials';
  if (/software|subscription|hosting/.test(value)) return 'Software';
  if (/meal|restaurant/.test(value)) return 'Meals';
  return 'Review Required';
}

function boReviewOcrField(ocrFieldId, approvedValue, notes) {
  return boSafeExecute_('OCR field review', function () {
    const user = boRequirePermission_(BO_SHEETS.OCR_FIELDS, 'Edit');
    const field = boFindRecord_(BO_SHEETS.OCR_FIELDS, ocrFieldId, { includeVoided: true }).record;
    const previous = field['Approved Value'] || field['Extracted Value'];
    const value = boNormalizeText_(approvedValue);
    boAssert_(value, 'An approved value or explicit correction is required.');
    boAppendRecord_(BO_SHEETS.OCR_CORRECTIONS, {
      'Correction ID': boId_('CORRECTION'),
      'OCR Field ID': ocrFieldId,
      'Document ID': field['Document ID'],
      'Previous Value': previous,
      'New Value': value,
      Reason: notes || 'Human review',
      'Corrected By': user['User ID'],
      'Corrected Time': boNow_()
    }, 'OCR review');
    const updated = boUpdateRecord_(BO_SHEETS.OCR_FIELDS, ocrFieldId, {
      'User Correction': value === field['Extracted Value'] ? '' : value,
      'Approved Value': value,
      'Review Status': 'Approved'
    }, 'OCR review');
    boProof_('REVIEW OCR FIELD', 'OCR Field', ocrFieldId, 'PASS', 'Human-approved value recorded.', user.Email);
    return updated;
  }, 'OCR Field', ocrFieldId);
}

function boApproveDocument(documentId) {
  return boSafeExecute_('Approve document', function () {
    const owner = boRequireOwner_();
    const document = boFindRecord_(BO_SHEETS.DOCUMENTS, documentId).record;
    const fields = boReadTable_(BO_SHEETS.OCR_FIELDS, { includeVoided: true }).filter(function (row) { return row['Document ID'] === documentId; });
    const unresolved = fields.filter(function (field) { return field['Review Status'] !== 'Approved'; });
    boAssert_(!unresolved.length, 'Every extracted field must be reviewed before document approval.');
    const updated = boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, {
      'Review Status': 'Approved',
      'Approval Status': 'Approved',
      'Upload State': 'Approved'
    }, 'Document approval');
    boProof_('APPROVE DOCUMENT', 'Document', documentId, 'PASS', 'Human-reviewed; no ledger posting.', owner.Email);
    return updated;
  }, 'Document', documentId);
}

function boPostApprovedDocument(documentId, targetType) {
  return boSafeExecute_('Post approved document', function () {
    const user = boRequireRestrictedArea_('posting');
    const document = boFindRecord_(BO_SHEETS.DOCUMENTS, documentId).record;
    boAssert_(document['Approval Status'] === 'Approved' && document['Review Status'] === 'Approved', 'Document review and approval are required before posting.');
    boAssert_(document['Posted Status'] !== 'Posted', 'Document is already posted.');
    const values = {};
    boReadTable_(BO_SHEETS.OCR_FIELDS, { includeVoided: true }).filter(function (row) {
      return row['Document ID'] === documentId && row['Review Status'] === 'Approved';
    }).forEach(function (row) { values[row['Field Name']] = row['Approved Value']; });
    let target;
    if (targetType === 'Receipt') {
      target = boAppendRecord_(BO_SHEETS.RECEIPTS, {
        'Receipt ID': boId_('RECEIPT'),
        'Document ID': documentId,
        'Receipt Number': values['Receipt Number'] || '',
        Date: values.Date || '',
        Subtotal: boMoney_(values.Subtotal || 0),
        Tax: boMoney_(values.Tax || 0),
        Total: boMoney_(values.Total || 0),
        'Approval Status': boApprovalText_('required'),
        'Posting Status': 'Not Posted',
        'OCR Status': 'Approved',
        'Duplicate Key': boGetBusinessId_() + '|' + documentId
      }, 'Approved document posting');
    } else {
      throw new Error('Posting target requires a controlled module-specific workflow: ' + targetType);
    }
    boUpdateRecord_(BO_SHEETS.DOCUMENTS, documentId, { 'Posted Status': 'Posted', 'Upload State': 'Posted' }, 'Approved document posting');
    boProof_('POST DOCUMENT DATA', 'Document', documentId, 'PASS', targetType + ' ' + boPrimaryKeyValue_(target), user.Email);
    return target;
  }, 'Document', documentId);
}

function boPrimaryKeyValue_(record) {
  return Object.keys(record || {}).find(function (key) { return / ID$/.test(key); }) ? record[Object.keys(record).find(function (key) { return / ID$/.test(key); })] : '';
}

function boGeneratePdf(documentType, recordId) {
  return boSafeExecute_('Generate PDF', function () {
    const user = boRequirePermission_('PDF Templates', 'Export');
    const source = boGetPdfSource_(documentType, recordId);
    const template = boReadTable_(BO_SHEETS.PDF_TEMPLATES, { includeVoided: true }).find(function (row) {
      return row['Document Type'] === documentType && row.Status === 'Active';
    });
    boAssert_(template, 'No active PDF template for ' + documentType + '.');
    const doc = DocumentApp.create(documentType + '-' + recordId + '-' + boNow_().replace(/[: ]/g, '-'));
    const body = doc.getBody();
    body.setMarginTop(36).setMarginBottom(36).setMarginLeft(42).setMarginRight(42);
    const title = body.appendParagraph(source.businessName || boGetBranding_().businessName);
    title.setHeading(DocumentApp.ParagraphHeading.HEADING1).setBold(true);
    body.appendParagraph(documentType).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph('Document ID: ' + recordId);
    body.appendParagraph('Generated: ' + boNow_() + ' CT');
    body.appendParagraph('Status: ' + (source.status || 'Prepared'));
    body.appendHorizontalRule();
    source.sections.forEach(function (section) {
      body.appendParagraph(section.title).setHeading(DocumentApp.ParagraphHeading.HEADING3);
      if (section.rows && section.rows.length) {
        const table = body.appendTable();
        section.rows.forEach(function (row) {
          const tableRow = table.appendTableRow();
          tableRow.appendTableCell(String(row[0] == null ? '' : row[0])).setBold(true);
          tableRow.appendTableCell(String(row[1] == null ? '' : row[1]));
        });
      }
      if (section.text) body.appendParagraph(section.text);
    });
    body.appendHorizontalRule();
    body.appendParagraph('Approval state: ' + (source.approvalStatus || boApprovalText_('required')));
    body.appendParagraph('Supporting-document references: ' + (source.supportingDocuments || 'None listed'));
    body.appendParagraph(documentType === 'Tax Preparation Packet' ? BO_PLATFORM.TAX_BOUNDARY : BO_PLATFORM.ACCOUNTING_BOUNDARY).setItalic(true);
    const footer = doc.addFooter();
    footer.appendParagraph(boGetBranding_().documentFooter).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    doc.saveAndClose();
    const sourceFile = DriveApp.getFileById(doc.getId());
    const pdfBlob = sourceFile.getAs(MimeType.PDF).setName(documentType.replace(/\s+/g, '-') + '-' + recordId + '.pdf');
    const folder = DriveApp.getFolderById(boGetFolderId_(BO_PLATFORM.PDF_FOLDER_PROPERTY));
    const pdfFile = folder.createFile(pdfBlob);
    sourceFile.setTrashed(true);
    boProof_('GENERATE PDF', documentType, recordId, 'PASS', pdfFile.getId() + '; no email or delivery.', user.Email);
    return { fileId: pdfFile.getId(), fileUrl: pdfFile.getUrl(), fileName: pdfFile.getName(), delivered: false, sent: false };
  }, documentType, recordId);
}

function boGetPdfSource_(documentType, recordId) {
  const business = boReadTable_(BO_SHEETS.BUSINESSES, { includeVoided: true }).find(function (row) { return row['Business ID'] === boGetBusinessId_(); }) || {};
  const map = {
    Quote: BO_SHEETS.QUOTES,
    Estimate: BO_SHEETS.QUOTES,
    'Work Order': BO_SHEETS.WORK_ORDERS,
    'Purchase Order': BO_SHEETS.PURCHASE_ORDERS,
    Invoice: BO_SHEETS.INVOICES,
    'Payment Receipt': BO_SHEETS.PAYMENTS,
    'Expense Report': BO_SHEETS.EXPENSES,
    'Job Cost Report': BO_SHEETS.JOBS,
    'Customer Project Summary': BO_SHEETS.JOBS,
    'Payroll Summary': BO_SHEETS.PAYROLL_PERIODS,
    'Sales Tax Summary': BO_SHEETS.TAX_PERIODS,
    'Tax Preparation Packet': BO_SHEETS.TAX_PERIODS,
    'Year-End Accountant Package': BO_SHEETS.TAX_PERIODS
  };
  const sheetName = map[documentType];
  boAssert_(sheetName, 'Unsupported PDF document type: ' + documentType);
  const record = boFindRecord_(sheetName, recordId, { includeVoided: true }).record;
  const ignored = ['__rowNumber', 'Business ID', 'Created Time', 'Updated Time'];
  const rows = Object.keys(record).filter(function (key) { return ignored.indexOf(key) < 0 && record[key] !== ''; }).map(function (key) {
    return [key, record[key]];
  });
  return {
    businessName: business['Public Name'] || business['Legal Name'] || boGetBranding_().businessName,
    status: record.Status || record['Posting Status'] || record['Review Status'] || 'Prepared',
    approvalStatus: record['Approval Status'] || record['Owner Approval Status'] || boApprovalText_('required'),
    supportingDocuments: record['Attachment Document ID'] || record['Document ID'] || record['Supporting Document IDs'] || 'None listed',
    sections: [{ title: documentType + ' Details', rows: rows }]
  };
}
