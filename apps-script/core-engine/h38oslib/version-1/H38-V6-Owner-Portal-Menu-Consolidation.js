function onOpen(e) {
  buildOwnerPortalMenu();
}

function buildOwnerPortalMenu() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('H38 Owner Portal')

    .addSubMenu(
      ui.createMenu('1. Dashboard')
        .addItem('Refresh Owner Dashboard', 'h38MenuV6RefreshOwnerDashboard')
    )

    .addSubMenu(
      ui.createMenu('2. Intake')
        .addItem('Process Selected Intake Row', 'h38MenuV6ProcessSelectedIntakeRow')
        .addItem('Sync Latest Form Response', 'h38MenuV6SyncLatestFormResponse')
        .addItem('Route Selected New Request', 'h38OwnerRouteSelectedNewRequest')
    )

    .addSubMenu(
      ui.createMenu('3. Owner Review')
        .addItem('Show Safe Next Action For Selected Row', 'h38MenuV6ShowSafeAction')
        .addSeparator()
        .addItem('Approve Selected Row', 'h38MenuV6ApproveSelectedRow')
        .addItem('Hold Selected Row', 'h38MenuV6HoldSelectedRow')
        .addItem('Revise Selected Row', 'h38MenuV6ReviseSelectedRow')
        .addItem('Reject Selected Row', 'h38MenuV6RejectSelectedRow')
    )

    .addSubMenu(
      ui.createMenu('4. Email')
        .addItem('Create Gmail Draft From Selected Row', 'h38MenuV6CreateGmailDraftFromSelectedRow')
        .addItem('Send Approved Gmail Draft', 'h38MenuV6SendApprovedGmailDraft')
    )

    .addSubMenu(
      ui.createMenu('5. Quote')
        .addItem('Prepare Quote Email Draft', 'h38MenuV6PrepareQuoteEmailDraft')
        .addItem('Mark Quote Ready For Review', 'h38MenuV6MarkQuoteReadyForReview')
        .addItem('Send Approved Quote Draft', 'h38OwnerApprovedSendSelectedQuote')
    )

    .addSubMenu(
      ui.createMenu('6. Follow-Up')
        .addItem('Create Follow-Up Draft', 'h38MenuV6CreateFollowUpDraft')
        .addItem('Send Approved Follow-Up Draft', 'h38OwnerApprovedSendSelectedFollowUp')
        .addItem('Mark Follow-Up Complete', 'h38MenuV6MarkFollowUpComplete')
    )

    .addSubMenu(
      ui.createMenu('6A. Social')
        .addItem('Approve Selected Social Item', 'h38OwnerApproveSelectedSocialItem')
    )

    .addSubMenu(
      ui.createMenu('6B. Website')
        .addItem('Approve Selected Website Item', 'h38OwnerApproveSelectedWebsiteItem')
    )

    .addSubMenu(
      ui.createMenu('7. Proof / Error')
        .addItem('Write Manual Proof Note', 'h38MenuV6WriteManualProofNote')
        .addItem('Send Selected Row To Error Log', 'h38MenuV6SendSelectedRowToErrorLog')
    )

    .addSubMenu(
      ui.createMenu('8. Tools')
        .addItem('Refresh Dashboard Counts', 'h38MenuV6RefreshOwnerDashboard')
        .addItem('Check Customer Replies V2', 'h38MenuV6CheckCustomerRepliesV2')
        .addSeparator()
        .addItem('Menu Safety Status', 'h38MenuV6SafetyStatus')
        .addItem('Run Launch Function Audit', 'h38MenuV6RunLaunchAudit')
        .addItem('Launch Safety Status', 'h38MenuV6LaunchSafetyStatus')
    )

    .addToUi();
}

/************************************************************
 * V9 Owner Portal Library Bridge Functions
 ************************************************************/

function h38OwnerApprovedSendSelectedQuote() {
  SpreadsheetApp.getUi().alert(
    H38OwnerLib.h38OwnerApprovedSendSelectedQuote()
  );
}

function h38OwnerRouteSelectedNewRequest() {
  SpreadsheetApp.getUi().alert(
    H38OwnerLib.h38OwnerRouteSelectedNewRequest()
  );
}

function h38OwnerApproveSelectedWebsiteItem() {
  SpreadsheetApp.getUi().alert(
    H38OwnerLib.h38OwnerApproveSelectedWebsiteItem()
  );
}

function h38OwnerApprovedSendSelectedFollowUp() {
  SpreadsheetApp.getUi().alert(
    H38OwnerLib.h38OwnerApprovedSendSelectedFollowUp()
  );
}

function h38OwnerApproveSelectedSocialItem() {
  SpreadsheetApp.getUi().alert(
    H38OwnerLib.h38OwnerApproveSelectedSocialItem()
  );
}

