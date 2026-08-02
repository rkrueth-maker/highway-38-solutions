/** Owner-controlled Render Studio support for the existing Quote Builder. */
function boCreateAiRenderStudioConcept(payload) {
  payload = payload || {};
  boGuardApiRequest_('prepareAiQuoteDraft', payload);
  const request = boRenderStudioNormalizeRequest_(payload);
  const result = boCreateAiCompletionVisual_({
    customerId:request.customerId,
    quoteId:request.quoteId,
    projectTitle:request.projectTitle,
    imageDataUrl:payload.imageDataUrl,
    instructions:boRenderStudioInstructions_(request)
  });
  if (result && result.activityId) {
    const details = {
      label:result.label || '',
      instructions:boRenderStudioInstructions_(request),
      originalFileId:result.originalFileId || '',
      visualFileId:result.visualFileId || '',
      includeInProposal:false,
      renderRequest:request,
      conceptNumber:request.conceptNumber,
      conceptCount:request.conceptCount
    };
    boUpdateRecord_(H38_BO_SHEETS.ACTIVITY, result.activityId, {
      Status:'Owner Review Required',
      Details:JSON.stringify(details)
    }, 'Store structured Quote Builder Render Studio request');
    result.renderRequest = request;
    result.conceptNumber = request.conceptNumber;
    result.conceptCount = request.conceptCount;
  }
  return result;
}

function boApproveAiCompletionVisualForQuote(payload) {
  payload = payload || {};
  boGuardApiRequest_('prepareAiQuoteDraft', payload);
  return boSafeExecute_('Approve AI completion visual for quote', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    boAssert_(payload.activityId, 'Choose a generated concept first.');
    boAssert_(payload.quoteId, 'Save the quote before attaching a concept.');
    boAssert_(payload.visualFileId, 'The generated concept file is missing.');
    const label = String(payload.label || 'AI Concept Rendering — Proposed Appearance Only. Not a construction guarantee or completion photograph.');
    const file = DriveApp.getFileById(String(payload.visualFileId));
    file.setDescription(label+'\nOwner approved for Quote '+payload.quoteId+' proposal review. This remains a concept, not proof of completed work.');
    const details = {
      label:label,
      instructions:String(payload.instructions || ''),
      originalFileId:String(payload.originalFileId || ''),
      visualFileId:String(payload.visualFileId || ''),
      includeInProposal:true,
      quoteId:String(payload.quoteId),
      renderRequest:payload.renderRequest || {},
      approvedBy:access.user.email || access.user.id || '',
      approvedTime:boNow_(),
      customerReleaseRequired:true,
      proofOfCompletion:false
    };
    boUpdateRecord_(H38_BO_SHEETS.ACTIVITY, String(payload.activityId), {
      'Record Type':'Quote',
      'Record ID':String(payload.quoteId),
      Status:'Owner Approved for Proposal',
      Details:JSON.stringify(details)
    }, 'Attach approved AI concept to saved quote');
    boProof_('APPROVE AI COMPLETION VISUAL', 'Quote', String(payload.quoteId), 'PASS', String(payload.activityId), access.user.email);
    return {
      activityId:String(payload.activityId),
      quoteId:String(payload.quoteId),
      visualFileId:String(payload.visualFileId),
      includeInProposal:true,
      status:'Owner Approved for Proposal',
      label:label,
      message:'The selected AI concept is attached to the saved quote for proposal review. Nothing was sent.'
    };
  }, 'Quote', payload.quoteId);
}

function boRenderStudioNormalizeRequest_(payload) {
  const allowedTypes = ['Remodel or repair','Exterior','Landscaping','Garage or shop','Kitchen or bath','Cleanup or restoration','General property improvement'];
  const allowedStyles = ['Match existing','Clean and practical','Modern','Traditional','Rustic northwoods','Industrial shop','Customer specified'];
  const projectType = boRenderStudioChoice_(payload.projectType, allowedTypes, 'General property improvement');
  const style = boRenderStudioChoice_(payload.style, allowedStyles, 'Match existing');
  const conceptCount = Math.max(1, Math.min(3, Number(payload.conceptCount) || 1));
  const conceptNumber = Math.max(1, Math.min(conceptCount, Number(payload.conceptNumber) || 1));
  return {
    customerId:boRenderStudioText_(payload.customerId, 120),
    quoteId:boRenderStudioText_(payload.quoteId, 120),
    projectTitle:boRenderStudioText_(payload.projectTitle || 'Proposed completion concept', 180),
    projectType:projectType,
    style:style,
    materials:boRenderStudioText_(payload.materials, 700),
    colors:boRenderStudioText_(payload.colors, 500),
    preserve:boRenderStudioText_(payload.preserve, 900),
    additionalInstructions:boRenderStudioText_(payload.additionalInstructions, 1200),
    scope:boRenderStudioText_(payload.scope, 1600),
    assumptions:boRenderStudioText_(payload.assumptions, 900),
    quoteLines:boRenderStudioList_(payload.quoteLines, 12, 220),
    conceptCount:conceptCount,
    conceptNumber:conceptNumber
  };
}

function boRenderStudioInstructions_(request) {
  const variation = request.conceptCount > 1
    ? 'Create concept '+request.conceptNumber+' of '+request.conceptCount+'. Make it meaningfully different in finish or layout while obeying every scope and preservation rule.'
    : 'Create one realistic proposed-completion concept.';
  return [
    variation,
    'PROJECT TYPE: '+request.projectType,
    'DESIGN DIRECTION: '+request.style,
    request.scope ? 'QUOTE SCOPE: '+request.scope : '',
    request.assumptions ? 'KNOWN DIMENSIONS AND ASSUMPTIONS: '+request.assumptions : '',
    request.quoteLines.length ? 'QUOTED WORK AND MATERIAL CONTEXT: '+request.quoteLines.join(' | ') : '',
    request.materials ? 'MATERIALS AND PRODUCTS: '+request.materials : '',
    request.colors ? 'COLORS AND FINISHES: '+request.colors : '',
    request.preserve ? 'MUST REMAIN UNCHANGED: '+request.preserve : 'MUST REMAIN UNCHANGED: camera angle, property geometry, unaffected structures, roofline, doors, windows, landscaping, and surroundings.',
    request.additionalInstructions ? 'ADDITIONAL OWNER INSTRUCTIONS: '+request.additionalInstructions : '',
    'Use the real jobsite photo as the controlling source. Preserve perspective, dimensions, openings, permanent structures, and everything outside the requested work.',
    'Do not invent additions, remove existing features, move walls or openings, change roof geometry, add people, add vehicles, add signs, add logos, or place text in the image unless explicitly requested.',
    'Show a plausible professionally completed result. This is visualization only and must not imply exact measurements, engineering approval, permit approval, pricing approval, or proof that work was completed.'
  ].filter(Boolean).join('\n');
}

function boRenderStudioChoice_(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.indexOf(text) >= 0 ? text : fallback;
}
function boRenderStudioText_(value, limit) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit || 500);
}
function boRenderStudioList_(value, count, limit) {
  const source = Array.isArray(value) ? value : [];
  const output = [];
  source.slice(0, count || 10).forEach(function (item) {
    const text = boRenderStudioText_(item, limit || 200);
    if (text) output.push(text);
  });
  return output;
}
