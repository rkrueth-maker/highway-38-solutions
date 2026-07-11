# Highway 38 Operating System — Recovery Guide

## Immediate safety response

When an execution, menu, deployment, or data problem appears:

1. Stop customer-facing actions.
2. Do not rerun the selected row.
3. Confirm whether an email, quote, follow-up, delivery, social handoff, or website handoff actually occurred.
4. Check duplicate-lock fields, Proof Log, Error Log, Gmail Sent, and the selected row.
5. Preserve screenshots, message IDs, timestamps, and the current source commit.

## Apps Script rollback

```bash
cd owner-portal-apps-script
clasp pull
```

Save the pulled failure state separately. Restore the last known-good exported project or Git commit, then:

```bash
clasp status
clasp push
```

Refresh the spreadsheet and run the blocked-row safety test before any controlled execution.

## Spreadsheet recovery

- Restore only affected rows or tabs from version history or archive sheets.
- Do not overwrite Proof Log or Error Log history.
- Reapply canonical headers and validations from Queue Map and Status Dictionary.
- Confirm active queues contain only current work.

## Gmail recovery

- Search Gmail Sent before assuming a send failed.
- If sent, lock the queue row and add/reconcile Proof Log evidence.
- If not sent, preserve the draft and resolve the blocking error before another owner approval.
- Never recreate and send a second draft without checking duplicate locks and the original thread.

## Drive recovery

- Restore from Archive / Review or Drive version history.
- Do not delete uncertain job folders.
- Reconnect links in the queue row after restoration.

## Website recovery

- Revert the relevant Git commit.
- Confirm public pages, form link, and Owner Portal link.
- Re-run public/private and secret checks before deployment.

## Recovery completion criteria

- Active queues are consistent.
- No duplicate customer-facing action occurred.
- Proof/Error records are aligned with current schemas.
- Blocked-row test passes.
- No unauthorized trigger is enabled.
- GitHub, live Apps Script, and documentation agree on the recovered state.