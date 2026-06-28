import os

from flask import Flask, redirect, render_template_string, request, url_for

from shopify.analytics_dashboard import build_dashboard_data
from shopify.orchestrator import _load_state as load_orchestrator_state
from shopify.orchestrator import prioritize_recommendations
from shopify.orchestrator import run as orchestrator_run
from shopify.product_optimizer import analyze_products, apply_recommendations, fetch_products

APPROVAL_STATE_FILE = os.path.join("reports", "forgeiq_web_approvals.json")

TEMPLATE = """
<!doctype html>
<html>
<head>
  <title>ForgeIQ Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #f7f9fb; color: #1f2937; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .card { background: white; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
    th { background: #e5e7eb; }
    .actions form { display: inline; }
    .btn { padding: 4px 8px; margin-right: 4px; }
  </style>
</head>
<body>
  <h1>ForgeIQ Web Dashboard</h1>

  <h2>Store Health Overview</h2>
  <div class="grid">
    <div class="card"><strong>Health Score</strong><br>{{ dashboard.health.store_health_score }}</div>
    <div class="card"><strong>Products</strong><br>{{ dashboard.shopify.product_count }}</div>
    <div class="card"><strong>Avg SEO Score</strong><br>{{ dashboard.shopify.average_seo_score }}</div>
    <div class="card"><strong>Search CTR</strong><br>{{ dashboard.search_console.ctr }}</div>
  </div>

  <h2>Analytics Visualizations (summary tiles)</h2>
  <div class="grid">
    <div class="card"><strong>GA Sessions</strong><br>{{ dashboard.google_analytics.sessions }}</div>
    <div class="card"><strong>GA Users</strong><br>{{ dashboard.google_analytics.users }}</div>
    <div class="card"><strong>GSC Clicks</strong><br>{{ dashboard.search_console.clicks }}</div>
    <div class="card"><strong>Orders (last 50)</strong><br>{{ dashboard.shopify_native.orders_last_50 }}</div>
  </div>

  <h2>Product Intelligence Queue</h2>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Priority</th>
        <th>Confidence</th>
        <th>Needs Update</th>
        <th>Approval Workflow</th>
      </tr>
    </thead>
    <tbody>
      {% for rec in queue %}
      <tr>
        <td>{{ rec.current_title }}</td>
        <td>{{ rec.priority }}</td>
        <td>{{ rec.confidence }}</td>
        <td>
          title={{ rec.needs_title }}, description={{ rec.needs_description }}, tags={{ rec.needs_tags }}, alt={{ rec.alt_recommendations|length }}
        </td>
        <td class="actions">
          <form method="post" action="{{ url_for('approve', product_id=rec.product_id) }}">
            <button class="btn" type="submit">Approve</button>
          </form>
          <form method="post" action="{{ url_for('reject', product_id=rec.product_id) }}">
            <button class="btn" type="submit">Reject</button>
          </form>
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <h2>Orchestrator Recommendations</h2>
  <ul>
    {% for run in orchestrator_runs %}
      <li>{{ run.timestamp }} - {{ run.planned_actions|length }} planned actions</li>
    {% endfor %}
  </ul>

  <h2>Workflow Actions</h2>
  <form method="post" action="{{ url_for('apply_approved') }}">
    <button type="submit">Apply Approved Recommendations</button>
  </form>
  <form method="post" action="{{ url_for('refresh_orchestrator') }}">
    <button type="submit">Refresh Orchestrator Summary</button>
  </form>
</body>
</html>
"""


def _load_approvals():
    if not os.path.exists(APPROVAL_STATE_FILE):
        return {"approved": [], "rejected": []}
    import json

    with open(APPROVAL_STATE_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_approvals(data):
    os.makedirs("reports", exist_ok=True)
    import json

    with open(APPROVAL_STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def _build_queue():
    products = fetch_products()
    _rows, recommendations = analyze_products(products)
    return prioritize_recommendations(recommendations, limit=25)


def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        dashboard = build_dashboard_data()
        queue = _build_queue()
        orchestrator_state = load_orchestrator_state()
        runs = list(reversed(orchestrator_state.get("runs", [])))[:10]
        return render_template_string(TEMPLATE, dashboard=dashboard, queue=queue, orchestrator_runs=runs)

    @app.post("/approve/<path:product_id>")
    def approve(product_id):
        state = _load_approvals()
        if product_id not in state["approved"]:
            state["approved"].append(product_id)
        state["rejected"] = [pid for pid in state["rejected"] if pid != product_id]
        _save_approvals(state)
        return redirect(url_for("index"))

    @app.post("/reject/<path:product_id>")
    def reject(product_id):
        state = _load_approvals()
        if product_id not in state["rejected"]:
            state["rejected"].append(product_id)
        state["approved"] = [pid for pid in state["approved"] if pid != product_id]
        _save_approvals(state)
        return redirect(url_for("index"))

    @app.post("/apply-approved")
    def apply_approved():
        queue = _build_queue()
        state = _load_approvals()
        selected = [rec for rec in queue if rec.get("product_id") in set(state.get("approved", []))]
        if selected:
            apply_recommendations(selected)
        return redirect(url_for("index"))

    @app.post("/refresh-orchestrator")
    def refresh_orchestrator():
        orchestrator_run()
        return redirect(url_for("index"))

    return app


def run(host="127.0.0.1", port=5050):
    app = create_app()
    print(f"Starting ForgeIQ web dashboard at http://{host}:{port}")
    app.run(host=host, port=port, debug=False)


if __name__ == "__main__":
    run()
