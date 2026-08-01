/** Shared AI quote drafting and completion-visual engine.
 * Script properties:
 *   OPENAI_API_KEY (required for live AI)
 *   H38_AI_TEXT_MODEL (optional, defaults to gpt-4.1-mini)
 *   H38_AI_IMAGE_MODEL (optional, defaults to gpt-image-1)
 *   H38_AI_VISUAL_FOLDER_ID (optional; isolated folder is created when absent)
 */

function boBuildAiQuoteDraft_(payload) {
  return boSafeExecute_('Build AI quote draft', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    payload = payload || {};
    const hasDirectPhotos = payload.photos && payload.photos.length;
    const hasStagedPhotos = payload.photoDocumentIds && payload.photoDocumentIds.length;
    boAssert_(payload.customerId, 'Customer selection is required.');
    boAssert_(payload.notes || hasDirectPhotos || hasStagedPhotos, 'Field notes or photos are required.');

    const key = boAiOpenAiKey_();
    if (!key) {
      const fallback = boPrepareAiQuoteDraft_(payload);
      return { configured:false, fallback:true, staged:fallback, message:'AI service is not configured. A Price Book-assisted owner-review draft was staged instead.' };
    }

    const priceBook = boQuoteBuilderPriceBook_({}).slice(0,250).map(function (item) {
      return {
        id:item['Product / Service ID'] || '', name:item.Name || '', description:item['Customer Description'] || item.Description || '',
        category:item.Category || '', unit:item.Unit || 'each', price:item['Standard Selling Price'] || item.Price || ''
      };
    });
    const instructions = [
      'You are an estimating assistant for a property-maintenance and field-services business.',
      'Use only facts visible in the supplied photos, the field notes, and the supplied Price Book.',
      'Never invent measurements, quantities, hidden conditions, permits, final pricing, or customer promises.',
      'Return strict JSON with keys: projectTitle, scope, suggestedLines, assumptions, exclusions, missingInformation, photoObservations.',
      'suggestedLines must contain catalogId, description, quantity, unit, rate, priceStatus, confidence, evidence.',
      'Use a Price Book rate only when its catalog item clearly matches. Otherwise rate must be an empty string and priceStatus must be manual_entry_required.',
      'All output is an internal draft requiring owner review.'
    ].join(' ');
    const content = [{type:'input_text',text:instructions+'\nFIELD NOTES:\n'+String(payload.notes||'')+'\nPRICE BOOK JSON:\n'+JSON.stringify(priceBook)}];
    (payload.photos || []).slice(0,4).forEach(function (photo) {
      const url = typeof photo === 'string' ? photo : (photo.dataUrl || photo.url || '');
      if (url) content.push({type:'input_image',image_url:url,detail:'high'});
    });
    const stagedPhotos = typeof boQuoteBuilderAiPhotoInputs_ === 'function'
      ? boQuoteBuilderAiPhotoInputs_(payload)
      : { urls:[], documentIds:[], totalBytes:0 };
    stagedPhotos.urls.forEach(function (url) {
      content.push({type:'input_image',image_url:url,detail:'high'});
    });
    const response = boAiFetchJson_('https://api.openai.com/v1/responses', {
      model:PropertiesService.getScriptProperties().getProperty('H38_AI_TEXT_MODEL') || 'gpt-4.1-mini',
      input:[{role:'user',content:content}],
      temperature:0.1,
      max_output_tokens:3500
    }, key);
    const text = boAiExtractResponseText_(response);
    const draft = boAiParseJson_(text);
    boAssert_(draft && typeof draft === 'object', 'AI returned an unreadable quote draft.');

    const draftId = boId_('AIDRAFT');
    const staged = {
      'Activity ID':draftId,
      'Activity Type':'AI Quote Draft',
      'Record Type':'Customer',
      'Record ID':payload.customerId,
      Status:'Owner Review Required',
      Summary:draft.projectTitle || payload.projectTitle || 'AI-assisted field quote draft',
      Details:JSON.stringify({
        notes:payload.notes || '',
        photoDocumentIds:stagedPhotos.documentIds,
        photoCount:stagedPhotos.documentIds.length + Math.min((payload.photos || []).length, 4),
        projectTitle:draft.projectTitle || '', scope:draft.scope || '',
        suggestedLines:Array.isArray(draft.suggestedLines)?draft.suggestedLines:[], assumptions:Array.isArray(draft.assumptions)?draft.assumptions:[],
        exclusions:Array.isArray(draft.exclusions)?draft.exclusions:[], missingInformation:Array.isArray(draft.missingInformation)?draft.missingInformation:[],
        photoObservations:Array.isArray(draft.photoObservations)?draft.photoObservations:[], pricingRule:'AI did not approve pricing. Owner confirmation is required.'
      }),
      'Created By':access.user.id,
      'Created Time':boNow_()
    };
    boAppendRecord_(H38_BO_SHEETS.ACTIVITY, staged, 'AI-assisted quote draft staging');
    boProof_('BUILD AI QUOTE DRAFT','Customer',payload.customerId,'PASS',draftId,access.user.email);
    return {configured:true,fallback:false,staged:staged,draft:draft,message:'AI quote draft created for owner review.'};
  }, 'Customer', payload && payload.customerId);
}

