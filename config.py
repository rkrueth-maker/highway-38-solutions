import requests

from settings import settings


def get_shopify_store():
    return settings.get("SHOPIFY_STORE", "")


def get_shopify_admin_token():
    return settings.get("SHOPIFY_ADMIN_TOKEN", "")


def get_shopify_api_version():
    return settings.get("SHOPIFY_API_VERSION", "2026-04")


def get_graphql_url():
    store = get_shopify_store()
    return f"https://{store}/admin/api/{get_shopify_api_version()}/graphql.json"


def get_rest_base_url():
    store = get_shopify_store()
    return f"https://{store}/admin/api/{get_shopify_api_version()}"


def get_headers():
    return {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": get_shopify_admin_token(),
    }


def ensure_shopify_credentials():
    settings.require_shopify_credentials()


def graphql(query, variables=None):
    ensure_shopify_credentials()
    response = requests.post(
        get_graphql_url(),
        headers=get_headers(),
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


def validate_connection():
    data = graphql("query { shop { name } }")
    shop_name = data.get("shop", {}).get("name")
    if not shop_name:
        raise RuntimeError(
            "Unable to verify Shopify store connection. Check SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN values."
        )
    return shop_name


def validate_shopify_credentials():
    ensure_shopify_credentials()
    return validate_connection()


def parse_gid(gid_value):
    if not isinstance(gid_value, str):
        return gid_value
    return gid_value.split("/")[-1]
