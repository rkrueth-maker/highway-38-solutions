from modules.base import BaseModule
from shopify.competitive_intelligence import run as competitive_intelligence_run


class CompetitiveIntelligenceModule(BaseModule):
    key = "10"
    name = "Competitive Intelligence"
    description = "Analyze price gaps, search trends, keyword gaps, margins, and product opportunities."

    def run(self):
        competitive_intelligence_run()
