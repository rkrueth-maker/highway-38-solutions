# FieldOps Phase 1 Session Archive — 2026-06-29

## Project name
ForgeIQ FieldOps / FieldProof-style app.

## Core idea
A field-service proof and invoice app for snow plow operators, landscapers, contractors, cleaners, junk removal, property maintenance, and similar small service businesses.

Core workflow:

```text
Customer → Job → Photo Proof → Mark Complete → Invoice Draft → Owner Review → Send Invoice
```

Simple promise:

```text
Take a photo. Mark the job done. The invoice draft is created. Everything saves under the right customer/job.
```

## Build order locked

1. Build the proof + invoice workflow first.
2. Add customer portal second.
3. Add quote intake third.
4. Add receipt/accounting export fourth.
5. Add payroll/time tracking later.

Important scope rule: do not build Phase 2+ until Phase 1 works end-to-end.

## Phase 1 locked scope

Phase 1 only includes:

- Admin Dashboard
- Customers
- Jobs
- Photo Upload
- Invoice Draft / Preview / Send
- Activity Log
- Smith Residence demo

Do not build yet:

- Customer portal
- Quote intake
- Receipt storage
- Accounting export
- Payroll
- Time tracking
- GPS tracking
- Text messaging
- Route planning
- AI estimating
- Final package
- Mobile app-store version

## Phase 1 database tables

```text
companies
users
customers
jobs
photos
invoices
invoice_items
activity_log
```

## Phase 1 routes

```text
/dashboard
/customers
/customers/new
/customers/[customer_id]
/jobs
/jobs/new
/jobs/[job_id]
/jobs/[job_id]/photos/new
/jobs/[job_id]/invoice
/invoices
/invoices/[invoice_id]
```

## Phase 1 server action files

```text
lib/actions/activity.ts
lib/actions/customers.ts
lib/actions/jobs.ts
lib/actions/photos.ts
lib/actions/invoices.ts
```

## Phase 1 app setup created in chat

A ZIP project was generated in the ChatGPT sandbox:

```text
/mnt/data/forgeiq-fieldops-phase1.zip
```

The ZIP included:

- Next.js app files
- PostgreSQL `schema.sql`
- `seed.sql`
- Phase 1 server actions
- Dashboard pages
- Customer pages
- Job pages
- Photo proof flow
- Invoice draft/send flow
- Smith Residence demo checklist
- Demo before/after driveway images
- README
- BUILD_MAP

The sandbox link was shared in chat as:

```text
sandbox:/mnt/data/forgeiq-fieldops-phase1.zip
```

Note: sandbox files may not be permanent across sessions, so the project should eventually be uploaded to GitHub as its own repo, ideally named `forgeiq-fieldops`.

## Smith Residence demo

Customer:

```text
Smith Residence
```

Job:

```text
Snow plow driveway
```

Price:

```text
$45.00
```

Demo address:

```text
123 Demo Drive, Grand Rapids, MN 55744
```

Required end-to-end test:

```text
1. Open /dashboard
2. Open Smith Residence snow plow driveway job
3. Click Start Job
4. Upload Before Photo using /demo/before-driveway.jpg
5. Upload After Photo using /demo/after-driveway.jpg
6. Click Mark Complete
7. Click Generate Invoice Draft
8. Confirm invoice line item says Snow plow driveway service
9. Confirm total is $45.00
10. Click Send Invoice
11. Confirm invoice status is sent
12. Confirm job status is Invoice Sent
13. Open Smith Residence customer page
14. Confirm job, photos, invoice, and activity log are all saved together
```

Phase 1 is done only when this works:

```text
Smith Residence → Snow plow driveway → before photo → after photo → complete job → invoice draft → send invoice → customer record shows everything together
```

## Recommended build/test setup for phone or Chromebook

Because the user is on a cell phone or Chromebook, do not start with a local Node/Postgres setup.

Recommended setup:

```text
GitHub = code storage and place ChatGPT can edit
GitHub Codespaces = browser-based development environment
Supabase = hosted PostgreSQL database
Vercel = live test website later
```

Alternative easier beginner option:

```text
Replit + Supabase
```

But ChatGPT can directly work best through GitHub, so the longer-term path is:

```text
Create GitHub repo → upload ZIP contents → connect Supabase → run in Codespaces → deploy to Vercel later
```

## Interest-check messages created

### Quick text

```text
Hey, I’m working on a simple app idea for small service businesses. It would let workers take before/after job photos, save them under the right customer, mark the job complete, and automatically create an invoice draft for the owner to review.

Would something like that help your business, or is paperwork/photos/invoicing not really a problem for you?
```

### Stronger text

```text
I’m testing an idea for contractors, landscapers, snow plow operators, and service businesses.

The idea is: take job photos → save them to the right customer/job → mark work complete → invoice draft gets created → everything stays organized for proof and records.

Would you use something like that? And what would it need to do for it to actually be useful?
```

### Email

```text
Subject: Quick question about a job photo/invoice app

Hi,

I’m working on a simple app idea for small service businesses like landscaping, snow plowing, property maintenance, cleaning, junk removal, and contracting.

The basic idea is:

Take before/after job photos, save them under the correct customer and job, mark the job complete, and have the app create an invoice draft for review. The goal is to keep photos, proof of work, notes, and invoices organized instead of scattered across texts, camera rolls, notebooks, and email.

I’m not trying to sell anything right now. I’m just checking whether this would solve a real problem.

Would this be useful in your business?

The main things I’m wondering are:

1. Do job photos/proof of work ever become a problem?
2. Do invoices ever get delayed or forgotten?
3. Would a simple photo-to-invoice workflow save time?
4. What feature would matter most to you?

Thanks,
Rick
```

## Next recommended step

When returning to this project, continue from:

```text
Create GitHub repo named forgeiq-fieldops and upload ZIP contents, or connect GitHub so ChatGPT can create/edit the repo files directly.
```

If validating interest first:

```text
Send the quick text/email to 5–10 local service businesses and save the feedback.
```
