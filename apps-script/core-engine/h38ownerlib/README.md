# H38OwnerLib Apps Script Library

This folder preserves `H38OwnerLib`, the final nested Apps Script dependency used by `H38OSLIB` version 1.

## Active dependency identity

The H38OSLIB version-1 manifest pins:

- symbol: `H38OwnerLib`
- version: `9`
- development mode: not enabled
- library ID: recorded in the archived H38OSLIB manifest

## Source locations

Expanded manifest for inspection:

```text
apps-script/core-engine/h38ownerlib/version-9/appsscript.json
```

Checksum-verifiable complete original export:

```text
apps-script/core-engine/h38ownerlib/version-9-archive/
```

## Public owner actions

Version 9 defines selected-row owner functions for:

- sending an approved existing customer-email draft;
- sending an approved quote draft;
- routing an approved request internally to Job Queue;
- marking a website item ready without deploying it;
- sending an approved follow-up draft;
- marking a social item ready without publishing it.

Email, quote, and follow-up sends require the exact owner decision, `Send Allowed = Yes`, duplicate checks, an existing Gmail draft, and recipient matching.

## Dependency status

The version-9 manifest contains no further Apps Script libraries. This closes the transitive Apps Script source-export chain.

## Immutable-version rule

Do not edit the archived source and represent it as deployed version 9. A functional change requires tested candidate source and a deliberate new Apps Script library version.
