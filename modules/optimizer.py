from modules.base import BaseModule
from shopify.product_optimizer import run as optimizer_run


class OptimizerModule(BaseModule):
    key = "3"
    name = "Optimize Product SEO"
    description = "Optimize product SEO fields and metadata."

    def run(self):
        optimizer_run()
