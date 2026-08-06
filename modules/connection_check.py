from modules.base import BaseModule
from shopify.connection_check import run as connection_check_run


class ConnectionCheckModule(BaseModule):
    key = "11"
    name = "Shopify Connection Check"
    description = "Validate app install, token access, and required Shopify scopes."

    def run(self):
        connection_check_run()