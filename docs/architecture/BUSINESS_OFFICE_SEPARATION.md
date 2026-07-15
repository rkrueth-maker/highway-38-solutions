# Business Office Product Separation

## Products

### Highway 38 Solutions Business System

The public website, Highway 38 Owner Portal, approved Highway 38 catalog, customer intake, business-specific workflows, and the configured Highway 38 Business Office installation remain one live system.

### Business Office Platform

The Business Office core is business-neutral. It receives identity, branding, storage references, enabled modules, approval language, product rules, tax settings, numbering, and document templates from a selected business pack.

## Repository layout

- `apps/highway38-website` — ownership and deployment boundary for the public site.
- `apps/highway38-owner-portal` — ownership and deployment boundary for the configured owner workspace.
- `apps/business-office` — standalone Business Office application boundary.
- `packages/*` — reusable modules with no Highway 38 data or branding.
- `business-packs/highway38` — the live Highway 38 configuration.
- `business-packs/template-business` — a clean reusable starting point.

The existing root website and `apps-script/business-office` sources remain in place during the compatibility migration. Deployment scripts assemble those proven sources with exactly one business pack.

## Configuration rule

The core never contains live workbook IDs, Drive folder IDs, deployment IDs, customer records, product prices, or business identity. The selected pack contains non-secret defaults and Script Property references. Live resource IDs remain in encrypted deployment variables or Apps Script Script Properties.

## Data isolation

Every installation must have a unique installation ID, business ID, Apps Script project, spreadsheet, root folder, document folder, PDF folder, export folder, backup folder, users table, proof log, error log, audit log, and backup history. The installer rejects an installation plan that reuses a protected Highway 38 resource ID.

## Deployment modes

- Combined: public website + owner portal + Business Office + one business pack.
- Standalone: Business Office + one business pack + separate authentication and storage.

## Compatibility migration

`H38_BO` remains as a temporary internal namespace so the proven Apps Script modules continue to work. Its values now come from the selected business pack; it no longer owns Highway 38 identity or live resource defaults. A later product release may rename the namespace after the separated platform is stable.
