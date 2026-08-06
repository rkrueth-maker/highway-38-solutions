from modules.base import BaseModule
from shopify.seo_auditor import run as seo_run


class SeoAuditModule(BaseModule):
    key = "1"
    name = "SEO Audit"
    description = "Audit Shopify products for SEO health and export a CSV report."

    def run(self):
        seo_run()
