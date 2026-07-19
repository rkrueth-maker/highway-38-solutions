/** Public request intake for the existing unified deployment. No customer message, charge, quote, or work is created. */
function doPost(event) {
  var requestId = '';
  try {
    var raw = event && event.parameter ? String(event.parameter.payload || '') : '';
    if (!raw || raw.length > 30000) throw new Error('VALIDATION HOLD — invalid request size.');
    var payload = JSON.parse(raw);
    if (String(payload.website || '').trim()) throw new Error('VALIDATION HOLD — automated submission rejected.');
    var name = h38PublicIntakeText_(payload.name, 200);
    var email = h38PublicIntakeText_(payload.email, 320).toLowerCase();
    var problem = h38PublicIntakeText_(payload.problem, 5000);
    if (!name || !email || email.indexOf('@') < 1 || !problem) throw new Error('VALIDATION HOLD — name, valid email, and problem are required.');
    var idempotency = h38PublicIntakeText_(payload.idempotencyKey, 100);
    if (!idempotency) throw new Error('VALIDATION HOLD — duplicate-protection key is required.');
    var requestSheet = typeof H38_BO_MODULES !== 'undefined' && H38_BO_MODULES.requests ? H38_BO_MODULES.requests : 'BO Requests';
    var duplicateProperty = 'H38_PUBLIC_INTAKE_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idempotency)).slice(0,40);
    var properties = PropertiesService.getScriptProperties();
    var lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      var existingId = String(properties.getProperty(duplicateProperty) || '').trim();
      if (existingId) return h38PublicIntakeResponse_({ok:true,requestId:existingId,status:'DUPLICATE_ACCEPTED',message:'Request already received. No duplicate was created.'}, event);
      var headers = boHeaders_(requestSheet);
      var values = {
        'Received Time':boNow_(),
        'Source':'website-direct-intake',
        'Status':'New',
        'Approval Status':'Owner Approval Required',
        'Name':name,
        'Email':email,
        'Phone':h38PublicIntakeText_(payload.phone,80),
        'Preferred Contact':h38PublicIntakeText_(payload.preferredContact,80),
        'Desired Outcome':h38PublicIntakeText_(payload.desiredOutcome,1000),
        'Product / Bundle ID':h38PublicIntakeText_(payload.catalogId,100).toUpperCase(),
        'Problem':problem,
        'Finished Result':h38PublicIntakeText_(payload.finishedResult,5000),
        'Files or Links':h38PublicIntakeText_(payload.filesOrLinks,5000),
        'Project Details':h38PublicIntakeText_(payload.details,5000),
        'Budget':h38PublicIntakeText_(payload.budget,100),
        'Timing':h38PublicIntakeText_(payload.timing,100),
        'Next Action':'Owner review and qualification'
      };
      if (headers.indexOf('Idempotency Key') >= 0) values['Idempotency Key'] = idempotency;
      if (headers.indexOf('Duplicate Key') >= 0) values['Duplicate Key'] = idempotency;
      var record = boAppendRecord_(requestSheet, values, 'Public website intake');
      requestId = record['Request ID'];
      properties.setProperty(duplicateProperty, requestId);
      try { boProof_('PUBLIC SUBMISSION', requestSheet, requestId, 'PASS', 'Request created for owner review. External actions remain locked.', email); } catch (proofError) { console.error(proofError); }
    } finally { lock.releaseLock(); }
    return h38PublicIntakeResponse_({ok:true,requestId:requestId,status:'OWNER_REVIEW_REQUIRED',message:'Request received for Owner review. No work or charge has started.'}, event);
  } catch (error) {
    try { boError_('Public website intake','Request',requestId,error,'Error'); } catch (loggingError) { console.error(loggingError); }
    return h38PublicIntakeResponse_({ok:false,requestId:requestId,status:'HOLD',message:String(error && error.message || error)}, event);
  }
}

function h38PublicIntakeText_(value,max) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim();
  if (text.length > max) throw new Error('VALIDATION HOLD — field exceeds '+max+' characters.');
  return text;
}

function h38PublicIntakeResponse_(payload,event) {
  var nonce = event && event.parameter ? h38PublicIntakeText_(event.parameter.nonce,100) : '';
  var json = JSON.stringify({type:'h38-public-intake',nonce:nonce,payload:payload}).replace(/</g,'\\u003c');
  var html = '<!doctype html><html><body><script>window.parent.postMessage('+json+',"*");<\/script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
