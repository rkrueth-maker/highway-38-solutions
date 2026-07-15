/**
 * Temporary token-protected production acceptance endpoint.
 * This file is included only in a temporary deployment and is removed from the
 * development source after the complete acceptance run.
 */

const H38_BO_ACCEPTANCE_TOKEN_PROPERTY = 'H38_BUSINESS_OFFICE_ACCEPTANCE_TOKEN';

function doPost(e) {
  try {
    const request = boAcceptanceRequest_(e);
    const expected = PropertiesService.getScriptProperties().getProperty(H38_BO_ACCEPTANCE_TOKEN_PROPERTY) || '';
    boAssert_(expected && request.token === expected, 'Acceptance authorization failed.');
    const result = boAcceptanceRoute_(request.action, request.payload || {});
    return boAcceptanceJson_({ ok: true, action: request.action, result: result });
  } catch (error) {
    return boAcceptanceJson_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function boAcceptanceRequest_(e) {
  const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  return {
    token: String(body.token || (e && e.parameter && e.parameter.token) || ''),
    action: String(body.action || (e && e.parameter && e.parameter.action) || ''),
    payload: body.payload || {}
  };
}

function boAcceptanceRoute_(action, payload) {
  if (action === 'bootstrap') return boBootstrapInstall(payload);
  if (action === 'syncBootstrap') return h38BusinessOfficeBootstrapSync(payload);
  if (action === 'syncAccept') return h38BusinessOfficeSyncAcceptance();
  if (action === 'liveAccept') return boRunLiveAcceptance(payload);
  if (action === 'renderedHtml') return boGetRenderedWebAppHtml();
  if (action === 'health') return { status: 'PASS', version: H38_BO.VERSION, time: boNow_(), externalActionsEnabled: false };
  throw new Error('Unsupported acceptance action: ' + action);
}

function boAcceptanceJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
