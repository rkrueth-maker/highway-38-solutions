# H38 Problem Snapshot Draft-Only Automation Prototype

## Purpose

This is the first manual-run draft-only automation prototype for Highway 38 Solutions / Highway 38 Supply Co.

It turns sample/demo intake data into internal draft artifacts for Rick review:

- tracker update JSON
- Drive job packet simulation
- draft Problem Snapshot output
- Gmail draft simulation with Drive copy fallback
- Command Center proof report

## Safety status

**Automation type:** Manual-run only  
**Mode:** Draft-only test/demo mode  
**Required gate:** Rick Review Required / Owner Approval Required

This prototype must never be treated as live customer automation.

## Hard rules preserved

- Do not send emails automatically.
- Do not approve quotes automatically.
- Do not request payment automatically.
- Do not deliver final customer work automatically.
- Do not publish anything publicly.
- Do not switch to live mode.
- Preserve `Rick Review Required / Owner Approval Required`.
- Keep all real customer-facing action approval-only.

## File added

```text
scripts/h38_problem_snapshot_draft_only.py
```

## How Rick runs the manual test

From the repo root, run:

```bash
python3 scripts/h38_problem_snapshot_draft_only.py --test
```

Optional custom output folder:

```bash
python3 scripts/h38_problem_snapshot_draft_only.py --test --out artifacts/h38-problem-snapshot-demo
```

The script intentionally blocks if `--test` is not supplied.

## Output folders

Each run creates a timestamped folder under:

```text
artifacts/h38-problem-snapshot-demo/H38-MANUAL-DRAFT-<timestamp>/
```

Inside that run folder:

```text
tracker-updates/tracker-update-draft.json
drive-job-packet/drive-job-packet-simulation.md
draft-problem-snapshot/draft-problem-snapshot.md
gmail-draft-simulation/gmail-draft-simulation.eml
gmail-draft-simulation/drive-copy-fallback.md
command-center-proof-report/command-center-proof-report.md
run-manifest.json
```

## Config section

The script contains an `OutputConfig` section for:

- output root
- tracker update folder
- Drive packet folder
- Problem Snapshot folder
- Gmail draft simulation folder
- proof report folder
- real customer data safety flag, locked off
- Gmail draft simulation toggle
- Drive copy fallback toggle

## Test data rule

The current prototype uses only built-in sample/demo data:

```text
H38-DEMO-PROBLEM-SNAPSHOT-001
Sample Garage Bay Demo
sample-customer@example.invalid
```

The `.invalid` email domain is intentional. It prevents accidental real-customer use.

## Pass/fail checklist

The Command Center proof report checks:

- [ ] Automation is manual-run only
- [ ] Test uses sample/demo data only
- [ ] Tracker update is draft/test-safe
- [ ] Drive packet is created or simulated safely
- [ ] Problem Snapshot draft output is created
- [ ] Gmail draft is created or fallback Drive copy is created
- [ ] Command Center proof report is generated
- [ ] Rick Review Required / Owner Approval Required appears
- [ ] No email is sent
- [ ] No quote is approved
- [ ] No payment request is created
- [ ] No final delivery occurs
- [ ] No public posting occurs

## Expected terminal result

A passing run prints:

```text
Status: Rick Review Required / Owner Approval Required
Result: PASS
```

## Owner review step

Rick reviews the generated files manually. Nothing should be copied to a real customer, emailed, quoted, billed, delivered, or posted until Rick approves it separately.

## Current limitation

This prototype simulates Drive and Gmail outputs by writing local files. It does not call Google Drive or Gmail APIs yet. That is intentional for the first draft-only safety test.
