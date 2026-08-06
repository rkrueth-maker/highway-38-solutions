from modules.base import BaseModule
from shopify.alt_text_updater import run as alt_text_run


class AltTextModule(BaseModule):
    key = "2"
    name = "Update Image Alt Text"
    description = "Preview and apply missing Shopify image alt text values."

    def run(self):
        alt_text_run(dry_run=True)
