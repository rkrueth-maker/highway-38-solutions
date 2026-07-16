/**
 * Returns allowlisted HTML, CSS, or JavaScript fragments without asking
 * HtmlService to parse each fragment as a standalone HTML document.
 *
 * The client fragments intentionally contain JavaScript template literals
 * with HTML markup. createHtmlOutputFromFile() attempts to parse those raw
 * fragments and can throw "Malformed HTML content" before Portal_Index is
 * rendered. HtmlTemplate.getRawContent() is the correct raw-fragment path.
 */
function h38PortalRawInclude_(fileName) {
  var allowed = [
    'Portal_Experience_Styles',
    'Portal_Experience_Client_Core',
    'Portal_Experience_Client_Views',
    'Portal_Experience_Client_Workspace',
    'Portal_UX_Styles',
    'Portal_UX_Client_Shell',
    'Portal_UX_Client_Tasks',
    'Portal_UX_Client_Workspace',
    'Portal_UX_Client_Forms',
    'Portal_UX_Client_Boot'
  ];
  fileName = String(fileName || '');
  if (allowed.indexOf(fileName) < 0) throw new Error('Portal raw include is not allowed.');
  return HtmlService.createTemplateFromFile(fileName).getRawContent();
}
