import json
import os
import datetime

from settings import settings
from shopify.analytics_dashboard import run as analytics_run
from shopify.content_engine import run as content_run
from shopify.orchestrator import run as orchestrator_run
from shopify.seo_auditor import run as seo_run

SCHEDULER_STATE_FILE = os.path.join("reports", "forgeiq_scheduler_state.json")


def _load_state():
    if not os.path.exists(SCHEDULER_STATE_FILE):
        return {"jobs": {}}
    with open(SCHEDULER_STATE_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_state(state):
    os.makedirs("reports", exist_ok=True)
    with open(SCHEDULER_STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)


def _next_run(interval):
    now = datetime.datetime.now(datetime.UTC)
    if interval == "weekly":
        return (now + datetime.timedelta(days=7)).isoformat().replace("+00:00", "Z")
    return (now + datetime.timedelta(days=1)).isoformat().replace("+00:00", "Z")


def get_job_definitions():
    return {
        "daily_seo_audit": {
            "interval": settings.get("SCHEDULE_SEO_AUDIT_CRON", "daily"),
            "runner": seo_run,
        },
        "weekly_content_generation": {
            "interval": settings.get("SCHEDULE_CONTENT_CRON", "weekly"),
            "runner": content_run,
        },
        "daily_analytics_refresh": {
            "interval": settings.get("SCHEDULE_ANALYTICS_CRON", "daily"),
            "runner": analytics_run,
        },
        "daily_orchestrator_summary": {
            "interval": settings.get("SCHEDULE_ORCHESTRATOR_CRON", "daily"),
            "runner": orchestrator_run,
        },
    }


def run_job(job_name):
    jobs = get_job_definitions()
    if job_name not in jobs:
        raise RuntimeError(f"Unknown scheduled job: {job_name}")

    jobs[job_name]["runner"]()

    state = _load_state()
    state.setdefault("jobs", {})[job_name] = {
        "last_run": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
        "next_run": _next_run(jobs[job_name]["interval"]),
    }
    _save_state(state)


def run_scheduled_jobs(run_all=False):
    jobs = get_job_definitions()
    state = _load_state()
    state.setdefault("jobs", {})

    executed = []
    now = datetime.datetime.now(datetime.UTC)

    for name, job in jobs.items():
        if run_all:
            run_job(name)
            executed.append(name)
            continue

        metadata = state["jobs"].get(name)
        if not metadata or not metadata.get("next_run"):
            run_job(name)
            executed.append(name)
            continue

        next_run = datetime.datetime.fromisoformat(metadata["next_run"].replace("Z", "+00:00"))
        if now >= next_run:
            run_job(name)
            executed.append(name)

    return executed


def run(run_all=False):
    executed = run_scheduled_jobs(run_all=run_all)
    if not executed:
        print("No scheduled jobs due.")
        return

    print("Executed scheduled jobs:")
    for name in executed:
        print(f"- {name}")
