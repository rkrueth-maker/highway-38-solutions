import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = str(PROJECT_ROOT / "reports")
APPROVAL_STATE_FILE = os.path.join(REPORTS_DIR, "forgeiq_web_approvals.json")


def _normalize_state(data):
    data = dict(data or {})
    approved = [product_id for product_id in (data.get("approved") or []) if product_id]
    rejected = [product_id for product_id in (data.get("rejected") or []) if product_id]
    rollout_checks_raw = data.get("rollout_checks") or {}
    rollout_checks = {
        str(item_key): bool(is_checked)
        for item_key, is_checked in dict(rollout_checks_raw).items()
        if item_key
    }
    return {
        "approved": approved,
        "rejected": rejected,
        "reviewed_recommendations": bool(data.get("reviewed_recommendations", False)),
        "rollout_checks": rollout_checks,
    }


def load_approvals():
    if not os.path.exists(APPROVAL_STATE_FILE):
        return _normalize_state({})

    with open(APPROVAL_STATE_FILE, "r", encoding="utf-8") as handle:
        return _normalize_state(json.load(handle))


def save_approvals(data):
    normalized = _normalize_state(data)
    os.makedirs(os.path.dirname(APPROVAL_STATE_FILE), exist_ok=True)
    with open(APPROVAL_STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(normalized, handle, indent=2)


def stage_approved_product_ids(product_ids):
    state = load_approvals()
    ordered_ids = list(dict.fromkeys(product_id for product_id in product_ids if product_id))

    for product_id in ordered_ids:
        if product_id not in state["approved"]:
            state["approved"].append(product_id)

    state["rejected"] = [product_id for product_id in state["rejected"] if product_id not in ordered_ids]
    save_approvals(state)
    return state
