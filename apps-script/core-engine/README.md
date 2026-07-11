# Highway 38 Core Engine Apps Script

This folder contains the exported Owner Review Portal bound project, the immutable H38OSLIB version used by that project, reusable Core Engine modules, and deployment documentation.

## Bound project

```text
apps-script/core-engine/owner-review-portal/
```

Target Apps Script project ID:

```text
13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o
```

The nine-file export includes the manifest, complete bound menu, wrappers, self-verification, Web App server/UI, and the strict owner-approved selected-row send implementation.

## H38OSLIB version 1

The complete ten-file immutable API export is preserved at:

```text
apps-script/core-engine/h38oslib/version-1-archive/
```

Selected source files are expanded at:

```text
apps-script/core-engine/h38oslib/version-1/
```

The archive is authoritative. Reconstruct it with `h38oslib/version-1-archive/reconstruct.sh` and verify SHA-256 `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`.

Do not modify archived files and represent them as deployed version 1. Review `h38oslib/VERSION_1_AUDIT.md` before creating a replacement version.

## Nested dependency

H38OSLIB version 1 references `H38OwnerLib` version 9. That transitive library still requires a separate version-specific export.

## Safety rules

- selected-row execution only
- exact Rick approval required
- strict bound email send requires `Send Allowed = Yes`
- strict bound email send verifies the draft recipient
- duplicate locks required
- no triggers or bulk processing
- no automatic payment request, final delivery, social publish, or website deployment

## Existing deployment

The current private Web App deployment URL is retained. No new deployment or Apps Script version was created during either export.

## Bound-project clasp workflow

```bash
cd ~/h38-owner-portal-real
clasp pull
```

Do not run `clasp push` from a directory containing both the exact exported `H38OwnerApprovedEmailSend.js` and the older root-level `.gs` mirror.
