import json
import os
import datetime

from settings import settings
from shopify.analytics_dashboard import run as analytics_run
from shopify.competitive_intelligence import run as competitive_intelligence_run
from shopify.content_engine import run as content_run
from shopify.orchestrator import run as orchestrator_run
from shopify.product_optimizer import analyze_products, fetch_products, print_summary, write_report
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


def _run_product_scan_job():
    products = fetch_products()
    rows, recommendations = analyze_products(products)
    write_report(rows)
    print_summary(rows, recommendations)


def _run_morning_automation():
    seo_run()
    analytics_run()
    _run_product_scan_job()
    content_run(channels=["blog", "pinterest", "facebook", "email"], tone=settings.get("CONTENT_TONE_DEFAULT", "balanced"))


def _run_evening_automation():
    orchestrator_run()
    content_run(channels=["email"], tone=settings.get("CONTENT_TONE_DEFAULT", "balanced"))


def _run_competitive_intelligence_brief():
    competitive_intelligence_run()


def get_job_definitions():
    return {
        "daily_seo_audit": {
            "interval": settings.get("SCHEDULE_SEO_AUDIT_CRON", "daily"),
            "runner": seo_run,
        },
        "morning_automation": {
            "interval": settings.get("SCHEDULE_MORNING_AUTOMATION_CRON", "daily"),
            "runner": _run_morning_automation,
        },
        "evening_automation": {
            "interval": settings.get("SCHEDULE_EVENING_AUTOMATION_CRON", "daily"),
            "runner": _run_evening_automation,
        },
        "daily_competitive_intelligence": {
            "interval": settings.get("SCHEDULE_COMPETITIVE_INTEL_CRON", "daily"),
            "runner": _run_competitive_intelligence_brief,
        },
        "daily_analytics_refresh": {
            "interval": settings.get("SCHEDULE_ANALYTICS_CRON", "daily"),
            "runner": analytics_run,
        },
        "daily_orchestrator_summary": {
            "interval": settings.get("SCHEDULE_ORCHESTRATOR_CRON", "daily"),
            "runner": orchestrator_run,
        },
        "weekly_content_generation": {
            "interval": settings.get("SCHEDULE_CONTENT_CRON", "weekly"),
            "runner": lambda: content_run(channels=["blog", "pinterest", "facebook", "email"], tone=settings.get("CONTENT_TONE_DEFAULT", "balanced")),
        },
    }


def run_job(job_name):
    jobs = get_job_definitions()
    if job_name not in jobs:
        raise RuntimeError(f"Unknown scheduled job: {job_name}")

    status = "success"
    error_message = ""

    try:
        jobs[job_name]["runner"]()
    except Exception as exc:
        status = "error"
        error_message = str(exc)
        print(f"Job failed: {job_name}: {exc}")

    state = _load_state()
    state.setdefault("jobs", {})[job_name] = {
        "last_run": datetime.datetime.now(datetime.UTC).isoformat().replace("+00:00", "Z"),
        "next_run": _next_run(jobs[job_name]["interval"]),
        "status": status,
        "error": error_message,
    }
    _save_state(state)
    return state["jobs"][job_name]


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
