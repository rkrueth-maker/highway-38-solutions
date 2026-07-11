function h38RefreshOwnerDashboard() {
  if (typeof H38OSLIB !== 'undefined' && typeof H38OSLIB.H38OS_updateDashboard === 'function') {
    return H38OSLIB.H38OS_updateDashboard();
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('Dashboard');
  if (!dash) {
    throw new Error('Dashboard tab not found.');
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  dash.getRange('A1:G8').setValues([
    ['Portal Area', 'Count / Status', 'Source Tab', 'Control Rule', 'Owner Action', 'Last Updated', 'Notes'],
    ['Pending', '', 'All queues', 'Rick Review Required', 'Review selected rows', now, 'Dashboard wrapper fallback used.'],
    ['Completed Today', '', 'Proof Log', 'Proof required', 'Review proof if needed', now, 'No bulk action.'],
    ['Ready To Send', '', 'Email/Quote/Follow-Up', 'Rick approval required', 'Execute selected approved row only', now, 'No auto-send.'],
    ['Ready To Deliver', '', 'Output Queue', 'Draft routing only', 'Route delivery draft only', now, 'No auto delivery.'],
    ['Ready For Social', '', 'Social Approval Queue', 'Handoff only', 'Prepare handoff only', now, 'No auto publish.'],
    ['Ready For Website', '', 'Website Approval Queue', 'Handoff only', 'Prepare handoff only', now, 'No auto deploy.'],
    ['Errors', '', 'Error Log', 'Block unsafe/unclear actions', 'Resolve manually', now, 'No trigger.']
  ]);

  SpreadsheetApp.getUi().alert(
    'PASS — Dashboard refresh wrapper ran safely.\\n\\n' +
    'No email sent.\\n' +
    'No quote approved.\\n' +
    'No payment requested.\\n' +
    'No final delivery.\\n' +
    'No website/social publish.\\n' +
    'No trigger.'
  );
}
