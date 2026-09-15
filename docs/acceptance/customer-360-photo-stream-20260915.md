# Customer 360 Photo Stream acceptance

Date: 2026-09-15
Branch: `agent/pwa-recording-recovery-20260915`

## Customer-wide media

Customer 360 is the owner-facing source of truth for customer media. The Photo Stream must show customer-linked Site Visit, job, quote, meeting and uploaded image/video evidence as thumbnails. Relationship inheritance may resolve the customer through linked records; a photo does not require a manually duplicated Customer ID when its Site Visit, quote, job, property or meeting already owns that relationship.

Pending phone photos saved locally must remain visible in the same Photo Stream before secure sync completes. Synced media stays private in Business Office storage and is opened with time-bounded signed URLs.

## Media interaction

- All customer-linked photos and video appear in one thumbnail grid.
- Filters may narrow the grid by Site Visit, job, quote, meeting or other source.
- Selecting a thumbnail opens a full-size photo/video viewer.
- The viewer exposes owner Edit and Delete controls.
- Editing descriptive metadata does not approve or send anything to a customer.
- Deleting synced media removes the private storage object and retires its document record.
- Deleting pending local media removes the pending attachment and matching unsynced upload operation.

## Customer 360 records

Customer 360 must not silently truncate customer history at the old six/eight-row display limits. All linked records remain visible in their existing sections and receive owner Edit/Delete controls where safe.

Protected history stays protected:

- delivered/accepted/converted quotes use the Quote workflow;
- sent/paid/partial/void invoices use the Invoice workflow;
- completed/closed/invoiced jobs remain customer history;
- a customer cannot be deleted while linked history remains;
- Site Visit deletion routes through the repaired Site Visit cleanup authority so private photos/video/audio/capture evidence are removed together while the linked customer and quote remain.

## Customer visibility boundary

Photo Stream is an owner-facing Business Office feature. Nothing in this change automatically releases media to a customer, sends a file, approves a quote, authorizes work, takes payment, purchases anything or schedules work.

A future customer-facing gallery can reuse explicitly selected/released items from this internal Photo Stream, but customer sharing remains a separate deliberate action.
