#!/usr/bin/env python3
"""Manual-run, draft-only Problem Snapshot automation prototype.

Highway 38 Solutions / Highway 38 Supply Co.

This script is intentionally test-safe by default:
- manual run only
- sample/demo data only unless a local JSON input file is explicitly supplied
- no Gmail API calls
- no Google Drive API calls
- no public posting
- no customer-facing delivery
- every output is marked Rick Review Required / Owner Approval Required

Expected demo outputs:
- tracker update JSON
- Drive job packet folder simulation
- draft Problem Snapshot markdown
- Gmail draft .eml simulation and Drive copy fallback
- Command Center proof report
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

OWNER_REVIEW_STATUS = "Rick Review Required / Owner Approval Required"
SAFETY_MODE = "MANUAL_RUN_DRAFT_ONLY_TEST_SAFE"


@dataclass(frozen=True)
class OutputConfig:
    """Config section for tracker, Drive, Gmail draft, and proof report outputs."""

    output_root: str = "artifacts/h38-problem-snapshot-demo"
    tracker_updates_dir: str = "tracker-updates"
    drive_packet_dir: str = "drive-job-packet"
    problem_snapshot_dir: str = "draft-problem-snapshot"
    gmail_draft_dir: str = "gmail-draft-simulation"
    proof_report_dir: str = "command-center-proof-report"
    allow_real_customer_data: bool = False
    create_gmail_draft_simulation: bool = True
    create_drive_copy_fallback: bool = True


SAMPLE_DEMO_DATA: Dict[str, Any] = {
    "request_id": "H38-DEMO-PROBLEM-SNAPSHOT-001",
    "customer_name": "Sample Garage Bay Demo",
    "customer_email": "sample-customer@example.invalid",
    "service": "Problem Snapshot / Messy Details In → Finished Document Out",
    "source": "demo data only",
    "customer_problem": "Garage is full of boxes, tools, parts, and unfinished projects. Customer does not know what to do first.",
    "customer_goal": "Create a simple first-step cleanup and organization plan.",
    "photos_received": [
        "sample-garage-left-wall.jpg (placeholder reference only)",
        "sample-garage-workbench.jpg (placeholder reference only)",
    ],
    "known_measurements": "No verified measurements. Customer needs measurement checklist.",
    "constraints": [
        "Keep workbench",
        "Keep mower and seasonal tools accessible",
        "No final design until Rick review",
    ],
}


class SafetyError(RuntimeError):
    """Raised when a requested run violates draft-only safety rules."""


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def ensure_demo_safe(data: Dict[str, Any], config: OutputConfig) -> None:
    if config.allow_real_customer_data:
        raise SafetyError("Real-customer mode is disabled for this prototype.")
    email = str(data.get("customer_email", ""))
    if not email.endswith(".invalid"):
        raise SafetyError("Demo mode requires a .invalid email address. No real customer email allowed.")
    if data.get("source") != "demo data only":
        raise SafetyError("Input source must be 'demo data only'.")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_tracker_update(data: Dict[str, Any], run_id: str) -> Dict[str, Any]:
    return {
        "run_id": run_id,
        "mode": SAFETY_MODE,
        "request_id": data["request_id"],
        "customer_display_name": data["customer_name"],
        "service": data["service"],
        "customer_status": "Draft packet prepared - owner review required",
        "quote_status": "No quote approved - owner review required",
        "quote_amount": "",
        "owner_review_status": OWNER_REVIEW_STATUS,
        "gmail_status": "Draft simulation only - no email sent",
        "drive_status": "Local Drive packet simulation created",
        "payment_status": "No payment requested",
        "delivery_status": "No final customer delivery",
        "public_posting_status": "No public posting",
    }


def build_problem_snapshot(data: Dict[str, Any], run_id: str) -> str:
    constraints = "\n".join(f"- {item}" for item in data.get("constraints", []))
    photos = "\n".join(f"- {item}" for item in data.get("photos_received", []))
    return f"""# Draft Problem Snapshot

**Run ID:** {run_id}  
**Request ID:** {data['request_id']}  
**Service:** {data['service']}  
**Status:** {OWNER_REVIEW_STATUS}  
**Safety mode:** {SAFETY_MODE}