/************************************************************
 * Safe wrapper functions
 * These prevent missing/broken launch functions from breaking the menu.
 ************************************************************/

function h38MenuV6Call_(functionName, label) {
  var fn = null;

  try {
    fn = globalThis[functionName];
  } catch (err) {
    fn = null;
  }

  if (typeof fn !== 'function') {
    SpreadsheetApp.getUi().alert(
      'HOLD — ' + label + ' is not connected to a launch-safe function yet.\n\n' +
      'Missing function:\n' + functionName + '\n\n' +
      'No email sent.\n' +
      'No quote approved.\n' +
      'No payment requested.\n' +
      'No final delivery.\n' +
      'No website/social publish.\n' +
      'No trigger.'
    );
    return;
  }

  return fn();
}

function h38MenuV6RefreshOwnerDashboard() {
  return h38MenuV6Call_('h38RefreshOwnerDashboard', 'Refresh Owner Dashboard');
}

function h38MenuV6ProcessSelectedIntakeRow() {
  SpreadsheetApp.getUi().alert(
    'HOLD — Selected intake processing belongs in the Intake Responses spreadsheet, not the Owner Portal.\n\n' +
    'Use:\nHighway 38 Solutions — Intake Responses CURRENT\n\n' +
    'No bulk processing was run.'
  );
}

function h38MenuV6SyncLatestFormResponse() {
  SpreadsheetApp.getUi().alert(
    'HOLD — Sync Latest Form Response is not launch-connected yet.\n\n' +
    'No rows processed.\nNo email sent.\nNo trigger created.'
  );
}

function h38MenuV6ShowSafeAction() {
  return h38MenuV6Call_('h38OwnerActionRouterShowSelectedRow', 'Show Safe Next Action For Selected Row');
}

function h38MenuV6ApproveSelectedRow() {
  return h38MenuV6Call_('approveSelectedRow', 'Approve Selected Row');
}

function h38MenuV6HoldSelectedRow() {
  return h38MenuV6Call_('holdSelectedRow', 'Hold Selected Row');
}

function h38MenuV6ReviseSelectedRow() {
  return h38MenuV6Call_('reviseSelectedRow', 'Revise Selected Row');
}

function h38MenuV6RejectSelectedRow() {
  return h38MenuV6Call_('rejectSelectedRow', 'Reject Selected Row');
}

function h38MenuV6CreateGmailDraftFromSelectedRow() {
  return h38MenuV6Call_('h38CreateGmailDraftFromSelectedRow', 'Create Gmail Draft From Selected Row');
}

function h38MenuV6SendApprovedGmailDraft() {
  return h38MenuV6Call_('h38OwnerApprovedSendSelectedDraft', 'Send Approved Gmail Draft');
}

function h38MenuV6PrepareQuoteEmailDraft() {
  return h38MenuV6Call_('h38PrepareQuoteEmailDraft', 'Prepare Quote Email Draft');
}

function h38MenuV6MarkQuoteReadyForReview() {
  return h38MenuV6Call_('h38MarkQuoteReadyForReview', 'Mark Quote Ready For Review');
}

function h38MenuV6CreateFollowUpDraft() {
  return h38MenuV6Call_('h38CreateFollowUpDraft', 'Create Follow-Up Draft');
}

function h38MenuV6MarkFollowUpComplete() {
  return h38MenuV6Call_('h38MarkFollowUpComplete', 'Mark Follow-Up Complete');
}

function h38MenuV6WriteManualProofNote() {
  return h38MenuV6Call_('h38WriteManualProofNote', 'Write Manual Proof Note');
}

function h38MenuV6SendSelectedRowToErrorLog() {
  return h38MenuV6Call_('h38SendSelectedRowToErrorLog', 'Send Selected Row To Error Log');
}

function h38MenuV6CheckCustomerRepliesV2() {
  return h38MenuV6Call_('h38CheckCustomerRepliesV2', 'Check Customer Replies V2');
}

function h38MenuV6RunLaunchAudit() {
  return h38MenuV6Call_('h38LaunchModeFunctionAudit', 'Run Launch Function Audit');
}

function h38MenuV6LaunchSafetyStatus() {
  return h38MenuV6Call_('h38LaunchModeSafetyStatus', 'Launch Safety Status');
}

function h38MenuV6SafetyStatus() {
  SpreadsheetApp.getUi().alert(
    'H38 Owner Portal Launch Menu Safety Status\n\n' +
    'Menu restored with safe wrappers.\n\n' +
    'Router write option is hidden.\n' +
    'Old test functions are not exposed.\n' +
    'Missing functions show HOLD instead of failing.\n\n' +
    'No email sent.\n' +
    'No quote approved.\n' +
    'No payment requested.\n' +
    'No final delivery.\n' +
    'No website/social publish.\n' +
    'No trigger.'
  );
}
