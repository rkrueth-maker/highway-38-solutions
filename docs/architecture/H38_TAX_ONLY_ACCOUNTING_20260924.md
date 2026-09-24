# H38 native accounting + QuickBooks tax-only role

Date: 2026-09-24

## Authority decision

H38 Business Office is the operational and bookkeeping authority for daily work.

H38 owns and operates:

- customers and customer history
- quotes and revisions
- jobs, tasks, dispatch and schedule
- receipts and expenses
- invoices and accounts receivable
- payment recording
- job-cost and profitability signals
- operational reports
- owner and employee workflows

QuickBooks is optional and is not required to run the business.

## QuickBooks boundary

QuickBooks is reserved for accountant / tax handoff only.

The normal Office workflow must not require or teach:

- customer synchronization to QuickBooks
- job or dispatch synchronization to QuickBooks
- invoice creation in QuickBooks
- payment recording in QuickBooks
- expense entry in QuickBooks
- QuickBooks as an operational source of truth

The existing server connector may hold an authorized Intuit connection securely, but external accounting writes remain fail-closed. No provider write is enabled by this decision.

## H38 Tax Center

The Accounting page is presented as the H38 Tax Center.

It builds a tax-period record package from native H38 records and keeps these categories separate:

- invoiced revenue
- payments recorded
- expenses recorded
- open AR for the selected period

The export is a record package, not tax advice. It deliberately does not decide cash-vs-accrual treatment, deductibility, filing treatment, or tax liability. Those decisions remain with the owner/accountant.

The Tax Center can download a CSV without sending or changing any external provider record.

## Training authority

The real deployed training recorder must teach:

1. Daily accounting/bookkeeping stays in H38 Office.
2. Manual payment recording updates H38 bookkeeping and does not move money.
3. Tax packages are built from H38 records.
4. QuickBooks is optional and tax-only.
5. Building/downloading a tax package does not post anything externally.
6. The complete customer → site visit → quote → invoice → paid lifecycle remains an H38 workflow.

Desktop and phone training evidence are both required.