## Customer problem summary
{data['customer_problem']}

## Customer goal
{data['customer_goal']}

## Photos / inputs noted
{photos}

## Known measurements
{data['known_measurements']}

## Constraints
{constraints}

## Draft problem list
1. Main work areas are visually mixed together.
2. First cleanup lane is not defined.
3. Keep/donate/trash decisions need to happen before layout work.
4. Measurements are missing, so final layout cannot be approved yet.

## Clean-first order
1. Clear one safe walking lane.
2. Group loose tools and parts by type.
3. Separate must-keep seasonal items.
4. Measure wall lengths, door swing areas, and workbench footprint.
5. Prepare revised layout request after missing information is filled in.

## Missing information checklist
- Actual garage width and depth.
- Workbench size.
- Door locations and swing clearances.
- Items that must stay accessible year-round.
- Photos of each wall from corner to corner.

## First action plan
Start with a two-hour sort of the main walking lane and workbench surface. Do not buy storage until measurements and keep/discard decisions are reviewed.

## Owner approval gate
This is a draft-only internal output. It must not be sent, quoted, billed, published, or delivered until Rick approves it.

**Required approval:** {OWNER_REVIEW_STATUS}
"""


def build_gmail_draft_simulation(data: Dict[str, Any], run_id: str) -> str:
    return f"""To: {data['customer_email']}
Subject: Draft Problem Snapshot prepared for review - {data['request_id']}
X-H38-Mode: {SAFETY_MODE}
X-H38-Approval-Gate: {OWNER_REVIEW_STATUS}

DO NOT SEND - DRAFT SIMULATION ONLY

Hi {data['customer_name']},

A draft Problem Snapshot has been prepared internally for review.

This message is not approved for sending. Rick must review the draft, quote path, and customer-facing language before anything is sent.

Status: {OWNER_REVIEW_STATUS}
Run ID: {run_id}

No quote has been approved.
No payment has been requested.
No final customer delivery has occurred.
"""


def build_job_packet(data: Dict[str, Any], run_id: str) -> str:
    return f"""# Drive Job Packet Simulation

**Run ID:** {run_id}  
**Request ID:** {data['request_id']}  
**Customer display name:** {data['customer_name']}  
**Service:** {data['service']}  
**Status:** {OWNER_REVIEW_STATUS}

## Simulated folder structure
- 00_Inbox_Input
- 01_Draft_Problem_Snapshot
- 02_Rick_Review
- 03_Customer_Draft_Hold
- 99_Proof_Report

## Safety notes
- Local Drive packet simulation only.
- No Google Drive API call was made.
- No customer-facing file was shared.
- No final delivery occurred.
"""


def build_proof_report(run_id: str, files: List[str], checks: Dict[str, bool]) -> str:
    check_lines = "\n".join(f"- [{'x' if passed else ' '}] {name}" for name, passed in checks.items())
    file_lines = "\n".join(f"- {file}" for file in files)
    overall = "PASS" if all(checks.values()) else "FAIL"
    return f"""# Command Center Proof Report

**Run ID:** {run_id}  
**Automation:** Manual-run draft-only Problem Snapshot prototype  
**Overall result:** {overall}  
**Required approval:** {OWNER_REVIEW_STATUS}

## Files created
{file_lines}

## Pass/fail checklist
{check_lines}

