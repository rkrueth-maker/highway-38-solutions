from modules.base import BaseModule
from shopify.blog_generator import run as blog_run


class BlogModule(BaseModule):
    key = "5"
    name = "Generate Blog Post"
    description = "Generate a blog post draft from Shopify product content."

    def run(self):
        blog_run()
