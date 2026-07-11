/**
 * Highway 38 Operating System — Bound Owner Portal Wrappers
 * Identifier: H38OSLIB
 */

function h38ExecuteApprovedSelectedRow() {
  return H38OSLIB.H38OS_executeApprovedSelectedRow();
}

function h38ExecutionSafetyStatus() {
  SpreadsheetApp.getUi().alert(
    'Highway 38 Operating System — Execution Safety Status\n\n' +
    'Execution mode: Selected-row only\n' +
    'Safety Gate: Rick Review / Owner Approval Required\n\n' +
    'No triggers | No bulk processing | No live mode.'
  );
}
