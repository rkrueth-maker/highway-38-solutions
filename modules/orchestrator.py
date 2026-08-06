from modules.base import BaseModule
from shopify.orchestrator import run as orchestrator_run


class OrchestratorModule(BaseModule):
    key = "8"
    name = "AI Orchestrator"
    description = "Prioritize recommendations, plan actions, and track completed work."

    def run(self):
        orchestrator_run()
