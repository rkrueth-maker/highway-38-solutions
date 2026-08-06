import logging
import requests

from config import get_graphql_url, get_headers, get_rest_base_url, ensure_shopify_credentials, parse_gid
from logger import get_logger

logger = get_logger()


class ShopifyClient:
    def __init__(self):
        pass

    def graphql(self, query, variables=None):
        ensure_shopify_credentials()
        url = get_graphql_url()
        headers = get_headers()
        logger.debug("Shopify GraphQL request to %s", url)
        response = requests.post(
            url,
            headers=headers,
            json={"query": query, "variables": variables or {}},
            timeout=30,
        )

        if response.status_code >= 400:
            response_body = response.text
            try:
                parsed = response.json()
                response_body = parsed.get("errors") or parsed.get("error") or parsed
            except ValueError:
                pass

            if response.status_code == 401:
                raise RuntimeError(
                    "Shopify Admin API returned HTTP 401. Token invalid or not for this store. "
                    f"Response body: {response_body}"
                )

            raise RuntimeError(f"HTTP {response.status_code}: {response_body}")

        try:
            data = response.json()
        except ValueError:
            raise RuntimeError(f"Invalid JSON response from Shopify: {response.text}")

        if "errors" in data:
            raise RuntimeError(f"GraphQL errors: {data['errors']}")

        return data["data"]

    def validate_connection(self):
        data = self.graphql("query { shop { name } }")
        shop_name = data.get("shop", {}).get("name")
        if not shop_name:
            raise RuntimeError(
                "Unable to verify Shopify store connection. Check SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN values."
            )
        return shop_name

    def put_image_alt_text(self, product_id, image_id, alt_text):
        rest_product_id = parse_gid(product_id)
        rest_image_id = parse_gid(image_id)
        url = f"{get_rest_base_url()}/products/{rest_product_id}/images/{rest_image_id}.json"
        payload = {"image": {"id": rest_image_id, "alt": alt_text}}
        headers = get_headers()
        logger.debug("Shopify REST PUT request to %s", url)
        response = requests.put(url, headers=headers, json=payload, timeout=30)
        if response.status_code >= 400:
            raise RuntimeError(f"Image update failed HTTP {response.status_code}: {response.text}")
        data = response.json()
        updated = data.get("image")
        if not updated:
            raise RuntimeError(f"Image update failed, unexpected response: {response.text}")
        return updated

    def put_product_tags(self, product_id, tags):
        rest_product_id = parse_gid(product_id)
        url = f"{get_rest_base_url()}/products/{rest_product_id}.json"
        payload = {"product": {"id": int(rest_product_id), "tags": ", ".join(tags)}}
        headers = get_headers()
        logger.debug("Shopify REST PUT request to %s", url)
        response = requests.put(url, headers=headers, json=payload, timeout=30)
        if response.status_code >= 400:
            raise RuntimeError(f"Product tag update failed HTTP {response.status_code}: {response.text}")
        data = response.json()
        updated = data.get("product")
        if not updated:
            raise RuntimeError(f"Product tag update failed, unexpected response: {response.text}")
        return updated


client = ShopifyClient()
