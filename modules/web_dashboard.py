from modules.base import BaseModule
from shopify.web_dashboard import run as dashboard_run


class WebDashboardModule(BaseModule):
    key = "9"
    name = "Web Dashboard"
    description = "Launch browser dashboard for store health, queue approvals, and orchestrator recommendations."

    def run(self):
        dashboard_run()
