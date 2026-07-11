# Highway 38 Operating System — Status Dictionary

These are the controlled values for `Approval Status` unless a queue-specific locked status is required.

| Status | Meaning | May external action occur? | Next step |
|---|---|---:|---|
| Pending Review | Item exists but owner review has not started | No | Review and choose an owner decision |
| Rick Review Required / Owner Approval Required | Default blocked state | No | Rick reviews scope, recipient, links, and safety fields |
| Approved by Rick - Action Allowed | Rick approved only the stated selected-row action | Yes, within approved scope only | Run the exact approved action |
| Rejected by Rick | Item must not proceed | No | Archive or revise only if Rick reopens it |
| Needs Changes | Draft or data is incomplete/incorrect | No | Revise, replace, or request missing information |
| Blocked | Error, missing data, unsafe state, or dependency prevents work | No | Resolve and document in Error Log |
| Completed - Proof Logged | Approved action finished and evidence exists | No repeated action | Preserve Proof Log and lock duplicate execution |

## Queue-specific control values

- `APPROVE SEND`: required for approved Gmail draft send.
- `APPROVE QUOTE SEND`: required for approved quote send.
- `APPROVE FOLLOW-UP SEND`: required for approved follow-up send.
- `APPROVE DELIVERY DRAFT ROUTING`: permits draft routing only; it is not final delivery.
- `APPROVE SOCIAL HANDOFF`: permits handoff only; it is not publishing.
- `APPROVE WEBSITE HANDOFF`: permits GitHub/developer handoff only; it is not deployment.
- `Sent - locked`: terminal duplicate-send lock.
- `Yes`: queue-specific allow field after owner approval.
- `No` or blank: external action blocked.

## Error-resolution values

- Open
- Investigating
- Blocked - Owner Review Required
- Resolved
- Closed - Safety Control Worked
- Closed - Cleanup Archive

Do not invent new statuses in active rows. Add a proposed status to Settings and documentation before use.