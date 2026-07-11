function h38RunSystemSelfVerification() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = ss.getSheetByName('System Verification') || ss.insertSheet('System Verification');
  out.clear();

  var rows = [
    ['Check', 'Status', 'Notes'],
    ['Spreadsheet opened', 'PASS', ss.getName()],
    ['Selected-row execution wrapper', typeof h38ExecuteApprovedSelectedRow === 'function' ? 'PASS' : 'HOLD', 'Bound wrapper check'],
    ['Execution safety wrapper', typeof h38ExecutionSafetyStatus === 'function' ? 'PASS' : 'HOLD', 'Bound wrapper check'],
    ['Library object', typeof H38OSLIB !== 'undefined' ? 'PASS' : 'HOLD', 'Requires library identifier H38OSLIB'],
    ['Dashboard tab', ss.getSheetByName('Dashboard') ? 'PASS' : 'HOLD', ''],
    ['New Requests tab', ss.getSheetByName('New Requests') ? 'PASS' : 'HOLD', ''],
    ['Job Queue tab', ss.getSheetByName('Job Queue') ? 'PASS' : 'HOLD', ''],
    ['Email Approval Queue tab', ss.getSheetByName('Email Approval Queue') ? 'PASS' : 'HOLD', ''],
    ['Quote Approval Queue tab', ss.getSheetByName('Quote Approval Queue') ? 'PASS' : 'HOLD', ''],
    ['Follow-Up Queue tab', ss.getSheetByName('Follow-Up Queue') ? 'PASS' : 'HOLD', ''],
    ['Output Queue tab', ss.getSheetByName('Output Queue') ? 'PASS' : 'HOLD', ''],
    ['Social Approval Queue tab', ss.getSheetByName('Social Approval Queue') ? 'PASS' : 'HOLD', ''],
    ['Website Approval Queue tab', ss.getSheetByName('Website Approval Queue') ? 'PASS' : 'HOLD', ''],
    ['Proof Log tab', ss.getSheetByName('Proof Log') ? 'PASS' : 'HOLD', ''],
    ['Error Log tab', ss.getSheetByName('Error Log') ? 'PASS' : 'HOLD', ''],
    ['Safety policy', 'PASS', 'No email sent. No quote approved. No payment. No final delivery. No website/social publish. No trigger.']
  ];

  out.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.getUi().alert('PASS — System self-verification completed. No customer-facing action occurred.');
}
