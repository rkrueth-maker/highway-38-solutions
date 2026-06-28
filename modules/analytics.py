from modules.base import BaseModule
from shopify.analytics_dashboard import run as analytics_run
from shopify.web_dashboard import run as web_dashboard_run


class AnalyticsDashboardModule(BaseModule):
    key = "7"
    name = "Unified Analytics"
    description = "Generate analytics reports or launch web dashboard (native connectors with CSV fallback)."

    def run(self):
        print("\nAnalytics actions:")
        print("1. Generate unified analytics report")
        print("2. Launch web dashboard (starts local Flask server)")

        try:
            choice = (input("Choose action [1]: ").strip() or "1")
        except EOFError:
            choice = "1"

        if choice == "2":
            web_dashboard_run()
            return

        analytics_run()
