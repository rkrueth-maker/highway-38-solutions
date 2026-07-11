# H38OwnerLib Version 9 — Exact Archive

This directory preserves the exact two-file immutable Apps Script API export for `H38OwnerLib` version 9.

Because the repository connector writes text files, the original ZIP is stored as base64 and reconstructed losslessly.

## Reconstruct

```bash
cd apps-script/core-engine/h38ownerlib/version-9-archive
./reconstruct.sh
```

Expected result:

- file: `h38-owner-library-v9-export.zip`
- size: `4399` bytes
- SHA-256: `b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5`
- ZIP entries: `2`

## Archive inventory

- `Code.js`
- `appsscript.json`

The manifest is expanded under `../version-9/` for easy inspection. The reconstructed archive is the authoritative complete version-9 source. Version 9 is historical immutable source evidence, not a package to push without review.
