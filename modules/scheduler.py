from modules.base import BaseModule
from shopify.scheduler import run as scheduler_run


class SchedulerModule(BaseModule):
    key = "10"
    name = "Automation Scheduler"
    description = "Run due daily/weekly automation jobs for SEO, content, analytics, and orchestration."

    def run(self):
        scheduler_run(run_all=False)
