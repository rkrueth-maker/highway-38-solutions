from modules.base import BaseModule
from shopify.web_dashboard_secure import run as dashboard_run


class WebDashboardModule(BaseModule):
    key = "9"
    name = "Web Dashboard"
    description = "Launch secured browser dashboard for store health, queue approvals, and orchestrator recommendations."

    def run(self):
        dashboard_run()
