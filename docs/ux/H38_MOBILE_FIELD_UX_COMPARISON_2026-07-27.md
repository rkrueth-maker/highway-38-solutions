# Highway 38 Mobile Field UX Comparison

Date: 2026-07-27

## Problem observed

The authenticated Business Office was technically responsive but still behaved like a scaled desktop control center on a phone. The screenshot showed the permanent desktop sidebar, dense dashboard sections, small controls, and too much information before the next field action.

## Comparable field-service patterns

Current field-service mobile products consistently prioritize:

- One glance at today's work and the next required action.
- Large persistent navigation targets for home, work, create, customers, and more.
- A guided lifecycle from request or lead through quote, job, invoice, payment, and closeout.
- Internal preparation and automation that stop at customer contact, financial release, scheduling commitment, or owner approval.
- Full-screen mobile forms and record workspaces rather than compressed desktop tables.

Reference products reviewed:

- Jobber mobile app and request/job/invoice workflows.
- Housecall Pro mobile app and automated scheduling-to-closeout workflow.
- ServiceTitan mobile dispatch, job, and completion workflow.
- Salesforce Field Service mobile worker experience.

## Highway 38 design response

The implementation adds a touch-aware mobile shell that activates for coarse-pointer devices or viewports up to 1100 pixels, including phones using desktop-style browser scaling.

Mobile navigation becomes:

1. Today
2. Work
3. Add
4. Customers
5. More

The Today screen now emphasizes:

- Request-to-payment lifecycle counts.
- One recommended next action.
- Next Up before the larger approval queue.
- Three immediate owner decisions, with the remaining decisions behind one large button.
- Large touch targets and full-screen forms.

## Workflow automation boundary

The safe automatic path is:

1. Complete request information.
2. Create or link a customer when verified details exist.
3. Prepare and review the quote.
4. Stop for owner approval and customer sending.
5. Convert an accepted, owner-approved quote into a job and work order.
6. Stop for scheduling and field-plan decisions.
7. Create a draft invoice from a completed job.
8. Stop for invoice approval and customer delivery.
9. Surface unpaid or overdue follow-up.
10. Preserve recorded payments for owner review and posting.

Automatic actions are limited to deterministic internal record creation and preparation. Customer contact, final approval, scheduling commitments, invoice sending, money movement, payroll, tax filing, purchasing, and deployment remain controlled.
