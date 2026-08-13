# H38 Assistant Authority

## Current authority

The Supabase Business Office has one shared advisory AI route and multiple specialist systems.

### Personal Assistant
- Owns private user reminders, tasks, routines, notes, memory, offline cache, and device reminders.
- May read the signed-in user's permitted cached Business Office context for summaries and navigation.
- Personal records stay in `personal_assistant_items`; they are not business-shared AI context.
- Deterministic personal commands stay local when possible.

### H38 Assistant AI router
- `commercial-app/supabase-ai-fallback.js` owns general `aiAsk` routing for the current Supabase app.
- Both the H38 AI drawer and unsupported business questions from Personal Assistant use the same read-only advisory route.
- Online advisory requests go to `h38-assistant-ai`; offline/provider failures fall back to deterministic local guidance.
- Direct commitment commands are stopped before cloud execution and redirected to existing Office controls.

### Specialist ownership
- Quote Builder / Quote AI: estimating, pricing, proposal drafting and quote-specific AI.
- Site Visit: field capture, walkthrough evidence, photos and measurements.
- Work: jobs and tasks.
- Schedule: schedule records.
- Money: invoices, expenses and payment records.
- Documents: files and document workflow.
- Existing communications/delivery controls: customer email, SMS and quote delivery.

The general assistant does not replace these specialists and must not call their mutation paths as a shortcut.

## Execution boundary

`h38-assistant-ai` is advisory only:
- signed-in user and active business membership required;
- server-side OpenAI credentials only;
- no model tools/function calls;
- no reads from `personal_assistant_items`;
- no business table insert/update/upsert/delete operations;
- no sending, approval, purchasing, payment, accounting posting, payroll export, tax filing, permission change, deployment, quote mutation, job mutation or Site Visit mutation;
- every response reports `externalActionOccurred: false`.

Actual business actions remain behind the existing deterministic Business Office controls and owner-review gates.

## Legacy Apps Script assistant

`apps-script/business-office/BusinessOffice_AI_Assistant.gs` and `BusinessOffice_AI_Assistant_Client.html` are legacy/compatibility source. They are not loaded by `commercial-app/index.html` and are not authority for the current Supabase Business Office.

Do not add new Supabase assistant behavior to the Apps Script assistant. New general assistant intelligence belongs in the shared advisory router; specialist behavior belongs in its specialist module.

## Non-goals

This architecture does not change CameraX, Android walkthrough handling, Site Visit navigation, measurement authority, Quote AI pricing, quote delivery, customer approvals, purchasing or payments.
