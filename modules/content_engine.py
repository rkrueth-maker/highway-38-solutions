from modules.base import BaseModule
from shopify.content_engine import run as content_engine_run


class ContentEngineModule(BaseModule):
    key = "6"
    name = "Content Engine"
    description = "Generate blog, Pinterest, Facebook, and email content drafts."

    def run(self):
        content_engine_run()
