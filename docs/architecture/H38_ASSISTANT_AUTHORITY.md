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
- `commercial-app/assistant-tenant-actions.js` extends that same existing Assistant/command-bus experience with permission-gated tenant-data operations. It does not create a second Office, quote engine, invoice engine, or mutation backend.
- `commercial-app/ai-owner-command-authority.js` adds an explicit owner-only approval form: `Owner command: <action>`. For a signed-in owner, that explicit command may authorize an exact supported tenant-data action and immediately hand the resulting existing preview to `assistant-tenant-actions.js` `executePending()`.
- The owner-command authority does not add a second write path or broaden the tenant-action catalog. It strips the explicit prefix, uses the existing command resolver, requires the existing action to be executable under current permissions, and relies on the existing deterministic execution, verification, and proof path.
- Ordinary commands without the explicit owner-command prefix remain preview-first. A signed-in owner may also use `Owner command: approve` to execute an exact existing preview or `Owner command: cancel` to cancel it.
- The tenant-action runtime inherits the signed-in human's current Office permissions and active business. It can never grant itself a stronger role, switch businesses from prompt text, bypass RLS, or accept an unvalidated foreign record ID.
- Consequential tenant-data actions use **resolve → validate → preview/explicit-owner-command approval → execute → verify → proof**. Preview state is versioned; revising a proposed value invalidates the prior approval target.
- Owner/admin users with the existing financial capability may approve supported service-rate changes and internal draft quotes. Supported customer/contact edits use existing customer-edit permissions. Bulk pricing uses a stronger aggregate preview and excludes/flags custom-contract records.
- Users without the needed capability may prepare the same preview and request owner review, but the restricted write is not executed. Non-owner users cannot invoke the explicit owner-command direct-execution authority.
- Product/UI/source/security requests are kept outside tenant-data authority and can be captured as structured H38 product suggestions for the internal build process.
- It may navigate to permitted pages, resolve a permitted customer, open Customer 360, prepare a working quote context, open Site Visit, open a meeting, open jobs, and prepare other internal workflows supported by existing specialist modules.
- The cross-platform Assistant polish extends that same command-bus authority for the newer management intents: **ERP Center, Time & Attendance, Team Access, Existing-data uptake, Business-specific quote learning / quote-history analysis, and Task Manager / deployment**.
- Those management commands open the existing specialist controls rather than creating a second ERP, time, employee-access, import, learning, or task authority.
- An explicit request to analyze quote history may start the existing tenant-only advisory quote-learning analysis. It still cannot change prices, mutate a quote, approve, or send anything unless a separate supported deterministic tenant action is explicitly authorized.
- Time commands never clock a user in/out or edit a punch automatically. Team Access commands never invite, remove, or change employee access automatically. Data-uptake commands never stage or apply an import automatically. Task Manager commands never deploy or reassign work automatically.
- It does not bypass specialist validation or review controls.
- Sending, purchasing, payment/refund, deletion, permission changes, publishing, deployment, payroll export, tax filing, or other external commitments remain blocked from owner-command auto-execution and must use the existing explicit Business Office control.

### Specialist ownership
- Quote Builder / Quote AI: estimating, pricing, proposal drafting and quote-specific AI.
- Site Visit: field capture, walkthrough evidence, photos and measurements.
- Work / Task Manager: jobs, deployment and employee tasks.
- Time & Attendance: employee punches and audited owner/admin corrections.
- Team Access: employee membership/access administration for owner/administrator roles.
- Schedule: schedule records.
- Money: invoices, expenses and payment records.
- Documents: files and document workflow.
- ERP Center: deeper management, data uptake, historical learning and add-on hooks.
- Existing communications/delivery controls: customer email, SMS and quote delivery.

The Assistant does not replace these specialists. Tenant-aware actions must use the same trusted Office operation queue/functions and specialist validation rules the UI uses; they must not create an alternate mutation backend or bypass normal business rules.

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

Actual business actions remain behind deterministic Business Office controls. The cloud `h38-assistant-ai` route stays advisory and never executes tenant writes itself. Approved tenant-data mutations are performed only by the deterministic `assistant-tenant-actions.js` layer through existing Office operations, under the logged-in user's permissions.

For supported tenant-data operations, a signed-in owner's explicit `Owner command: <action>` is treated as the human approval signal for the exact action resolved by that deterministic layer. This does not make approval automatic: the owner supplied the approval, the current role/capabilities are checked, the active tenant remains fixed, the action must match a supported adapter, and the result must still verify with proof. Unsupported actions remain non-mutating.

### Customer business data vs H38 product boundary

- **Customer business data may be changed** when the current role is permitted and the action passes the required preview/approval rules, including an explicit owner-command approval for a supported deterministic action.
- **H38 engine/product authority may not be changed** by customer Assistant commands. Source code, schema/migrations, RLS/security rules, global platform configuration, and permission escalation remain outside this runtime.
- Cross-tenant prompt switching is blocked. The active business remains the authority and every resolved record must belong to that tenant.
- AI-originated writes carry proof metadata including action ID, tenant, requester/effective role, preview version, before/after values, affected records, approval state, execution result, and verification evidence where supported.
- External customer sends, real payment movement/refunds, purchasing, deletion, access/permission changes, publishing, deployment, payroll/tax submission, and other external commitments remain controlled by their existing explicit Office workflows even when phrased as an owner command.

## Owner privacy boundary

`personal_assistant_items` is protected by row-level security and user ownership. The Personal Assistant may read the owner's permitted cached Business Office context for summaries and commands, but business records are not copied into the private assistant store as shared AI memory. Multiple owners of one company therefore keep separate private reminders, notes, routines and memory while working against the same permitted business records.

## Legacy Apps Script assistant

`apps-script/business-office/BusinessOffice_AI_Assistant.gs` and `BusinessOffice_AI_Assistant_Client.html` are legacy/compatibility source. They are not loaded by `commercial-app/index.html` and are not authority for the current Supabase Business Office.

Do not add new Supabase assistant behavior to the Apps Script assistant. New general assistant intelligence belongs in the shared advisory router; specialist behavior belongs in its specialist module.

## Non-goals

This architecture does not change CameraX, Android walkthrough handling, measurement authority, Quote AI pricing, quote delivery, customer approvals, purchasing or payments. It also does not create the native iOS shell; that begins only after shared web/Android cross-platform acceptance is complete.
