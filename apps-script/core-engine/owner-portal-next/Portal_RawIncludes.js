/**
 * Returns allowlisted raw HTML, CSS, or JavaScript fragments.
 * Portal_Product_Styles and Portal_Product_Client are the canonical shared
 * presentation and shell-behavior sources for the unified application.
 */
function h38PortalRawInclude_(fileName){
  var allowed=[
    'Portal_Experience_Styles','Portal_Experience_Client_Core','Portal_Experience_Client_Views','Portal_Experience_Client_Workspace','Portal_UX_Styles','Portal_Business_Styles','Portal_Business_Create_Styles','Portal_Application_UX_Styles','Portal_OneShot_UX_Styles','Portal_UserAccess_Styles','Portal_RolePreview_Styles','Portal_Product_Styles','Portal_UX_Client_Shell','Portal_Business_Client','Portal_Business_Create_Client','Portal_TaskMessaging_Client','Portal_UX_Client_Tasks','Portal_UX_Client_Workspace','Portal_UX_Client_Forms','Portal_Application_Client_Views','Portal_UserAccess_Client','Portal_OneShot_Client','Portal_Field_Roles_Client','Portal_RolePreview_Client','Portal_Application_Client_Business','Portal_Application_Client_SafeActions','Portal_Application_Client_Core','Portal_QuoteBuilder_Addon_Client','Portal_QuoteBuilder_QuickCapture_Client','Portal_Equipment_Client','Portal_Product_Client','Portal_UX_Client_Boot'
  ];
  fileName=String(fileName||'');
  if(allowed.indexOf(fileName)<0)throw new Error('Portal raw include is not allowed.');
  return HtmlService.createTemplateFromFile(fileName).getRawContent();
}