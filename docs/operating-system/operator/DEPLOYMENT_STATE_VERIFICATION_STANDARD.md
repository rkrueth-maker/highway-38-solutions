# Deployment State Verification Standard

Status: CONTROLLED  
Owner: 03 — Operations & Documentation  
Technical execution owner: 02 — Build & Automation  
Parent authority: 01 — Command Center  
Effective date: 2026-07-13

## Purpose

Every deployment report must distinguish the repository workstation state, the remote production branch state, and the public deployed state. A local commit, branch push, pull request, merge, clean test, or successful workflow is not by itself proof that a public page is live.

Never collapse the three scopes into one status.

## Required scopes

### LOCAL

Record all of the following:

- local branch name;
- full local commit SHA;
- clean or dirty worktree;
- divergence from `origin/main`;
- exact local guard, link check, or test command;
- exact result and exit code.

A dirty local worktree describes LOCAL only. It is not evidence that `origin/main` or a public page is defective.

### ORIGIN_MAIN

Record all of the following:

- full current `origin/main` SHA;
- confirmation that every intended file is present at that SHA;
- comparison of the work commit or PR merge commit to `origin/main`;
- remote workflow and test results;
- confirmation that no intended work remains branch-only.

Branch-only completion is not production completion.

### LIVE_PAGES

Record all of the following:

- exact public URL checked;
- exact visible marker, asset path, text, or behavior confirmed;
- cache-busted URL when an asset, script, stylesheet, or cached page changed;
- deployment workflow/run, deployment time, or equivalent deployment evidence;
- independent post-deployment result.

Repository source is not a substitute for a public-page check.

## Controlled statuses

### PASS

The required evidence for the named scope is complete and agrees with the intended state.

Overall deployment PASS requires:

- LOCAL PASS;
- ORIGIN_MAIN PASS; and
- LIVE_PAGES PASS.

### BLOCKED

A required condition failed, a contradiction exists, or the next action would be unsafe. State the failing scope, preserve evidence, and stop. Do not rewrite a test merely to produce a green result.

### ALREADY_LIVE

The intended markers are already present in `origin/main` and on the public page. Do not redeploy. Record the confirming SHAs, URL, markers, and verification evidence.

### NOT_VERIFIED

Evidence is unavailable, incomplete, stale, or could not be independently checked. Do not report the affected scope as published, deployed, live, fixed, or complete.

`UNKNOWN` output from a technical guard is reported operationally as `NOT_VERIFIED` until evidence resolves it.

## Overall reporting rule

Use this exact structure in deployment closeouts:

```text
LOCAL: PASS | BLOCKED | ALREADY_LIVE | NOT_VERIFIED
- branch:
- SHA:
- worktree:
- tests:

ORIGIN_MAIN: PASS | BLOCKED | ALREADY_LIVE | NOT_VERIFIED
- SHA:
- intended files present:
- workflows/tests:
- branch-only work remaining:

LIVE_PAGES: PASS | BLOCKED | ALREADY_LIVE | NOT_VERIFIED
- URL:
- cache-busted URL:
- markers/assets/behavior:
- deployment evidence:

OVERALL: PASS | BLOCKED | ALREADY_LIVE | NOT_VERIFIED
```

If any required scope is BLOCKED, overall status is BLOCKED. If any required scope is NOT_VERIFIED, overall status cannot be PASS.

## Records

Preserve:

- work commit SHA;
- PR number;
- merge commit SHA;
- workflow run and result;
- exact test commands;
- exact URLs and markers;
- contradictions and resolution ownership;
- final PASS, BLOCKED, ALREADY_LIVE, or NOT_VERIFIED.

Related controls:

- `DIRECT_TO_MAIN_COMMAND_RULE.md`
- `SAMPLE_LIBRARY_DEPLOYMENT_PROCEDURE.md`
- `DEPLOYMENT_FAILURE_PREVENTION_CHECKLIST.md`
