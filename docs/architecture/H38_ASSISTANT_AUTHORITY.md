# H38 Assistant Authority

## Current authority

The Supabase Business Office has one shared advisory AI route, one owner-facing assistant experience, and multiple specialist systems.

### My H38 Assistant / Personal Assistant
- Each signed-in owner or administrator gets their own private assistant state by Supabase Auth user ID.
- Personal reminders, tasks, routines, notes and memory remain user-private in `personal_assistant_items`; they are never shared merely because two owners belong to the same business.
- The same owner's assistant follows that owner between the H38 Android shell and the responsive web app because both use the same Supabase Auth account and backend.
- The visible experience is unified as **My H38 Assistant / Ask H38**. The older separate Personal Assistant and H38 AI top launchers are not separate user concepts anymore.
- The Personal Assistant form may dispatch deterministic Business Office commands through `H38_ASSISTANT_COMMAND_BUS` when a command has an existing specialist authority.
- Business commands run with the signed-in user's current Business Office permissions. The assistant cannot elevate permissions or see another owner's private assistant records.
- Deterministic personal commands stay local when possible.

### H38 Assistant AI router
- `commercial-app/supabase-ai-fallback.js` owns general `aiAsk` routing for the current Supabase app.
- Unsupported business questions from My H38 Assistant use the same read-only advisory route.
- Online advisory requests go to `h38-assistant-ai`; offline/provider failures fall back to deterministic local guidance.
- Direct commitment commands are stopped before cloud execution and redirected to existing Office controls.

### Business Office command bus
- `commercial-app/assistant-command-bus.js` is the deterministic command router for supported internal Business Office commands.
- It may navigate to permitted pages, resolve a permitted customer, open Customer 360, prepare a working quote context, open Site Visit, open a meeting, open jobs, and prepare other internal workflows supported by existing specialist modules.
- It does not bypass specialist validation or review controls.
- Sending, approval, purchasing, payment, deletion, permission changes, publishing, deployment, payroll export, tax filing, or other external commitments remain blocked and must use the existing explicit Business Office control.

### Specialist ownership
- Quote Builder / Quote AI: estimating, pricing, proposal drafting and quote-specific AI.
- Site Visit: field capture, walkthrough evidence, photos and measurements.
- Work / Task Manager: jobs, deployment and employee tasks.
- Time & Attendance: employee punches and audited owner/admin corrections.
- Schedule: schedule records.
- Money: invoices, expenses and payment records.
- Documents: files and document workflow.
- ERP Center: deeper management, data uptake, historical learning and add-on hooks.
- Existing communications/delivery controls: customer email, SMS and quote delivery.

The general assistant does not replace these specialists and must not call their mutation paths as a shortcut.

## Cross-platform shell rule

The shared Business Office is the product UI for web, Android and future iOS. `commercial-app/office-polish.js` and `office-polish.css` own the final cross-platform shell polish without creating another navigation authority.

- Android app and web app use the same assistant, account data and Business Office command bus.
- The phone header must respect the device status-bar safe area before any top action is shown.
- iPhone/iPad web presentation must respect CSS `safe-area-inset-top` and `safe-area-inset-bottom` before an iOS native shell is started.
- The single floating H38 assistant launcher stays above the bottom navigation and device safe area.
- Employee mode intentionally hides the owner assistant launcher; employees keep their assigned-work workspace.
- This authority stops before implementation of a native iOS `WKWebView` shell or native iOS camera/credential bridge.

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

## Owner privacy boundary

`personal_assistant_items` is protected by row-level security and user ownership. The Personal Assistant may read the owner's permitted cached Business Office context for summaries and commands, but business records are not copied into the private assistant store as shared AI memory. Multiple owners of one company therefore keep separate private reminders, notes, routines and memory while working against the same permitted business records.

## Legacy Apps Script assistant

`apps-script/business-office/BusinessOffice_AI_Assistant.gs` and `BusinessOffice_AI_Assistant_Client.html` are legacy/compatibility source. They are not loaded by `commercial-app/index.html` and are not authority for the current Supabase Business Office.

Do not add new Supabase assistant behavior to the Apps Script assistant. New general assistant intelligence belongs in the shared advisory router; specialist behavior belongs in its specialist module.

## Non-goals

This architecture does not change CameraX, Android walkthrough handling, measurement authority, Quote AI pricing, quote delivery, customer approvals, purchasing or payments. It also does not create the native iOS shell; that begins only after shared web/Android cross-platform acceptance is complete.
