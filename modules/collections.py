from modules.base import BaseModule
from shopify.collections import run as collections_run


class CollectionsModule(BaseModule):
    key = "4"
    name = "Create Shopify Collections"
    description = "Create or update Shopify custom collections and assign products."

    def run(self):
        collections_run()
