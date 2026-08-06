from shopify.client import client


REQUIRED_SCOPES = (
    "read_products",
    "write_products",
    "read_inventory",
    "write_inventory",
    "read_content",
    "write_content",
)


def _fetch_granted_scopes():
    query = """
    query getGrantedScopes {
      currentAppInstallation {
        accessScopes {
          handle
        }
      }
    }
    """
    data = client.graphql(query)
    installation = data.get("currentAppInstallation") or {}
    access_scopes = installation.get("accessScopes") or []
    return sorted({scope.get("handle", "").strip() for scope in access_scopes if scope.get("handle")})


def run():
    print("")
    print("Highway 38 Supply Co. Shopify Connection Check")
    print("----------------------------------------------")

    try:
        shop_name = client.validate_connection()
        granted_scopes = _fetch_granted_scopes()
    except RuntimeError as exc:
        message = str(exc)
        print("Status: FAILED")

        if "Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN" in message:
            print("Reason: Missing credentials in .env.")
            print("Action: Set SHOPIFY_STORE and a new SHOPIFY_ADMIN_TOKEN, then re-run.")
        elif "HTTP 401" in message:
            print("Reason: Token is invalid or was revoked (common after uninstall).")
            print("Action: Reinstall the Highway 38 Supply Co. app in Shopify Admin and generate a new Admin API token.")
        elif "HTTP 403" in message:
            print("Reason: App is installed but lacks permission for this API call.")
            print("Action: Update app scopes in Shopify Admin, reinstall app, and refresh token.")
        else:
            print(f"Reason: {message}")
        print("")
        return {"status": "failed", "reason": message}

    missing_scopes = [scope for scope in REQUIRED_SCOPES if scope not in granted_scopes]

    print("Status: CONNECTED")
    print(f"Store: {shop_name}")
    if granted_scopes:
        print(f"Granted scopes: {', '.join(granted_scopes)}")
    else:
        print("Granted scopes: none returned")

    if missing_scopes:
        print(f"Missing scopes: {', '.join(missing_scopes)}")
        print("Action: Add missing scopes in app settings, then reinstall/regenerate token.")
        status = "warning"
    else:
        print("Missing scopes: none")
        status = "ok"

    print("")
    return {
        "status": status,
        "store": shop_name,
        "granted_scopes": granted_scopes,
        "missing_scopes": missing_scopes,
    }