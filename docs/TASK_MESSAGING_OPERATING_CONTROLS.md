# Highway 38 Task Assignment and SMS Operating Controls

## Operating boundary

Task assignment is an internal Business System capability and can operate without a paid texting provider. Customer SMS is a separately controlled provider integration. Creating a task, drafting a message, submitting a draft for review, recording consent, importing a document, or converting an inbound reply to a task does not authorize a customer-facing send.

## Roles

- Owner: all tasks, all messages, consent, templates, owner decisions, selected-message release, delivery review, and provider configuration.
- Administrator: all tasks, task reassignment, message preparation, consent, templates, manual inbound sync, delivery review, and usage review. Cannot approve or send customer SMS.
- Staff: assigned or role-based tasks, task updates, own message drafts, review submission, and consent recording.
- Bookkeeper and Payroll: assigned or role-based internal tasks and read access to message templates. No customer-messaging access by default.
- Viewer: assigned or role-based task visibility only. No writes.

A task assignment does not grant access to its linked customer, invoice, payroll, tax, document, or other record. Linked-record access is checked independently on the server.

## Task controls

Tasks support user or role assignment, due date and optional time, reminder date and optional time, priority, instructions, notes, reassignment, linked records, and the following states: Open, Accepted, Started, Waiting, Blocked, Overdue, Completed, and Cancelled.

The My Tasks view is role-scoped. Owner and Administrator views can include all tasks. Filters support user, role, priority, status, due date, linked-record type, and linked-record ID. Every create, update, reassignment, and status transition writes task history, Audit Log, and Proof Log evidence.

Task reminders are internal app reminders. Due, scheduled, and overdue work is surfaced in My Tasks. No email, SMS, or scheduled trigger is created by this workstream.

## Message lifecycle

Outbound message lifecycle:

1. Draft
2. Needs Review
3. Owner decision: Approve, Revise, Hold, or Reject
4. Approved plus Send Allowed
5. Selected-message release check
6. Sent, Delivered, Failed, or Blocked — Delivery Unknown

Inbound messages are imported only by a selected manual provider sync. They enter as Received or Opted Out. They never generate an automatic reply. A selected inbound reply may be converted to an internal task.

## Required send checks

The server rechecks all of the following immediately before one selected SMS is released:

- Owner identity and Customer Send Access
- Exact Message ID
- Outbound direction
- Approved status
- Send Allowed = Yes
- Documented consent for the exact normalized phone number
- No active opt-out or revocation
- No duplicate sent message
- No prior unknown-delivery retry lock
- Monthly segment and cost limits
- Provider credentials present in Script Properties
- Approved sending number present
- Business texting registration approved — the per-business 10DLC state, not just the fleet flag. Since build `20261109-10dlc-1`, registration is filed by **our own** automation (Rick's decision: "our own" — Dial was not bought): the Office collects a registration packet, a rules-based pre-check names every gap before anything is filed, and the `h38-sms-registration` edge function files the brand + campaign inside the **customer's own** Telnyx account with the customer's own stored API key. State lives in `business_records` (`smsRegistration`: `not_started | precheck_failed | filed | in_review | approved | rejected` + carrier reason verbatim) and is polled every 30 minutes until it resolves. `h38-send-sms` refuses a business's sends until ITS state is `approved`, in addition to every check in this list; the default for every business is NOT approved. `H38_SMS_A2P_APPROVED=TRUE` remains the fleet operator override for sends H38 itself performs.
- Package external-action release enabled
- Script Property release enabled

Changing the phone number, body, template, customer, task, or linked record after approval resets the message to Draft / Revision Required and closes Send Allowed.

## Consent and STOP controls

Consent records preserve the customer, exact phone number, scope, source, date, evidence, recorder, and later opt-out or revocation history. STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, and QUIT are treated as opt-out keywords during inbound import. Opt-out suppression is checked again before approval and sending.

## Duplicate and uncertain-delivery controls

A message duplicate key is based on the normalized phone, body, and linked record. A matching Sent, Delivered, or Blocked — Delivery Unknown record prevents another send. If the provider request returns an uncertain result, the message becomes Blocked — Delivery Unknown, Retry Locked = Yes, and no automatic retry occurs.

Usage reporting maintains one record per message and direction. Later delivery-status checks update that record with provider price and status information instead of adding duplicate segment or cost entries.

## Provider configuration

No provider secret may be committed to GitHub, written to a spreadsheet, included in Proof Log evidence, or returned to the browser. Twilio configuration uses these Apps Script Properties:

- `H38_SMS_TWILIO_ACCOUNT_SID`
- `H38_SMS_TWILIO_AUTH_TOKEN`
- `H38_SMS_FROM_NUMBER`
- `H38_SMS_A2P_APPROVED`
- `H38_SMS_SEND_RELEASED`
- `H38_SMS_INBOUND_SYNC_RELEASED`
- `H38_SMS_MONTHLY_SEGMENT_LIMIT`
- `H38_SMS_MONTHLY_COST_LIMIT`

The committed Highway 38 package keeps outbound sending and inbound provider sync disabled. Activating either requires a separately approved code change plus the corresponding Script Property release. No bulk-message endpoint and no automatic trigger are included.

## Deployment and rollback

The implementation updates the accepted existing Apps Script project and existing deployment IDs in place. It does not create a replacement project, deployment, URL, or spreadsheet operating interface. Deployment evidence includes the pre-change bound-project backup, checksums, test artifacts, deployment IDs, HTTP status evidence, source commit, and rollback source archive.
