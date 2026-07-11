# H38OSLIB Apps Script Library

This folder documents and preserves the Apps Script library consumed by the Owner Review Portal through identifier `H38OSLIB`.

## Active dependency

The bound Owner Review Portal manifest pins:

- symbol: `H38OSLIB`
- version: `1`
- development mode: `false`

## Source locations

The complete immutable ten-file version-1 export is preserved losslessly under:

```text
apps-script/core-engine/h38oslib/version-1-archive/
```

Selected high-value files are also expanded under:

```text
apps-script/core-engine/h38oslib/version-1/
```

The complete archive, not the expanded subset, is the authoritative snapshot of version 1.

## Public core exports

The archived `H38_OS_Library_Core.js` defines:

- `H38OS_executeApprovedSelectedRow`
- `H38OS_updateDashboard`

These are called by the bound-project wrappers.

## Nested dependency

Version 1 itself references another Apps Script library:

- symbol: `H38OwnerLib`
- version: `9`
- library ID: recorded in the archived manifest

That transitive library remains live-only until version 9 is exported separately.

## Immutable-version rule

Do not edit archived version-1 source and represent it as the deployed version. Any correction requires a cleaned candidate, regression testing, a new Apps Script library version, and an intentional bound-manifest update.

No source was pushed to Apps Script and no deployment or trigger was changed during this archive operation.
