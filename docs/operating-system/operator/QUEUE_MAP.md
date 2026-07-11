# Highway 38 Operating System — Queue Map

Source of truth: Owner Review Portal spreadsheet.

| Queue | Purpose | Entry condition | Exit condition | External action |
|---|---|---|---|---|
| New Requests | Capture unreviewed intake | New form, email, internal request, or imported lead | Route to Job Queue, hold, reject, archive test, or log error | None |
| Job Queue | Track active/review-ready work | Intake accepted for tracking | Route to output, quote, email, follow-up, close, or error | None |
| Output Queue | Hold draft deliverables | Draft output exists | Revise, approve delivery-draft routing, close, or error | Final delivery remains owner-controlled |
| Email Approval Queue | Control Gmail draft sends | Existing draft tied to selected row | Send and lock, hold, revise, reject, or error | Selected-row send only after Rick approval |
| Quote Approval Queue | Control quote review and quote email | Quote draft exists | Approve/send, hold, revise, reject, or error | No quote send or payment request without approval |
| Follow-Up Queue | Control follow-up timing and drafts | Follow-up is due or drafted | Send and lock, hold, close, or error | Selected-row send only after Rick approval |
| Social Approval Queue | Control public social handoff | Public-safe draft and assets exist | Approved handoff, hold, revise, reject, or error | No automatic publishing |
| Website Approval Queue | Control website changes | Public-safe proposed change exists | Approved GitHub handoff, hold, revise, reject, or error | No automatic deployment |
| Proof Log | Permanent audit trail | Important internal or approved external action occurs | Never deleted; test history may be archived | Records evidence only |
| Error Log | Record blocked, failed, unsafe, or uncertain actions | Safety control or system failure blocks work | Resolve, document, archive test record | No external action |
| Settings | Controlled rules and allowed values | Administrative update | Remains active | None |
| System Verification | Record current system checks | Verification pass runs | Remains active | None |
| Launch Function Audit | Compatibility audit for functions and menu targets | Code audit runs | Remains active or archived when replaced | None |

## Queue rules

- The selected row is the unit of action.
- Moving a row does not equal approval.
- Rick Review Required / Owner Approval Required remains the default gate.
- Proof Log is required for important approved actions.
- Error Log is required when work is blocked, unsafe, failed, or uncertain.
- Test records belong in hidden archive tabs, not active queues.