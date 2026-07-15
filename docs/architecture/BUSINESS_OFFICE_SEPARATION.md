# Business Office separation architecture

## Product boundaries

- `apps/business-office`: deployable Business Office web application and installer.
- `packages/*`: business-neutral runtime modules.
- `business-packs/highway38`: Highway 38 identity, property-key mapping, catalog expectations, approval language, and website connection.
- `business-packs/template-business`: neutral empty installation configuration.
- `apps-script/business-office`: unchanged live Highway 38 implementation during migration.

## Isolation model

Every installation receives its own Apps Script project and deployment, Google Sheet, Drive root, document, PDF, export, and backup folders, user table, Proof Log, Error Log, and Script Properties. Business packs contain property-key names only; live IDs remain in installation Script Properties and deployment secrets.

## Deployment modes

- Standalone: build with `node scripts/build-business-office-installation.js --pack template-business --mode standalone`.
- Combined: build with `--pack highway38 --mode combined`; the manifest records website and Owner Portal connection points.

## Migration strategy

1. Build and verify neutral bundles beside the live implementation.
2. Provision a clean second installation with separate resources.
3. Run clean-install acceptance.
4. Deploy the Highway 38 bundle to a temporary acceptance deployment using current live resources.
5. Compare behavior and generated documents with the current deployment.
6. Update the existing live deployment only after regression PASS.
7. Retain the previous deployment version and workbook backup as rollback points.
