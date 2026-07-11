# H38OSLIB Version 1 — Exact Archive

This directory preserves the complete ten-file immutable Apps Script API export for `H38OSLIB` version 1.

Because the connector writes UTF-8 text files, the original ZIP is stored as ordered base64 parts. Reconstruction is lossless.

## Reconstruct

```bash
cd apps-script/core-engine/h38oslib/version-1-archive
./reconstruct.sh
```

Expected result:

- file: `h38-os-library-core-v1-export.zip`
- size: `45581` bytes
- SHA-256: `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`
- ZIP entries: `10`

Parts are concatenated in lexical order:

`part00` through `part04`, `part05a`, `part05b`, `part06` through `part08`, `part09a`, `part09b`, then `part10`.

## Archive inventory

- `H38-V6-Safe-Owner-Review-Status-Buttons.gs.js`
- `Code.js`
- `31_CustomerReplyIntakeV2.js`
- `H38-V6-Owner-Approved-Execution-Router.gs.js`
- `H38-V6-Launch-Mode-Function-Audit-Lock.js`
- `H38-V6-Owner-Action-Router.js`
- `H38-V6-Owner-Portal-Menu-Consolidation.js`
- `appsscript.json`
- `H38_OS_Library_Core.js`
- `30_CustomerReplyIntake.js`

The archive is historical source evidence, not a deployment package to push without review. Version 1 remains immutable.
