# Highway 38 Commercial Platform — Offline, Fleet and Modular Product Foundation

## Accepted starting point

This work starts from `main` commit `4bd1ae9c9a87afe5278effc6fb0908ca98f2afaf` and extends the existing separate Commercial Office beta in place.

It does not create another Apps Script project, permanent deployment, business installation, workbook set or production migration path.

## Product model

The platform uses one shared data and service layer with product shells controlled by entitlements:

- Full Business Office
- Standalone Quote Builder
- Field and Crew app
- Measuring tools
- Inventory and Warehouse
- Fleet, Equipment and Maintenance
- Customer Portal

A customer can begin with Quote Builder and later enable the full Office without rebuilding customers, photos, quotes, price records, messages, equipment or proof history.

## Multi-business-type setup

One business installation may select multiple industry packs during setup. Examples include a contractor that also performs landscaping, repair work and equipment rental.

The installer stores:

- selected industry packs;
- one primary industry pack for initial defaults;
- shared enabled modules;
- business-specific settings.

Industry packs configure terminology, default workflows and recommended modules. They do not create separate data silos.

## Fleet, equipment and maintenance

Fleet and maintenance are first-class operational modules, not labels on a generic asset list.

The shared Asset Data workbook contains:

- assets and tools;
- vehicles and trailers;
- active and returned assignments;
- job-equipment links;
- inspections;
- service plans;
- maintenance work;
- fuel logs;
- usage and meter logs;
- append-only asset events.

Equipment can be assigned to a job, user, crew, truck or location. Assignment and return records retain condition, responsible user and timestamps. Failed inspections can place equipment on hold. Maintenance tracks due dates, meter thresholds, costs and downtime.

## Offline-first client

The installable client shell is hosted on the controlled Highway 38 GitHub Pages origin and uses:

- a service worker for the application shell;
- IndexedDB for structured local records;
- stable client-generated IDs;
- an operation queue;
- visible sync states;
- idempotent server operations;
- an owner-authorized Apps Script bridge.

The public app shell contains no business data. Business information is available only after the signed-in owner bridge authorizes a request.

## Owner-authorized bridge

The existing Apps Script deployment serves an embedded bridge page at `?bridge=1`.

The bridge:

- requires the existing owner sign-in;
- accepts messages only from configured app origins;
- calls the same server-side `cbApi` permission boundary;
- returns results to the app shell;
- does not expose a public unauthenticated JSON API.

This approach allows the installable app shell to own its service worker and offline storage while retaining the current Google-native beta backend.

## Offline Quote Builder contract

The first offline operation is `UPSERT_QUOTE_DRAFT`.

A draft may be created while offline with:

- stable quote ID;
- customer or Generic Quote Customer;
- project title;
- scope;
- measurements and assumptions;
- cached or manual line items;
- cached price timestamp;
- owner-review price status.

Saving creates or updates the local quote and appends a queued operation. Reconnection sends the operation through the owner bridge. The server checks the operation ID before applying it so retries do not duplicate the quote.

Offline work never:

- approves pricing;
- sends email or SMS;
- authorizes work;
- processes payment;
- changes permissions;
- claims cached pricing is current.

## Synchronization rules

Each operation includes:

- operation ID;
- business ID;
- device ID;
- record type and ID;
- action;
- base version;
- local timestamp;
- payload;
- retry and error state.

The server records successful operation IDs in the existing business Core Data workbook. A repeated operation returns `ALREADY_SYNCED` rather than creating a duplicate record.

Append-only records such as usage and inventory events can merge. Quote, price, permission, financial and setting conflicts will require explicit review as those modules are expanded.

## Current implementation slice

Version `0.3.0` adds:

- multiple industry-pack selection during business setup;
- additive schema upgrades for existing business workbooks;
- fleet and vehicle records;
- job-equipment assignments and returns;
- inspections and maintenance;
- equipment usage tracking;
- shared quote draft records;
- offline operation and conflict schemas;
- an installable offline Quote Builder shell;
- the secure owner bridge;
- synchronization for quote drafts and selected low-risk operations.

## Hard boundaries

- Production data and deployment IDs remain unchanged.
- External actions remain disabled.
- Production migration remains disabled.
- Existing workbooks are upgraded additively and never recreated.
- Important actions remain owner-controlled and auditable.
- AI, email, SMS and customer-facing actions may be added only behind their existing approval and permission controls.
