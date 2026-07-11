# H38OSLIB Apps Script Library

This folder documents and preserves the Apps Script library consumed by the Owner Review Portal through identifier `H38OSLIB`.

## Active dependency

The bound Owner Review Portal manifest pins:

- symbol: `H38OSLIB`
- version: `1`
- development mode: `false`

## Source locations

Complete immutable version-1 export:

```text
apps-script/core-engine/h38oslib/version-1-archive/
```

Selected expanded source:

```text
apps-script/core-engine/h38oslib/version-1/
```

The complete archive is authoritative.

## Public core exports

The archived `H38_OS_Library_Core.js` defines:

- `H38OS_executeApprovedSelectedRow`
- `H38OS_updateDashboard`

These are called by the bound-project wrappers.

## Nested dependency

Version 1 references:

- symbol: `H38OwnerLib`
- version: `9`

That exact immutable dependency is now archived under:

```text
apps-script/core-engine/h38ownerlib/
```

Its manifest contains no further Apps Script libraries, so the dependency chain is complete.

## Immutable-version rule

Do not edit archived version-1 source and represent it as deployed version 1. Any correction requires a cleaned candidate, regression testing, a new Apps Script library version, and an intentional bound-manifest update.

No source was pushed to Apps Script and no deployment or trigger was changed during the archive operations.