function boCreateAiCompletionVisual_(payload) {
  return boSafeExecute_('Create AI completion visual', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    payload = payload || {};
    boAssert_(payload.customerId, 'Customer selection is required.');
    boAssert_(payload.imageDataUrl, 'Select one original jobsite photo.');
    boAssert_(payload.instructions, 'Describe the proposed completed result.');
    const key = boAiOpenAiKey_();
    boAssert_(key, 'AI image generation is not configured. Add OPENAI_API_KEY to Apps Script properties.');

    const sourceBlob = boAiDataUrlToBlob_(payload.imageDataUrl, 'jobsite-original-'+Date.now()+'.jpg');
    const label = 'AI Concept Rendering — Proposed Appearance Only. Not a construction guarantee or completion photograph.';
    const prompt = [
      'Edit the supplied real jobsite photograph into a realistic proposed-completion concept.',
      'Preserve camera position, property geometry, buildings, permanent structures, and unaffected surroundings.',
      'Change only the work explicitly requested below. Do not add people, logos, signs, text, vehicles, structures, or materials that were not requested.',
      'Make the result plausible for professional property-maintenance or construction planning, but do not imply exact measurements or engineering certainty.',
      'REQUESTED RESULT:', String(payload.instructions),
      'The application will display this mandatory label beside the image:', label
    ].join('\n');
    const model = PropertiesService.getScriptProperties().getProperty('H38_AI_IMAGE_MODEL') || 'gpt-image-1';
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/images/edits', {
      method:'post',
      headers:{Authorization:'Bearer '+key},
      payload:{model:model,image:sourceBlob,prompt:prompt,size:'1536x1024',quality:'medium',output_format:'jpeg'},
      muteHttpExceptions:true
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    boAssert_(code >= 200 && code < 300, 'AI visual generation failed ('+code+'): '+body.slice(0,500));
    const json = JSON.parse(body);
    const b64 = json && json.data && json.data[0] && json.data[0].b64_json;
    boAssert_(b64, 'AI visual response did not contain an image.');
    const folder = boAiVisualFolder_();
    const original = folder.createFile(sourceBlob).setDescription('Original jobsite photo preserved for AI concept record.');
    const visualBlob = Utilities.newBlob(Utilities.base64Decode(b64),'image/jpeg','ai-completion-concept-'+Date.now()+'.jpg');
    const visual = folder.createFile(visualBlob).setDescription(label+'\nRequested result: '+payload.instructions);

    const activityId = boId_('AIVISUAL');
    const staged = {
      'Activity ID':activityId,
      'Activity Type':'AI Completion Visual',
      'Record Type':payload.quoteId ? 'Quote' : 'Customer',
      'Record ID':payload.quoteId || payload.customerId,
      Status:'Owner Review Required',
      Summary:payload.projectTitle || 'Proposed completion concept',
      Details:JSON.stringify({label:label,instructions:payload.instructions,originalFileId:original.getId(),visualFileId:visual.getId(),includeInProposal:false}),
      'Created By':access.user.id,
      'Created Time':boNow_()
    };
    boAppendRecord_(H38_BO_SHEETS.ACTIVITY, staged, 'AI completion visual staging');
    boProof_('CREATE AI COMPLETION VISUAL',staged['Record Type'],staged['Record ID'],'PASS',activityId,access.user.email);
    return {activityId:activityId,status:'Owner Review Required',label:label,originalFileId:original.getId(),visualFileId:visual.getId(),visualUrl:'https://drive.google.com/uc?export=view&id='+visual.getId(),includeInProposal:false};
  }, payload && payload.quoteId ? 'Quote' : 'Customer', payload && (payload.quoteId || payload.customerId));
}

function boAiOpenAiKey_(){ return PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || ''; }
function boAiFetchJson_(url, payload, key){
  const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+key},payload:JSON.stringify(payload),muteHttpExceptions:true});
  const code=response.getResponseCode(),body=response.getContentText();
  boAssert_(code>=200&&code<300,'AI request failed ('+code+'): '+body.slice(0,700));
  return JSON.parse(body);
}
function boAiExtractResponseText_(response){
  if(response.output_text)return response.output_text;
  const chunks=[];(response.output||[]).forEach(function(item){(item.content||[]).forEach(function(c){if(c.text)chunks.push(c.text);});});
  return chunks.join('\n');
}
function boAiParseJson_(text){
  const cleaned=String(text||'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(cleaned);}catch(error){const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');return start>=0&&end>start?JSON.parse(cleaned.slice(start,end+1)):null;}
}
function boAiDataUrlToBlob_(dataUrl,name){
  const match=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/);boAssert_(match,'The selected image could not be read.');
  return Utilities.newBlob(Utilities.base64Decode(match[2]),match[1],name||'jobsite-photo');
}
function boAiVisualFolder_(){
  const props=PropertiesService.getScriptProperties();const configured=props.getProperty('H38_AI_VISUAL_FOLDER_ID');
  if(configured){try{return DriveApp.getFolderById(configured);}catch(error){}}
  const name=boGetBusinessId_()+' AI Quote Visuals';const found=DriveApp.getFoldersByName(name);const folder=found.hasNext()?found.next():DriveApp.createFolder(name);
  props.setProperty('H38_AI_VISUAL_FOLDER_ID',folder.getId());return folder;
}
