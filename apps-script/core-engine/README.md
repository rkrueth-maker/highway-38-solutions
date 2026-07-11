# Highway 38 Core Engine Apps Script

This folder contains the complete exported three-layer Apps Script runtime source, reusable Core Engine modules, and deployment documentation.

## Bound Owner Review Portal project

```text
apps-script/core-engine/owner-review-portal/
```

Target Apps Script project ID:

```text
13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o
```

The nine-file export includes the manifest, complete bound menu, wrappers, self-verification, Web App server/UI, and strict owner-approved selected-row send implementation.

## H38OSLIB version 1

Complete immutable export:

```text
apps-script/core-engine/h38oslib/version-1-archive/
```

Selected expanded files:

```text
apps-script/core-engine/h38oslib/version-1/
```

Archive SHA-256:

```text
acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c
```

## H38OwnerLib version 9

Complete immutable export:

```text
apps-script/core-engine/h38ownerlib/version-9-archive/
```

Expanded manifest for inspection:

```text
apps-script/core-engine/h38ownerlib/version-9/appsscript.json
```

Archive SHA-256:

```text
b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5
```

The version-9 manifest has no nested library dependency, so this closes the transitive Apps Script source-export chain.

## Safety rules

- selected-row execution only
- exact Rick approval required
- email, quote, and follow-up sends require `Send Allowed = Yes`
- Gmail draft recipient matching is required for those send routes
- duplicate locks/proof checks required
- no triggers or bulk processing
- website and social actions mark items ready but do not publish
- no automatic payment request or final delivery

## Existing deployment

The current private Web App deployment URL is retained. No deployment or Apps Script version was created during the source exports.

## Bound-project clasp workflow

```bash
cd ~/h38-owner-portal-real
clasp pull
```

Do not run `clasp push` from a directory containing both the exact exported `H38OwnerApprovedEmailSend.js` and the older root-level `.gs` mirror.
