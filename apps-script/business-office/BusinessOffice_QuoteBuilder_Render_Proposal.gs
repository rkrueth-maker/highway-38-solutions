/** Token-scoped proposal rendering for owner-approved H38 Render Studio concepts. */
var H38_QB_RENDER_PROPOSAL = Object.freeze({
  ACTIVITY_TYPE:'AI Completion Visual',
  APPROVED_STATUS:'Owner Approved for Proposal',
  MAX_IMAGE_BYTES:3145728
});

function boCustomerProposalConcepts(token) {
  token = String(token || '').trim();
  const match = boQuoteCommercialFindByToken_(token);
  const quote = boQuoteCommercialQuote_(match.quoteId);
  const state = match.state || {};
  const quoteVersion = Number(quote['Revision Number'] || 1);
  boAssert_(state.share && state.share.approvedVersion === quoteVersion, 'This proposal link is locked because the quote version changed.');
  boAssert_(['Shared','Viewed'].indexOf(state.lifecycleStatus) >= 0, 'This proposal is not currently available.');
  return boQuoteRenderApprovedConcepts_(match.quoteId, quoteVersion);
}

function boOwnerProposalConcepts(quoteId) {
  boQuoteBuilderRequireAction_('View');
  quoteId = String(quoteId || '').trim();
  boAssert_(quoteId, 'Quote ID is required.');
  return boQuoteRenderApprovedConcepts_(quoteId, boRenderStudioQuoteVersion_(quoteId));
}

function boQuoteRenderApprovedConcepts_(quoteId, quoteVersion) {
  const rows = boQuoteBuilderSnapshot_(H38_BO_SHEETS.ACTIVITY, {includeVoided:true}).rows
    .filter(function (row) {
      return row['Record Type'] === 'Quote' &&
        row['Record ID'] === quoteId &&
        row['Activity Type'] === H38_QB_RENDER_PROPOSAL.ACTIVITY_TYPE &&
        row.Status === H38_QB_RENDER_PROPOSAL.APPROVED_STATUS &&
        row['Is Voided'] !== 'Yes';
    })
    .sort(function (a, b) {
      return String(b['Created Time'] || '').localeCompare(String(a['Created Time'] || ''));
    });

  for (let index = 0; index < rows.length; index += 1) {
    const details = boQuoteRenderJson_(rows[index].Details);
    if (!details || details.includeInProposal !== true || details.customerReleaseRequired !== true || details.proofOfCompletion !== false) continue;
    if (Number(details.quoteVersion || 0) !== Number(quoteVersion || 1)) continue;
    const original = boQuoteRenderProposalImage_(details.originalFileId);
    const visual = boQuoteRenderProposalImage_(details.visualFileId);
    if (!original || !visual) continue;
    const request = details.renderRequest || {};
    return [{
      activityId:rows[index]['Activity ID'] || '',
      quoteId:quoteId,
      quoteVersion:Number(quoteVersion || 1),
      label:String(details.label || 'AI Concept Rendering — Proposed Appearance Only. Not a construction guarantee or completion photograph.'),
      originalDataUrl:original.dataUrl,
      originalMimeType:original.mimeType,
      visualDataUrl:visual.dataUrl,
      visualMimeType:visual.mimeType,
      projectType:String(request.projectType || ''),
      style:String(request.style || ''),
      materials:String(request.materials || ''),
      colors:String(request.colors || ''),
      approvedTime:String(details.approvedTime || rows[index]['Created Time'] || ''),
      includeInProposal:true,
      proofOfCompletion:false
    }];
  }
  return [];
}

function boQuoteRenderProposalImage_(fileId) {
  fileId = String(fileId || '').trim();
  if (!fileId) return null;
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const bytes = blob.getBytes();
    if (!bytes.length || bytes.length > H38_QB_RENDER_PROPOSAL.MAX_IMAGE_BYTES) {
      console.log('H38_RENDER_PROPOSAL_IMAGE_SKIP '+fileId+' bytes='+bytes.length);
      return null;
    }
    const mimeType = blob.getContentType() || 'image/jpeg';
    if (mimeType.indexOf('image/') !== 0) return null;
    return {mimeType:mimeType,dataUrl:'data:'+mimeType+';base64,'+Utilities.base64Encode(bytes)};
  } catch (error) {
    console.log('H38_RENDER_PROPOSAL_IMAGE_SKIP '+fileId+' '+error.message);
    return null;
  }
}

function boQuoteRenderJson_(value) {
  try { return value ? JSON.parse(value) : null; } catch (error) { return null; }
}
