"""Lightweight Shopify OAuth helper for fetching a fresh Admin API token.

Usage:
  export SHOPIFY_CLIENT_ID='...'
  export SHOPIFY_CLIENT_SECRET='...'
  export SHOPIFY_STORE='forgeiqsupply.myshopify.com'
  export SHOPIFY_REDIRECT_URI='https://<your-codespace>-5000.app.github.dev/callback'
  python shopify_oauth_helper.py
"""

import json
import os
from urllib.parse import urlencode

import requests
from flask import Flask, redirect, request


def _required_env(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def create_app():
    app = Flask(__name__)

    client_id = _required_env("SHOPIFY_CLIENT_ID")
    client_secret = _required_env("SHOPIFY_CLIENT_SECRET")
    store = _required_env("SHOPIFY_STORE")
    redirect_uri = _required_env("SHOPIFY_REDIRECT_URI")
    scopes = os.getenv(
        "SHOPIFY_SCOPES",
        "read_products,write_products,read_inventory,write_inventory,read_content,write_content",
    ).strip()

    @app.get("/")
    def install():
        query = urlencode(
            {
                "client_id": client_id,
                "scope": scopes,
                "redirect_uri": redirect_uri,
                "state": "forgeiq_oauth",
            }
        )
        return redirect(f"https://{store}/admin/oauth/authorize?{query}")

    @app.get("/callback")
    def callback():
        code = (request.args.get("code") or "").strip()
        if not code:
            return "Missing OAuth code in callback URL", 400

        response = requests.post(
            f"https://{store}/admin/oauth/access_token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
            },
            timeout=30,
        )

        if response.status_code >= 400:
            return (
                f"Token exchange failed ({response.status_code}): {response.text}",
                500,
            )

        payload = response.json()
        token = payload.get("access_token", "")
        scope = payload.get("scope", "")

        pretty = json.dumps(payload, indent=2)
        return (
            "<h2>Shopify OAuth token exchange complete</h2>"
            f"<p><strong>Access token:</strong> {token}</p>"
            f"<p><strong>Granted scopes:</strong> {scope}</p>"
            "<p>Copy the token into .env as SHOPIFY_ADMIN_TOKEN.</p>"
            f"<pre>{pretty}</pre>"
        )

    return app


if __name__ == "__main__":
    web = create_app()
    web.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
