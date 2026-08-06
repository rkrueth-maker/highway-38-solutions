"""Security and UX hardening wrapper for the Shopify web dashboard.

This module wraps the existing large dashboard app without rewriting its full template.
It adds:
- CSRF token creation and validation for POST requests.
- Automatic hidden CSRF input injection into dashboard POST forms.
- Confirmation prompts on destructive/write actions, especially Shopify apply.
- Visible focus states.
- Mobile table wrappers so dense tables scroll instead of breaking the viewport.
- Live-mode warning while disabling auto-refresh in hardened mode.
"""

from __future__ import annotations

import re
import secrets
from typing import Iterable

from flask import abort, request, session

from shopify.web_dashboard import create_app as _create_dashboard_app

CSRF_SESSION_KEY = "dashboard_csrf_token"
CSRF_FIELD_NAME = "csrf_token"


def _ensure_csrf_token() -> str:
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def _posted_token_values() -> Iterable[str]:
    form_token = request.form.get(CSRF_FIELD_NAME)
    if form_token:
        yield form_token
    header_token = request.headers.get("X-CSRF-Token")
    if header_token:
        yield header_token


def _validate_csrf() -> None:
    expected = session.get(CSRF_SESSION_KEY)
    if not expected:
        abort(400, "Missing CSRF session token")
    if expected not in set(_posted_token_values()):
        abort(400, "Invalid CSRF token")


def _remove_meta_refresh(html: str) -> str:
    return re.sub(
        r"\s*<meta\s+http-equiv=[\"']refresh[\"']\s+content=[\"'][^\"']+[\"']\s*/?>",
        "",
        html,
        flags=re.IGNORECASE,
    )


def _inject_dashboard_hardening(html: str, token: str) -> str:
    if "</body>" not in html:
        return html

    html = _remove_meta_refresh(html)

    style = """
<style id="dashboard-hardening-styles">
  .skip-dashboard-link{position:absolute;left:-999px;top:0;background:#fff;color:#0f172a;padding:.75rem 1rem;z-index:9999;border-radius:0 0 .5rem 0}.skip-dashboard-link:focus{left:0}
  a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,.btn:focus-visible{outline:3px solid #fbbf24!important;outline-offset:3px!important;border-radius:10px!important}
  .dashboard-safety-note{border:1px solid rgba(251,191,36,.45);background:rgba(251,191,36,.12);border-radius:14px;padding:12px 14px;margin:12px 0;color:#fef3c7}
  .table-scroll{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:12px}
  .table-scroll table{min-width:760px}
  @media(max-width:720px){.table-scroll{border:1px solid rgba(255,255,255,.12)}.table-scroll table{font-size:.9rem}.btn{width:auto;max-width:100%}}
</style>
"""

    script = f"""
<script id="dashboard-hardening-script">
  (function() {{
    const token = {token!r};
    document.querySelectorAll('form[method="post"], form[method="POST"]').forEach((form) => {{
      if (!form.querySelector('input[name="{CSRF_FIELD_NAME}"]')) {{
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = '{CSRF_FIELD_NAME}';
        input.value = token;
        form.appendChild(input);
      }}
    }});

    document.querySelectorAll('form').forEach((form) => {{
      const action = form.getAttribute('action') || '';
      const buttonText = (form.textContent || '').toLowerCase();
      const writesToShopify = action.includes('/apply-approved') || buttonText.includes('apply approved to shopify') || buttonText.includes('apply review');
      const isDestructive = action.includes('/reject/') || action.includes('/discard-review') || buttonText.includes('reject') || buttonText.includes('discard');
      if (writesToShopify) {{
        form.dataset.confirm = 'This writes changes to Shopify or applies a staged review. Continue only after reviewing staged changes.';
      }} else if (isDestructive) {{
        form.dataset.confirm = 'This will reject or discard staged work. Continue?';
      }}
      form.addEventListener('submit', (event) => {{
        const message = form.dataset.confirm;
        if (message && !window.confirm(message)) {{
          event.preventDefault();
        }}
      }});
    }});

    document.querySelectorAll('table').forEach((table) => {{
      if (table.closest('.table-scroll')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }});

    const shell = document.querySelector('.shell');
    if (shell && !document.querySelector('.skip-dashboard-link')) {{
      const skip = document.createElement('a');
      skip.className = 'skip-dashboard-link';
      skip.href = '#dashboard-main';
      skip.textContent = 'Skip to dashboard content';
      document.body.insertBefore(skip, document.body.firstChild);
      shell.id = 'dashboard-main';
      shell.setAttribute('role', 'main');
    }}

    const liveBadge = Array.from(document.querySelectorAll('.badge')).find((badge) => (badge.textContent || '').toLowerCase().includes('live refresh on'));
    if (liveBadge && !document.querySelector('.dashboard-safety-note')) {{
      const note = document.createElement('div');
      note.className = 'dashboard-safety-note';
      note.innerHTML = '<strong>Live refresh requested.</strong> Hardened mode disables automatic meta refresh so it does not interrupt reading, forms, or assistive technology. Use Refresh Dashboard when ready.';
      const firstPanel = document.querySelector('.panel');
      if (firstPanel) firstPanel.parentNode.insertBefore(note, firstPanel);
    }}
  }})();
</script>
"""

    if "dashboard-hardening-styles" not in html:
        html = html.replace("</head>", style + "\n</head>")
    if "dashboard-hardening-script" not in html:
        html = html.replace("</body>", script + "\n</body>")
    return html


def create_app():
    app = _create_dashboard_app()
    app.secret_key = app.secret_key or "forgeiq-dashboard-local-dev-change-me"

    @app.before_request
    def _csrf_before_request():
        _ensure_csrf_token()
        if request.method == "POST":
            _validate_csrf()

    @app.after_request
    def _dashboard_hardening_after_request(response):
        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type.lower():
            return response
        body = response.get_data(as_text=True)
        token = _ensure_csrf_token()
        body = _inject_dashboard_hardening(body, token)
        response.set_data(body)
        response.headers["content-length"] = str(len(response.get_data()))
        return response

    return app


def run(host="127.0.0.1", port=5050, open_browser=True):
    app = create_app()
    browser_host = "127.0.0.1" if host in {"0.0.0.0", "::"} else host
    url = f"http://{browser_host}:{port}"
    health_url = f"{url}/health"

    import socket
    import threading
    import webbrowser

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        if sock.connect_ex((browser_host, port)) == 0:
            raise RuntimeError(
                f"Port {port} is already in use on {browser_host}. "
                f"Stop the existing process or run on a different port."
            )

    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    print(f"Starting secured ForgeIQ web dashboard at {url}")
    print(f"Health check endpoint: {health_url}")
    print(f"Local check: curl -s {health_url}")
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    run()