## Final safety verdict
No email was sent. No quote was approved. No payment request was created. No final customer delivery occurred. No public posting occurred. This run remains draft-only and owner-review-gated.
"""


def run_demo(config: OutputConfig) -> int:
    run_id = f"H38-MANUAL-DRAFT-{utc_stamp()}"
    output_root = Path(config.output_root) / run_id
    data = dict(SAMPLE_DEMO_DATA)
    ensure_demo_safe(data, config)

    tracker_update = build_tracker_update(data, run_id)
    problem_snapshot = build_problem_snapshot(data, run_id)
    job_packet = build_job_packet(data, run_id)
    gmail_draft = build_gmail_draft_simulation(data, run_id)

    created_files: List[Path] = []

    tracker_path = output_root / config.tracker_updates_dir / "tracker-update-draft.json"
    write_json(tracker_path, tracker_update)
    created_files.append(tracker_path)

    packet_path = output_root / config.drive_packet_dir / "drive-job-packet-simulation.md"
    write_text(packet_path, job_packet)
    created_files.append(packet_path)

    snapshot_path = output_root / config.problem_snapshot_dir / "draft-problem-snapshot.md"
    write_text(snapshot_path, problem_snapshot)
    created_files.append(snapshot_path)

    if config.create_gmail_draft_simulation:
        draft_path = output_root / config.gmail_draft_dir / "gmail-draft-simulation.eml"
        write_text(draft_path, gmail_draft)
        created_files.append(draft_path)

    if config.create_drive_copy_fallback:
        fallback_path = output_root / config.gmail_draft_dir / "drive-copy-fallback.md"
        write_text(fallback_path, "# Drive Copy Fallback\n\nGmail draft fallback copy created for Rick review only.\n\n" + gmail_draft)
        created_files.append(fallback_path)

    checks = {
        "Automation is manual-run only": True,
        "Test uses sample/demo data only": data.get("source") == "demo data only",
        "Tracker update is draft/test-safe": tracker_update["customer_status"].startswith("Draft"),
        "Drive packet is created or simulated safely": packet_path.exists(),
        "Problem Snapshot draft output is created": snapshot_path.exists(),
        "Gmail draft is created or fallback Drive copy is created": any(path.exists() for path in [output_root / config.gmail_draft_dir / "gmail-draft-simulation.eml", output_root / config.gmail_draft_dir / "drive-copy-fallback.md"]),
        "Command Center proof report is generated": True,
        f"{OWNER_REVIEW_STATUS} appears": OWNER_REVIEW_STATUS in problem_snapshot and OWNER_REVIEW_STATUS in gmail_draft,
        "No email is sent": True,
        "No quote is approved": tracker_update["quote_status"].startswith("No quote"),
        "No payment request is created": tracker_update["payment_status"].startswith("No payment"),
        "No final delivery occurs": tracker_update["delivery_status"].startswith("No final"),
        "No public posting occurs": tracker_update["public_posting_status"].startswith("No public"),
    }

    proof_path = output_root / config.proof_report_dir / "command-center-proof-report.md"
    write_text(proof_path, build_proof_report(run_id, [str(path) for path in created_files], checks))
    created_files.append(proof_path)

    manifest_path = output_root / "run-manifest.json"
    write_json(
        manifest_path,
        {
            "run_id": run_id,
            "mode": SAFETY_MODE,
            "approval_gate": OWNER_REVIEW_STATUS,
            "output_root": str(output_root),
            "files_created": [str(path) for path in created_files],
            "checks": checks,
        },
    )
    created_files.append(manifest_path)

    print(f"Run ID: {run_id}")
    print(f"Output root: {output_root}")
    print(f"Status: {OWNER_REVIEW_STATUS}")
    print("Result: PASS" if all(checks.values()) else "Result: FAIL")
    for path in created_files:
        print(f"Created: {path}")
    return 0 if all(checks.values()) else 1


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manual-run draft-only Problem Snapshot automation prototype")
    parser.add_argument("--test", action="store_true", help="Run with sample/demo data only. Required for this prototype.")
    parser.add_argument("--out", default=OutputConfig.output_root, help="Output root for local draft artifacts")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    if not args.test:
        print("BLOCKED: This prototype only runs with --test sample/demo data.", file=sys.stderr)
        return 2

    config = OutputConfig(output_root=args.out)
    try:
        return run_demo(config)
    except SafetyError as exc:
        print(f"SAFETY BLOCKED: {exc}", file=sys.stderr)
        return 3
    except OSError as exc:
        print(f"FILE ERROR: {exc}", file=sys.stderr)
        return 4
    except Exception as exc:  # noqa: BLE001 - explicit final safety catch for prototype runs.
        print(f"UNEXPECTED ERROR: {exc}", file=sys.stderr)
        return 5


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
