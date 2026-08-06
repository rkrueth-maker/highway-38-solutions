import os
from pathlib import Path

from dotenv import load_dotenv


class SettingsManager:
    def __init__(self, env_file=None):
        self.env_file = Path(env_file or ".env")
        self._settings = {}
        self.load()

    def _coerce_value(self, key, value):
        if key == "DRY_RUN_DEFAULT":
            if isinstance(value, bool):
                return value
            return str(value).strip().lower() in {"1", "true", "yes", "on"}
        return str(value)

    def load(self):
        if self.env_file.exists():
            load_dotenv(self.env_file, override=False)

        self._settings = {
            "SHOPIFY_STORE": os.getenv("SHOPIFY_STORE", "").strip(),
            "SHOPIFY_ADMIN_TOKEN": os.getenv("SHOPIFY_ADMIN_TOKEN", "").strip(),
            "SHOPIFY_API_VERSION": os.getenv("SHOPIFY_API_VERSION", "2026-04").strip(),
            "DRY_RUN_DEFAULT": os.getenv("DRY_RUN_DEFAULT", "true").strip().lower() in {"1", "true", "yes", "on"},
            "CONTENT_BRAND_NAME": os.getenv("CONTENT_BRAND_NAME", "Highway 38 Supply Co.").strip(),
            "CONTENT_TONE_DEFAULT": os.getenv("CONTENT_TONE_DEFAULT", "balanced").strip(),
            "GA_EXPORT_CSV": os.getenv("GA_EXPORT_CSV", "").strip(),
            "GSC_EXPORT_CSV": os.getenv("GSC_EXPORT_CSV", "").strip(),
            "BULK_APPROVAL_PRESET": os.getenv("BULK_APPROVAL_PRESET", "manual").strip(),
            "GA4_PROPERTY_ID": os.getenv("GA4_PROPERTY_ID", "").strip(),
            "GA4_BEARER_TOKEN": os.getenv("GA4_BEARER_TOKEN", "").strip(),
            "GSC_SITE_URL": os.getenv("GSC_SITE_URL", "").strip(),
            "GSC_BEARER_TOKEN": os.getenv("GSC_BEARER_TOKEN", "").strip(),
            "SCHEDULE_SEO_AUDIT_CRON": os.getenv("SCHEDULE_SEO_AUDIT_CRON", "daily").strip(),
            "SCHEDULE_CONTENT_CRON": os.getenv("SCHEDULE_CONTENT_CRON", "weekly").strip(),
            "SCHEDULE_ANALYTICS_CRON": os.getenv("SCHEDULE_ANALYTICS_CRON", "daily").strip(),
            "SCHEDULE_ORCHESTRATOR_CRON": os.getenv("SCHEDULE_ORCHESTRATOR_CRON", "daily").strip(),
            "SCHEDULE_MORNING_AUTOMATION_CRON": os.getenv("SCHEDULE_MORNING_AUTOMATION_CRON", "daily").strip(),
            "SCHEDULE_EVENING_AUTOMATION_CRON": os.getenv("SCHEDULE_EVENING_AUTOMATION_CRON", "daily").strip(),
            "SCHEDULE_COMPETITIVE_INTEL_CRON": os.getenv("SCHEDULE_COMPETITIVE_INTEL_CRON", "daily").strip(),
            "COMPETITOR_PRICE_CSV": os.getenv("COMPETITOR_PRICE_CSV", "").strip(),
            "SEARCH_VOLUME_CSV": os.getenv("SEARCH_VOLUME_CSV", "").strip(),
            "KEYWORD_GAP_CSV": os.getenv("KEYWORD_GAP_CSV", "").strip(),
            "MARGIN_ANALYSIS_CSV": os.getenv("MARGIN_ANALYSIS_CSV", "").strip(),
        }

    def get(self, key, default=None):
        return self._settings.get(key, default)

    def set(self, key, value):
        self._settings[key] = self._coerce_value(key, value)
        os.environ[key] = str(self._settings[key])
        self.save()
        return self._settings[key]

    def save(self):
        lines = []
        for key, value in self._settings.items():
            if isinstance(value, bool):
                value = "true" if value else "false"
            lines.append(f"{key}={value}")

        self.env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def require_shopify_credentials(self):
        if not self.get("SHOPIFY_STORE") or not self.get("SHOPIFY_ADMIN_TOKEN"):
            raise RuntimeError(
                "Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN in .env. "
                "Create a .env file with your Shopify settings."
            )


settings = SettingsManager()
