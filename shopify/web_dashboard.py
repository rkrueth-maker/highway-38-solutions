import json
import html
import os
import re
import threading
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, redirect, render_template_string, request, send_from_directory, url_for

from logger import LOG_DIR
from settings import settings
from shopify.approval_state import load_approvals as _load_approvals
from shopify.approval_state import save_approvals as _save_approvals
from shopify.approval_state import stage_approved_product_ids
from shopify.analytics_dashboard import build_dashboard_data, gather_shopify_analytics_native
from shopify.competitive_intelligence import build_competitive_intelligence_data
from shopify.content_engine import REPORT_FILE as CONTENT_REPORT_FILE
from shopify.content_engine import generate_blog_post
from shopify.content_engine import generate_preview
from shopify.client import client
from shopify.orchestrator import _load_state as load_orchestrator_state
from shopify.orchestrator import analyze_trends
from shopify.orchestrator import detect_inventory_recommendations
from shopify.orchestrator import detect_product_opportunities
from shopify.orchestrator import forecast_performance
from shopify.orchestrator import plan_actions
from shopify.orchestrator import plan_marketing_campaigns
from shopify.orchestrator import prioritize_recommendations as rank_recommendations
from shopify.orchestrator import run as orchestrator_run
from shopify.product_optimizer import analyze_products, apply_recommendations, fetch_products
from shopify.scheduler import _load_state as load_scheduler_state
from shopify.scheduler import get_job_definitions

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = str(PROJECT_ROOT / "reports")
LOGS_DIR = str((PROJECT_ROOT / LOG_DIR).resolve()) if not os.path.isabs(LOG_DIR) else LOG_DIR
AGENT_HISTORY_FILE = os.path.join(REPORTS_DIR, "forgeiq_agent_history.json")
AGENT_REPORT_FILE = os.path.join(REPORTS_DIR, "forgeiq_agent_response.md")
AGENT_REVIEW_FILE = os.path.join(REPORTS_DIR, "forgeiq_agent_review.json")


TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  {% if live_refresh %}
  <meta http-equiv="refresh" content="45" />
  {% endif %}
  <title>ForgeIQ Control Center</title>
  <style>
    :root {
      --bg: #071a25;
      --panel: #0f2433;
      --panel-soft: #163346;
      --border: rgba(255, 255, 255, 0.12);
      --text: #ebf6ff;
      --muted: #b9d0de;
      --accent: #22d3ee;
      --safe: #34d399;
      --warn: #fbbf24;
      --danger: #fb7185;
      --write: #ff7a59;
      --shadow: 0 16px 44px rgba(0, 0, 0, 0.3);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Space Grotesk", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(34, 211, 238, 0.14), transparent 34%),
        radial-gradient(circle at top right, rgba(255, 122, 89, 0.14), transparent 28%),
        linear-gradient(180deg, #07131d 0%, #0a1a27 100%);
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell { max-width: 1420px; margin: 0 auto; padding: 20px; }
    .panel {
      margin-top: 14px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(15, 36, 51, 0.98), rgba(10, 25, 37, 0.98));
      box-shadow: var(--shadow);
      padding: 16px;
    }
    .panel h2 { margin: 0 0 8px; font-size: 1.25rem; }
    .muted { color: var(--muted); }
    .badge {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 0.82rem;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.8rem;
      border: 1px solid var(--border);
    }
    .tag.success { color: var(--safe); }
    .tag.warn { color: var(--warn); }
    .tag.danger { color: var(--danger); }
    .btn {
      appearance: none;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px 12px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.05);
      font-weight: 600;
      cursor: pointer;
      margin-right: 6px;
      margin-bottom: 8px;
    }
    .btn:hover { border-color: rgba(34, 211, 238, 0.46); text-decoration: none; }
    .btn.good { background: rgba(52, 211, 153, 0.16); color: #b7f7dc; }
    .btn.danger { background: rgba(251, 113, 133, 0.18); color: #ffd1d9; }
    .btn-write {
      border: 1px solid rgba(255, 122, 89, 0.6);
      background: linear-gradient(90deg, rgba(255, 122, 89, 0.88), rgba(251, 146, 60, 0.9));
      color: #120c07;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .btn-write[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
      filter: grayscale(0.24);
    }
    .banner {
      margin: 14px 0;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--border);
    }
    .banner.success { border-color: rgba(52, 211, 153, 0.45); background: rgba(52, 211, 153, 0.14); }
    .banner.warn { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.14); }
    .banner h3 { margin: 0 0 6px; }
    .banner p { margin: 0; }
    .preserve-scroll { display: inline; }
    .top-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
    .stat {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 11px;
      background: rgba(255, 255, 255, 0.03);
    }
    .stat .k { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.07em; }
    .stat .v { margin-top: 6px; font-size: 1.15rem; font-weight: 700; }
    .list { margin: 0; padding-left: 18px; }
    .list li { margin-bottom: 8px; }
    .check-ok { color: var(--safe); }
    .check-miss { color: var(--warn); }
    .apply-card {
      position: sticky;
      top: 8px;
      z-index: 3;
      border: 1px solid rgba(255, 122, 89, 0.58);
      background: linear-gradient(180deg, rgba(95, 34, 25, 0.45), rgba(17, 40, 57, 0.96));
    }
    .apply-count {
      display: inline-block;
      font-size: 1.9rem;
      font-weight: 800;
      margin: 4px 0 10px;
      color: #ffd6c8;
    }
    .two-col { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; }
    .chart-row { display: grid; grid-template-columns: 150px 1fr 74px; gap: 10px; align-items: center; margin: 9px 0; }
    .bar-track {
      height: 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }
    .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #38bdf8); }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      text-align: left;
      padding: 10px 8px;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 0.82rem; letter-spacing: 0.06em; text-transform: uppercase; }
    .file-list { display: grid; gap: 8px; }
    .file-item {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.03);
    }
    pre {
      margin: 0;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.25);
      padding: 11px;
      white-space: pre-wrap;
      color: #dbeafe;
      font-size: 0.9rem;
      line-height: 1.45;
    }
    @media (max-width: 1160px) {
      .top-grid, .two-col { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .apply-card { position: static; }
      .chart-row { grid-template-columns: 1fr; }
    }
    @media (max-width: 720px) {
      .stats-grid { grid-template-columns: 1fr; }
      .shell { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    {% if apply_feedback %}
    <div class="banner {{ apply_feedback.banner_class }}">
      <h3>{{ apply_feedback.title }}</h3>
      <p>{{ apply_feedback.message }}</p>
    </div>
    {% endif %}

    {% set staged_count = approvals.approved|length %}
    {% set rejected_count = approvals.rejected|length %}
    {% set connected_ok = shopify_connection.connected_label == 'Connected' %}
    {% set product_count_ok = dashboard.shopify.product_count > 0 %}
    {% set write_ok = shopify_connection.write_permissions_label == 'Available' %}
    {% set pending_review_ok = pending_agent_review is not none %}
    {% set ready_to_apply = staged_count > 0 and connected_ok and write_ok %}

    <div class="panel">
      <h2>Launch Control</h2>
      <p class="muted">Connection, safety checks, staged approvals, and apply readiness in one view.</p>
      <div>
        <span class="badge">{% if connected_ok %}Connected{% else %}Not connected{% endif %}</span>
        <span class="badge">{% if connected_ok %}Safe to stage{% else %}Needs attention{% endif %}</span>
        <span class="badge">{% if ready_to_apply %}Ready to apply{% else %}Needs attention{% endif %}</span>
        <span class="badge">{% if pending_review_ok %}Needs attention{% else %}Safe to stage{% endif %}</span>
        <span class="badge">{% if live_refresh %}Live refresh on{% else %}Live refresh off{% endif %}</span>
      </div>
      <div class="stats-grid">
        <div class="stat"><div class="k">Shopify Connection</div><div class="v">{{ shopify_connection.connected_label }}</div></div>
        <div class="stat"><div class="k">Product Count</div><div class="v">{{ dashboard.shopify.product_count }}</div></div>
        <div class="stat"><div class="k">Staged Approvals</div><div class="v">{{ staged_count }}</div></div>
        <div class="stat"><div class="k">Rejected</div><div class="v">{{ rejected_count }}</div></div>
        <div class="stat"><div class="k">Pending Agent Review</div><div class="v">{% if pending_review_ok %}Needs attention{% else %}Safe to stage{% endif %}</div></div>
        <div class="stat"><div class="k">Last Generated</div><div class="v">{{ dashboard.generated_at }}</div></div>
        <div class="stat"><div class="k">Write Permissions</div><div class="v">{{ shopify_connection.write_permissions_label }}</div></div>
        <div class="stat">
          <div class="k">Quick Actions</div>
          <div class="v">
            <a class="btn" href="{{ url_for('index') }}">Refresh Dashboard</a>
            <a class="btn" href="{{ url_for('index') }}?live=1">Live Mode</a>
          </div>
        </div>
      </div>
    </div>

    <div class="top-grid">
      <div class="panel">
        <h2>First-Run Checklist</h2>
        <ul class="list">
          <li class="{% if connected_ok %}check-ok{% else %}check-miss{% endif %}">Shopify connection verified</li>
          <li class="{% if product_count_ok %}check-ok{% else %}check-miss{% endif %}">Product count loaded</li>
          <li class="{% if write_ok %}check-ok{% else %}check-miss{% endif %}">Write permission detected</li>
          <li class="{% if pending_review_ok %}check-ok{% else %}check-miss{% endif %}">Review at least one recommendation</li>
          <li class="{% if staged_count > 0 %}check-ok{% else %}check-miss{% endif %}">Stage one product</li>
          <li class="{% if ready_to_apply %}check-ok{% else %}check-miss{% endif %}">Apply Approved only after review</li>
          <li class="check-miss">Confirm Shopify admin changed correctly</li>
          <li class="check-miss">Run tests locally</li>
        </ul>
      </div>

      <div class="panel apply-card">
        <h2>Apply Staged Changes</h2>
        <p class="muted">This action writes directly to Shopify. Only staged products are applied.</p>
        <div class="apply-count">{{ staged_count }}</div>
        <div class="muted">Staged products: {{ staged_count }}</div>
        <div style="margin-top: 10px;">
          <form class="preserve-scroll" method="post" action="{{ url_for('apply_approved') }}">
            <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
            <button class="btn btn-write" type="submit" {% if staged_count == 0 %}disabled{% endif %}>Apply Approved to Shopify</button>
          </form>
        </div>
        {% if staged_count == 0 %}
        <p class="muted">No staged products yet. Stage at least one product to enable apply.</p>
        {% else %}
        <p class="muted">Only staged products are applied.</p>
        {% endif %}
      </div>
    </div>

    <div class="panel">
      <h2>Shopify Connection Status</h2>
      <div class="stats-grid">
        <div class="stat">
          <div class="k">Connection</div>
          <div class="v"><span class="tag {{ shopify_connection.connected_class }}">{{ shopify_connection.connected_label }}</span></div>
          <div class="muted">{{ shopify_connection.message }}</div>
        </div>
        <div class="stat"><div class="k">Store</div><div class="v">{{ shopify_connection.store_name }}</div><div class="muted">Product count: {{ shopify_connection.product_count }}</div></div>
        <div class="stat"><div class="k">Write Permissions</div><div class="v"><span class="tag {{ shopify_connection.write_permissions_class }}">{{ shopify_connection.write_permissions_label }}</span></div><div class="muted">{{ shopify_connection.write_permissions_message }}</div></div>
        <div class="stat"><div class="k">Order Analytics Scope</div><div class="v"><span class="tag {{ shopify_connection.order_scope_class }}">{{ shopify_connection.order_scope_label }}</span></div><div class="muted">{{ shopify_connection.order_scope_message }}</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Products Needing Attention</h2>
      <p class="muted">Stage and reject actions only update the staged queue. They never write to Shopify.</p>
      <div>
        <form class="preserve-scroll" method="post" action="{{ url_for('approve_bulk') }}">
          <input type="hidden" name="count" value="3" />
          <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
          <button class="btn good" type="submit">Stage Top 3</button>
        </form>
        <form class="preserve-scroll" method="post" action="{{ url_for('approve_bulk') }}">
          <input type="hidden" name="count" value="5" />
          <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
          <button class="btn good" type="submit">Stage Top 5</button>
        </form>
        <form class="preserve-scroll" method="post" action="{{ url_for('approve_bulk') }}">
          <input type="hidden" name="count" value="all" />
          <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
          <button class="btn" type="submit">Stage All Visible</button>
        </form>
      </div>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Priority</th>
            <th>Confidence</th>
            <th>Needs Update</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {% for rec in attention_queue %}
          <tr>
            <td>
              <strong>{{ rec.current_title }}</strong><br />
              <span class="muted">{{ rec.current_vendor or 'Store' }}</span>
            </td>
            <td><span class="tag warn">{{ rec.priority }}</span></td>
            <td><span class="tag success">{{ rec.confidence }}</span></td>
            <td>title={{ rec.needs_title }}, description={{ rec.needs_description }}, tags={{ rec.needs_tags }}, alt={{ rec.alt_recommendations|length }}</td>
            <td>
              <form class="preserve-scroll" method="post" action="{{ url_for('approve', product_id=rec.product_id) }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn good" type="submit">Stage</button>
              </form>
              <form class="preserve-scroll" method="post" action="{{ url_for('reject', product_id=rec.product_id) }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn danger" type="submit">Reject</button>
              </form>
            </td>
          </tr>
          {% else %}
          <tr>
            <td colspan="5" class="muted">No products currently need attention.</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>AI Agent</h2>
      <div class="two-col">
        <div>
          <p class="muted">Use plain language prompts for SEO, content, and priority guidance.</p>
          <form method="post" action="{{ url_for('agent') }}">
            <textarea name="prompt" rows="4" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background: rgba(0,0,0,0.2); color: var(--text);" placeholder="Optimize products under SEO score 85."></textarea>
            <div style="margin-top: 10px;">
              <button class="btn" type="submit">Run Agent</button>
            </div>
          </form>
          {% if pending_agent_review %}
          <div class="panel" style="margin-top: 10px;">
            <h3 style="margin:0 0 8px;">Pending Review</h3>
            <p>{{ pending_agent_review.summary }}</p>
            <div class="muted">{{ pending_agent_review.prompt }}</div>
            <div style="margin-top: 10px;">
              <form class="preserve-scroll" method="post" action="{{ url_for('apply_agent_review') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn good" type="submit">Apply Review</button>
              </form>
              <form class="preserve-scroll" method="post" action="{{ url_for('discard_agent_review') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn danger" type="submit">Discard</button>
              </form>
            </div>
          </div>
          {% endif %}
        </div>
        <div>
          <h3 style="margin:0 0 8px;">Recent Agent Runs</h3>
          {% for entry in agent_history[:5] %}
            <div style="margin-bottom: 10px;">
              <strong>{{ entry.prompt }}</strong><br />
              <span class="muted">{{ entry.timestamp }} - {{ entry.intent }} - {{ entry.status }}</span>
              <pre style="margin-top: 6px;">{{ entry.summary }}</pre>
            </div>
          {% else %}
            <div class="muted">No agent commands yet.</div>
          {% endfor %}
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>Analytics Summary</h2>
      <div class="stats-grid">
        <div class="stat"><div class="k">Store Health</div><div class="v">{{ dashboard.health.store_health_score }}</div></div>
        <div class="stat"><div class="k">SEO Average</div><div class="v">{{ dashboard.shopify.average_seo_score }}</div></div>
        <div class="stat"><div class="k">Orders Last 50</div><div class="v">{{ dashboard.shopify_native.orders_last_50 }}</div></div>
        <div class="stat"><div class="k">Estimated Revenue</div><div class="v">{{ dashboard.shopify_native.estimated_revenue_last_50 }} {{ dashboard.shopify_native.currency }}</div></div>
      </div>
      {% for chart in charts %}
      <div class="chart-row">
        <div class="muted">{{ chart.label }}</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ chart.width }}%;"></div></div>
        <div>{{ chart.value }}</div>
      </div>
      {% endfor %}
    </div>

    <div class="panel" id="reports">
      <h2>Reports / Logs / Scheduled Tasks</h2>
      <div class="two-col">
        <div>
          <h3 style="margin:0 0 8px;">Scheduled Tasks</h3>
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Cadence</th>
                <th>Last Run</th>
                <th>Next Run</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {% for job in scheduled_tasks %}
              <tr>
                <td>{{ job.name }}</td>
                <td>{{ job.interval }}</td>
                <td>{{ job.last_run or 'Never' }}</td>
                <td>{{ job.next_run or 'Not scheduled' }}</td>
                <td><span class="tag {{ job.status_class }}">{{ job.status }}</span></td>
              </tr>
              {% else %}
              <tr><td colspan="5" class="muted">No scheduled tasks configured.</td></tr>
              {% endfor %}
            </tbody>
          </table>

          <h3 style="margin:16px 0 8px;">Reports</h3>
          <div class="file-list">
            {% for file in report_files %}
              <div class="file-item">
                <a href="{{ url_for('view_report_document', filename=file.name) }}">{{ file.name }}</a>
                <span>{{ file.modified }} | {{ file.size_kb }} KB</span>
              </div>
            {% else %}
              <div class="muted">No reports found yet.</div>
            {% endfor %}
          </div>
        </div>
        <div id="logs">
          <h3 style="margin:0 0 8px;">Logs</h3>
          <div class="file-list">
            {% for file in log_files %}
              <div class="file-item">
                <a href="{{ url_for('view_log_document', filename=file.name) }}">{{ file.name }}</a>
                <span>{{ file.modified }}</span>
              </div>
            {% else %}
              <div class="muted">No log files found.</div>
            {% endfor %}
          </div>
          <h3 style="margin:16px 0 8px;">Latest Log Tail</h3>
          <pre>{{ latest_log_tail }}</pre>
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>Content Drafts</h2>
      <div>
        <form class="preserve-scroll" method="post" action="{{ url_for('refresh_content') }}">
          <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
          <button class="btn" type="submit">Refresh Dashboard</button>
        </form>
        <form class="preserve-scroll" method="post" action="{{ url_for('refresh_orchestrator') }}">
          <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
          <button class="btn" type="submit">Refresh Orchestrator</button>
        </form>
      </div>
      <div class="two-col">
        <div>
          <h3 style="margin:8px 0;">Blog Drafts</h3>
          {% for draft in blog_drafts %}
            <div class="panel" style="margin-top: 8px;">
              <strong>{{ draft.title }}</strong>
              <pre style="margin-top: 6px;">{{ draft.excerpt }}</pre>
            </div>
          {% else %}
            <p class="muted">No blog drafts found.</p>
          {% endfor %}
        </div>
        <div>
          <h3 style="margin:8px 0;">Pinterest Queue</h3>
          {% for pin in pinterest_queue %}
            <div class="panel" style="margin-top: 8px;">
              <strong>{{ pin.title }}</strong>
              <pre style="margin-top: 6px;">{{ pin.excerpt }}</pre>
            </div>
          {% else %}
            <p class="muted">No Pinterest queue items found.</p>
          {% endfor %}
        </div>
      </div>
    </div>

    <div class="panel">
      <h2>Competitive Intelligence</h2>
      <div class="stats-grid">
        <div class="stat"><div class="k">Price Gaps</div><div class="v">{{ competitive_intelligence.summary.price_gap_count }}</div></div>
        <div class="stat"><div class="k">Trend Signals</div><div class="v">{{ competitive_intelligence.summary.trend_count }}</div></div>
        <div class="stat"><div class="k">Keyword Gaps</div><div class="v">{{ competitive_intelligence.summary.keyword_gap_count }}</div></div>
        <div class="stat"><div class="k">Margin Alerts</div><div class="v">{{ competitive_intelligence.summary.margin_count }}</div></div>
      </div>
      <p class="muted" style="margin-top:10px;">Projected revenue lift: {{ competitive_intelligence.forecast.projected_revenue_lift }} | Confidence: {{ competitive_intelligence.forecast.confidence }}</p>
    </div>
  </div>
  <script>
    (function () {
      const url = new URL(window.location.href);
      const scrollY = Number(url.searchParams.get("scroll_y") || 0);
      if (scrollY > 0) {
        window.scrollTo(0, scrollY);
        url.searchParams.delete("scroll_y");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + (url.hash || ""));
      }
      document.querySelectorAll("form.preserve-scroll").forEach((form) => {
        form.addEventListener("submit", () => {
          const input = form.querySelector("input.scroll-y");
          if (input) {
            input.value = String(window.scrollY || window.pageYOffset || 0);
          }
        });
      });
    })();
  </script>
</body>
</html>
"""


DOCUMENT_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{ title }}</title>
  <style>
    body {
      margin: 0;
      background: #eceff3;
      color: #1f2937;
      font-family: "Merriweather", Georgia, "Times New Roman", serif;
    }
    .doc-shell {
      max-width: 980px;
      margin: 28px auto;
      background: #ffffff;
      border: 1px solid #d4d9e1;
      box-shadow: 0 18px 42px rgba(22, 30, 46, 0.14);
      border-radius: 8px;
      overflow: hidden;
    }
    .doc-head {
      padding: 18px 22px;
      border-bottom: 1px solid #e5e7eb;
      background: linear-gradient(180deg, #fafbfc, #f2f4f7);
    }
    .doc-head h1 {
      margin: 0;
      font-size: 1.25rem;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      letter-spacing: -0.01em;
    }
    .doc-head p {
      margin: 8px 0 0;
      color: #4b5563;
      font-size: 0.92rem;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    .doc-body {
      padding: 26px 30px 34px;
      white-space: pre-wrap;
      line-height: 1.66;
      font-size: 1.02rem;
    }
    .doc-actions {
      margin-top: 16px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    .doc-actions a {
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid #cdd5e0;
      color: #0f172a;
      background: #f8fafc;
    }
    @media (max-width: 720px) {
      .doc-shell { margin: 0; border-radius: 0; }
      .doc-body { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="doc-shell">
    <div class="doc-head">
      <h1>{{ title }}</h1>
      <p>{{ subtitle }}</p>
      <div class="doc-actions">
        <a href="{{ back_url }}">Back to dashboard</a>
        <a href="{{ raw_url }}">Open raw file</a>
      </div>
    </div>
    <div class="doc-body">{{ content }}</div>
  </div>
</body>
</html>
"""
def _load_agent_history():
  if not os.path.exists(AGENT_HISTORY_FILE):
    return []

  with open(AGENT_HISTORY_FILE, "r", encoding="utf-8") as handle:
    return json.load(handle)


def _save_agent_history(history):
  os.makedirs(REPORTS_DIR, exist_ok=True)
  with open(AGENT_HISTORY_FILE, "w", encoding="utf-8") as handle:
    json.dump(history[:20], handle, indent=2)


def _load_agent_review():
  if not os.path.exists(AGENT_REVIEW_FILE):
    return None

  with open(AGENT_REVIEW_FILE, "r", encoding="utf-8") as handle:
    try:
      return json.load(handle)
    except json.JSONDecodeError:
      return None


def _save_agent_review(review):
  os.makedirs(REPORTS_DIR, exist_ok=True)
  with open(AGENT_REVIEW_FILE, "w", encoding="utf-8") as handle:
    json.dump(review, handle, indent=2)


def _clear_agent_review():
  if os.path.exists(AGENT_REVIEW_FILE):
    os.remove(AGENT_REVIEW_FILE)


def _append_agent_history(entry):
  history = _load_agent_history()
  history.insert(0, entry)
  _save_agent_history(history)


def _write_agent_report(entry):
  os.makedirs(REPORTS_DIR, exist_ok=True)
  lines = [
    "# ForgeIQ Agent Response",
    f"Generated: {entry['timestamp']}",
    f"Prompt: {entry['prompt']}",
    f"Intent: {entry['intent']}",
    f"Status: {entry['status']}",
    "",
    entry.get("summary", ""),
  ]
  details = entry.get("details") or []
  if details:
    lines.extend(["", "## Details"])
    lines.extend(f"- {detail}" for detail in details)
  with open(AGENT_REPORT_FILE, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines).strip() + "\n")


def _text_blob(product):
  parts = [
    product.get("title") or "",
    product.get("vendor") or "",
    product.get("productType") or "",
    " ".join(product.get("tags") or []),
  ]
  return " ".join(parts).lower()


def _filter_products_by_topic(products, topic):
  stop_words = {"all", "any", "every", "for", "the", "a", "an", "product", "products", "items", "today", "today's"}
  tokens = [token for token in re.findall(r"[a-z0-9]+", topic.lower()) if len(token) > 2 and token not in stop_words]
  if not tokens:
    return products
  return [product for product in products if all(token in _text_blob(product) for token in tokens)]


def _normalize_agent_topic(topic):
  stop_words = {"all", "any", "every", "for", "the", "a", "an", "product", "products", "items", "today", "today's"}
  tokens = [token for token in re.findall(r"[a-z0-9]+", (topic or "").lower()) if len(token) > 2 and token not in stop_words]
  return " ".join(tokens).strip() or (topic or "garage storage").strip()


def _extract_threshold(prompt, default=85):
  match = re.search(r"(?:under|below|less than|<)\s*(?:seo\s*score\s*)?(\d{2,3})", prompt, re.IGNORECASE)
  if match:
    return int(match.group(1))

  match = re.search(r"seo\s*score\s*(\d{2,3})", prompt, re.IGNORECASE)
  if match:
    return int(match.group(1))

  return default


def _agent_prompt_summary(title, summary, details=None, intent="general", status="ok"):
  entry = {
    "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "prompt": title,
    "intent": intent,
    "summary": summary,
    "details": details or [],
    "status": status,
  }
  _append_agent_history(entry)
  _write_agent_report(entry)
  return entry


def _stage_agent_review(prompt, summary, details, action, payload, intent):
  review = {
    "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "prompt": prompt,
    "summary": summary,
    "details": details or [],
    "action": action,
    "payload": payload,
    "intent": intent,
    "status": "review_required",
  }
  _save_agent_review(review)
  return _agent_prompt_summary(prompt, summary, details=details, intent=intent, status="review_required")


def _build_daily_priority_response():
  context = build_dashboard_context()
  lines = [
    f"Store health: {context['dashboard']['health']['store_health_score']}",
    f"Priority recommendations: {len(context['attention_queue'])}",
    f"Planned actions: {len(context['planned_actions'])}",
  ]
  details = [
    *context["planned_actions"][:5],
    *(f"{item['current_title']} (priority {item['priority']}, score {item.get('score', 'n/a')})" for item in context["attention_queue"][:5]),
  ]
  return _agent_prompt_summary(
    "Show me today's priorities",
    "\n".join(lines),
    details=details,
    intent="daily_priorities",
  )


def _build_sales_lift_response():
  context = build_dashboard_context()
  lines = [
    "To make another sale today, focus on high-priority product fixes, content refreshes, and promotion readiness.",
    f"Projected 30-day health score: {context['forecast']['projected_health_score_30d']}",
    f"Campaigns queued: {len(context['campaigns'])}",
  ]
  details = list(context["planned_actions"][:5])
  details.extend(f"{item['title']}: {item['reason']}" for item in context["opportunities"][:3])
  return _agent_prompt_summary(
    "What should I do to make another sale today?",
    "\n".join(lines),
    details=details,
    intent="sales_lift",
  )


def _optimize_products_under_score(prompt):
  threshold = _extract_threshold(prompt, default=85)
  products = fetch_products()
  rows, recommendations = analyze_products(products)
  # Rebuild selected recommendations using product ids from the scored rows.
  recommendations_by_id = {rec.get("product_id"): rec for rec in recommendations}
  selected = [recommendations_by_id.get(row.get("Product ID")) for row in rows if int(row.get("Score", 0)) < threshold]
  selected = [rec for rec in selected if rec]

  if selected:
    summary = f"Prepared {len(selected)} products below SEO score {threshold} for review. No changes applied yet."
    details = ["Review the selected products, then use Apply review to write changes."]
    details.extend(f"{rec['current_title']} (score {next((row['Score'] for row in rows if row['Product ID'] == rec['product_id']), 'n/a')})" for rec in selected[:5])
    return _stage_agent_review(
      prompt=prompt,
      summary=summary,
      details=details,
      action="optimize_products",
      payload={"threshold": threshold, "selected_recommendations": selected},
      intent="optimize_products",
    )
  else:
    summary = f"No products found below SEO score {threshold}."
    details = []
    _clear_agent_review()

  return _agent_prompt_summary(prompt, summary, details=details, intent="optimize_products")


def _fix_missing_alt_tags(prompt):
  products = fetch_products()
  _, recommendations = analyze_products(products)
  selected = [rec for rec in recommendations if rec.get("alt_recommendations")]

  if selected:
    details = ["Review the staged alt-text changes, then use Apply review to write them."]
    details.extend(f"{recommendation['current_title']}: {len(recommendation['alt_recommendations'])} image(s)" for recommendation in selected)
    summary = f"Prepared alt-tag updates for {len(selected)} products. No image changes applied yet."
    return _stage_agent_review(
      prompt=prompt,
      summary=summary,
      details=details,
      action="fix_alt_tags",
      payload={"selected_recommendations": selected},
      intent="fix_alt_tags",
    )

  _clear_agent_review()
  summary = "No missing alt tags found."
  return _agent_prompt_summary(prompt, summary, details=[], intent="fix_alt_tags")


def _generate_blog_posts_for_topic(prompt):
  topic_match = re.search(r"for\s+(.+)$", prompt, re.IGNORECASE)
  topic = _normalize_agent_topic(topic_match.group(1) if topic_match else "garage storage")
  products = _filter_products_by_topic(fetch_products(limit=25), topic)

  if not products:
    return _agent_prompt_summary(
      prompt,
      f"No products matched '{topic}'.",
      details=[],
      intent="generate_blog_posts",
    )

  brand = settings.get("CONTENT_BRAND_NAME", "ForgeIQ Supply")
  tone = settings.get("CONTENT_TONE_DEFAULT", "balanced")
  drafts = [generate_blog_post(product, tone=tone, brand=brand) for product in products]

  os.makedirs(REPORTS_DIR, exist_ok=True)
  report_path = os.path.join(REPORTS_DIR, "forgeiq_agent_blog_drafts.md")
  with open(report_path, "w", encoding="utf-8") as handle:
    handle.write("# ForgeIQ Agent Blog Drafts\n\n")
    handle.write(f"Topic: {topic}\n\n")
    handle.write("\n\n".join(drafts))
    handle.write("\n")

  details = [product.get("title") or "Untitled" for product in products[:10]]
  details.insert(0, f"Draft report: {report_path}")
  return _agent_prompt_summary(
    prompt,
    f"Generated blog drafts for {len(products)} {topic} product(s).",
    details=details,
    intent="generate_blog_posts",
  )


def _handle_agent_prompt(prompt):
  normalized = (prompt or "").strip().lower()
  if not normalized:
    return _agent_prompt_summary(prompt, "No command entered.", intent="empty", status="error")

  if "optimize" in normalized and "seo" in normalized:
    return _optimize_products_under_score(prompt)

  if "generate blog" in normalized:
    return _generate_blog_posts_for_topic(prompt)

  if "missing alt" in normalized or "alt tag" in normalized:
    return _fix_missing_alt_tags(prompt)

  if "today" in normalized and ("priority" in normalized or "priorities" in normalized):
    return _build_daily_priority_response()

  if "another sale" in normalized or "make another sale" in normalized:
    return _build_sales_lift_response()

  return _agent_prompt_summary(
    prompt,
    "Try one of: optimize products under SEO score 85, generate blog posts for garage storage products, fix every missing alt tag, show me today's priorities, or what should I do to make another sale today?",
    intent="unknown",
    status="needs_guidance",
  )


def _apply_pending_agent_review():
  review = _load_agent_review()
  if not review:
    return _agent_prompt_summary(
      "Apply pending agent review",
      "No pending agent review found.",
      details=[],
      intent="apply_review",
      status="error",
    )

  action = review.get("action")
  payload = review.get("payload") or {}

  if action == "optimize_products":
    selected = payload.get("selected_recommendations") or []
    result = apply_recommendations(selected) if selected else {"updated_products": 0, "updated_alt_images": 0, "failures": 0}
    details = [
      f"Updated products: {result['updated_products']}",
      f"Updated alt texts: {result['updated_alt_images']}",
      f"Failures: {result['failures']}",
    ]
    summary = f"Applied approved SEO updates for {len(selected)} product(s)."
  elif action == "fix_alt_tags":
    selected = payload.get("selected_recommendations") or []
    updated = 0
    failures = 0
    details = []
    for recommendation in selected:
      for alt_change in recommendation.get("alt_recommendations", []):
        try:
          client.put_image_alt_text(recommendation["product_id"], alt_change["image_id"], alt_change["alt_text"])
          updated += 1
        except Exception:
          failures += 1
      details.append(f"{recommendation.get('current_title', 'Untitled')}: {len(recommendation.get('alt_recommendations', []))} image(s)")
    details.insert(0, f"Updated alt texts: {updated}")
    details.insert(1, f"Failures: {failures}")
    summary = f"Applied approved alt-tag updates for {len(selected)} product(s)."
  else:
    _clear_agent_review()
    return _agent_prompt_summary(
      review.get("prompt", "Apply pending agent review"),
      f"No handler available for staged action '{action}'.",
      details=[],
      intent="apply_review",
      status="error",
    )

  _clear_agent_review()
  return _agent_prompt_summary(
    review.get("prompt", "Apply pending agent review"),
    summary,
    details=details,
    intent=f"{action}_applied",
    status="ok",
  )


def _build_attention_queue():
    products = fetch_products()
    _, recommendations = analyze_products(products)
    return rank_recommendations(recommendations, limit=12), products, recommendations


def _build_queue():
  queue, _, _ = _build_attention_queue()
  return queue


def _read_text(path):
    if not path or not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def _tail_lines(path, limit=40):
    text = _read_text(path)
    if not text:
        return "No log content available."
    lines = text.splitlines()
    return "\n".join(lines[-limit:])


def _format_timestamp(path):
    try:
        return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M")
    except OSError:
        return "Unknown"


def _list_files(directory, limit=8):
    if not os.path.exists(directory):
        return []

    items = []
    for name in os.listdir(directory):
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            items.append(
                {
                    "name": name,
                    "path": path,
                    "modified": _format_timestamp(path),
                    "size_kb": round(os.path.getsize(path) / 1024, 1),
                }
            )

    items.sort(key=lambda item: os.path.getmtime(item["path"]), reverse=True)
    return items[:limit]


def _safe_file_path(directory, filename):
    base = os.path.realpath(directory)
    target = os.path.realpath(os.path.join(directory, filename))
    if not target.startswith(base + os.sep) and target != base:
        return None
    if not os.path.isfile(target):
        return None
    return target


def _render_document_view(title, subtitle, content, back_url, raw_url):
    return render_template_string(
        DOCUMENT_TEMPLATE,
        title=title,
        subtitle=subtitle,
        content=content,
        back_url=back_url,
        raw_url=raw_url,
    )


def _build_apply_feedback(args):
    status = (args.get("apply_status") or "").strip().lower()
    if not status:
        return None

    updated_products = int(args.get("updated_products") or 0)
    updated_alt_images = int(args.get("updated_alt_images") or 0)
    failures = int(args.get("failures") or 0)
    applied_count = int(args.get("applied_count") or 0)

    if status == "success":
        banner_class = "success" if failures == 0 else "warn"
        title = "Apply Approved complete"
        message = (
            f"Processed {applied_count} staged product(s). "
            f"Updated products: {updated_products}. Updated alt texts: {updated_alt_images}. Failures: {failures}."
        )
        return {"banner_class": banner_class, "title": title, "message": message}

    if status == "empty":
        return {
            "banner_class": "warn",
            "title": "No approved changes to apply",
            "message": "Stage one or more products first, then use Apply Approved to write changes to Shopify.",
        }

    return None


def _extract_sections(text, prefix, limit=4):
    sections = []
    current = None
    body_lines = []

    for line in text.splitlines():
        if line.startswith("## ") or line.startswith("### "):
            if current and current["heading"].startswith(prefix):
                body = "\n".join(body_lines).strip()
                sections.append(
                    {
                        "title": current["heading"].split(":", 1)[1].strip() if ":" in current["heading"] else current["heading"],
                        "body": body,
                        "excerpt": body[:350] if body else "",
                    }
                )
                if len(sections) >= limit:
                    return sections

            current = None
            body_lines = []
            if line.startswith("### ") and line[4:].startswith(prefix):
                current = {"heading": line[4:].strip()}
            continue

        if current:
            body_lines.append(line)

    if current and current["heading"].startswith(prefix):
        body = "\n".join(body_lines).strip()
        sections.append(
            {
                "title": current["heading"].split(":", 1)[1].strip() if ":" in current["heading"] else current["heading"],
                "body": body,
                "excerpt": body[:350] if body else "",
            }
        )

    return sections[:limit]


def _build_scheduler_rows():
    definitions = get_job_definitions()
    state = load_scheduler_state()
    jobs = state.get("jobs", {})
    rows = []

    for name, job in definitions.items():
        meta = jobs.get(name, {})
        next_run = meta.get("next_run")
        status = "Scheduled" if next_run else "Pending"
        status_class = "success" if next_run else "warn"
        rows.append(
            {
                "name": name,
                "interval": job.get("interval", "daily"),
                "last_run": meta.get("last_run"),
                "next_run": next_run,
                "status": status,
                "status_class": status_class,
            }
        )

    return rows


def _refresh_content_preview():
    tone = settings.get("CONTENT_TONE_DEFAULT", "balanced")
    brand = settings.get("CONTENT_BRAND_NAME", "ForgeIQ Supply")
    generate_preview(channels=["blog", "pinterest", "facebook", "email"], tone=tone, brand=brand)


def _empty_dashboard_data():
  return {
    "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "health": {"store_health_score": 0},
    "shopify": {
      "product_count": 0,
      "average_seo_score": 0,
      "products_missing_meta": 0,
      "images_missing_alt": 0,
    },
    "search_console": {
      "ctr": 0,
      "clicks": 0,
      "impressions": 0,
      "average_position": 0,
      "source": "unconfigured",
    },
    "google_analytics": {"sessions": 0, "users": 0, "conversions": 0, "source": "unconfigured"},
    "shopify_native": {
      "orders_last_50": 0,
      "estimated_revenue_last_50": 0,
      "currency": "USD",
      "source": "unconfigured",
    },
  }


def _safe_dashboard_data():
    try:
        return build_dashboard_data()
    except Exception:
        return _empty_dashboard_data()


def _safe_attention_queue():
    try:
        return _build_attention_queue()
    except Exception:
        return [], [], []


def _safe_competitive_intelligence():
  try:
    return build_competitive_intelligence_data()
  except Exception:
    return {
      "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
      "price_signals": [],
      "trend_signals": [],
      "keyword_gaps": [],
      "margin_signals": [],
      "product_additions": [],
      "forecast": {"baseline_revenue_index": 0, "projected_revenue_lift": 0, "confidence": "low"},
      "summary": {"price_gap_count": 0, "trend_count": 0, "keyword_gap_count": 0, "margin_count": 0},
      "sources": {},
    }


def _safe_shopify_connection_status(dashboard):
    status = {
        "connected": False,
        "connected_label": "Not connected",
        "connected_class": "danger",
        "message": "Shopify credentials missing, invalid, or connection failed.",
        "store_name": "Unavailable",
        "product_count": int((dashboard.get("shopify") or {}).get("product_count") or 0),
        "write_permissions_available": False,
        "write_permissions_label": "Unknown",
        "write_permissions_class": "warn",
        "write_permissions_message": "Unable to verify write scopes.",
        "order_scope_label": "Unknown",
        "order_scope_class": "warn",
        "order_scope_message": "Order analytics scope not checked.",
    }

    try:
        shop_name = client.validate_connection()
        status["connected"] = True
        status["connected_label"] = "Connected"
        status["connected_class"] = "success"
        status["store_name"] = shop_name
        status["message"] = "Read-only Shopify connection verified successfully."

        scopes_query = """
        query connectionHealth {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
        """
        data = client.graphql(scopes_query)
        handles = {
            scope.get("handle", "")
            for scope in ((data.get("currentAppInstallation") or {}).get("accessScopes") or [])
            if scope.get("handle")
        }

        write_available = any(handle.startswith("write_") for handle in handles) and "write_products" in handles
        status["write_permissions_available"] = write_available
        if write_available:
            status["write_permissions_label"] = "Available"
            status["write_permissions_class"] = "success"
            status["write_permissions_message"] = "Product write scope detected."
        else:
            status["write_permissions_label"] = "Missing"
            status["write_permissions_class"] = "danger"
            status["write_permissions_message"] = "Product write scope not detected."

        analytics = gather_shopify_analytics_native()
        if analytics.get("source") == "native":
            status["order_scope_label"] = "Available"
            status["order_scope_class"] = "success"
            status["order_scope_message"] = "Order analytics query succeeded."
        elif analytics.get("source") == "native_scope_missing":
            status["order_scope_label"] = "Missing"
            status["order_scope_class"] = "warn"
            status["order_scope_message"] = "Orders scope is missing for analytics queries."
        else:
            status["order_scope_label"] = "Unavailable"
            status["order_scope_class"] = "warn"
            status["order_scope_message"] = "Order analytics could not be verified."
    except Exception as exc:
        status["message"] = str(exc)

    return status


def _normalize_dashboard_data(dashboard):
    dashboard = dict(dashboard or {})
    dashboard.setdefault("generated_at", datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))

    health = dict(dashboard.get("health") or {})
    health.setdefault("store_health_score", 0)
    dashboard["health"] = health

    shopify = dict(dashboard.get("shopify") or {})
    shopify.setdefault("product_count", 0)
    shopify.setdefault("average_seo_score", 0)
    shopify.setdefault("products_missing_meta", 0)
    shopify.setdefault("images_missing_alt", 0)
    dashboard["shopify"] = shopify

    google_analytics = dict(dashboard.get("google_analytics") or {})
    google_analytics.setdefault("sessions", 0)
    google_analytics.setdefault("users", 0)
    google_analytics.setdefault("conversions", 0)
    google_analytics.setdefault("source", "unconfigured")
    dashboard["google_analytics"] = google_analytics

    search_console = dict(dashboard.get("search_console") or {})
    search_console.setdefault("ctr", 0)
    search_console.setdefault("clicks", 0)
    search_console.setdefault("impressions", 0)
    search_console.setdefault("average_position", 0)
    search_console.setdefault("source", "unconfigured")
    dashboard["search_console"] = search_console

    shopify_native = dict(dashboard.get("shopify_native") or {})
    shopify_native.setdefault("orders_last_50", 0)
    shopify_native.setdefault("estimated_revenue_last_50", 0)
    shopify_native.setdefault("currency", "USD")
    shopify_native.setdefault("source", "unconfigured")
    dashboard["shopify_native"] = shopify_native

    return dashboard


def build_dashboard_context(refresh_content=False, live_refresh=False):
    dashboard = _normalize_dashboard_data(_safe_dashboard_data())
    shopify_connection = _safe_shopify_connection_status(dashboard)
    attention_queue, products, recommendations = _safe_attention_queue()
    competitive_intelligence = _safe_competitive_intelligence()
    orchestrator_state = load_orchestrator_state()
    top_recommendations = rank_recommendations(recommendations, limit=5)
    trends = analyze_trends(orchestrator_state, dashboard)
    opportunities = detect_product_opportunities(recommendations)
    inventory_recommendations = detect_inventory_recommendations(products)
    campaigns = plan_marketing_campaigns(opportunities)
    forecast = forecast_performance(dashboard, top_recommendations)
    planned_actions = plan_actions(top_recommendations, dashboard, inventory_recommendations)

    if refresh_content or not os.path.exists(CONTENT_REPORT_FILE):
        try:
            _refresh_content_preview()
        except Exception:
            pass

    content_text = _read_text(CONTENT_REPORT_FILE)
    blog_drafts = _extract_sections(content_text, "Blog Draft")
    pinterest_queue = _extract_sections(content_text, "Pinterest")
    scheduled_tasks = _build_scheduler_rows()
    report_files = _list_files(REPORTS_DIR, limit=12)
    report_file_names = {item["name"] for item in report_files}
    log_files = _list_files(LOGS_DIR, limit=5)
    latest_log_path = log_files[0]["path"] if log_files else None
    approvals = _load_approvals()
    agent_history = _load_agent_history()
    pending_agent_review = _load_agent_review()

    charts = [
        {"label": "Store health", "value": dashboard["health"]["store_health_score"], "width": min(100, int(dashboard["health"]["store_health_score"]))},
        {"label": "Average SEO", "value": dashboard["shopify"]["average_seo_score"], "width": min(100, int(dashboard["shopify"]["average_seo_score"]))},
        {"label": "Search CTR", "value": f"{round(dashboard['search_console']['ctr'] * 100, 1)}%", "width": min(100, int(dashboard["search_console"]["ctr"] * 100))},
        {"label": "GA sessions", "value": dashboard["google_analytics"]["sessions"], "width": min(100, int(dashboard["google_analytics"]["sessions"])),},
        {"label": "GA users", "value": dashboard["google_analytics"]["users"], "width": min(100, int(dashboard["google_analytics"]["users"])),},
        {"label": "Orders", "value": dashboard["shopify_native"]["orders_last_50"], "width": min(100, int(dashboard["shopify_native"]["orders_last_50"] * 2)),},
    ]

    return {
        "dashboard": dashboard,
        "shopify_connection": shopify_connection,
        "live_refresh": live_refresh,
        "attention_queue": attention_queue,
        "trends": trends,
        "opportunities": opportunities,
        "inventory_recommendations": inventory_recommendations,
        "campaigns": campaigns,
        "forecast": forecast,
        "planned_actions": planned_actions,
        "competitive_intelligence": competitive_intelligence,
        "blog_drafts": blog_drafts,
        "pinterest_queue": pinterest_queue,
        "scheduled_tasks": scheduled_tasks,
        "report_files": report_files,
        "report_file_names": report_file_names,
        "log_files": log_files,
        "latest_log_tail": _tail_lines(latest_log_path) if latest_log_path else "No log content available.",
        "approvals": approvals,
        "agent_history": agent_history,
        "pending_agent_review": pending_agent_review,
        "orchestrator_runs": list(reversed(orchestrator_state.get("runs", [])))[:10],
        "charts": charts,
    }


def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        refresh_content = request.args.get("refresh_content") in {"1", "true", "yes"}
        live_refresh = request.args.get("live") in {"1", "true", "yes"}
        context = build_dashboard_context(refresh_content=refresh_content, live_refresh=live_refresh)
        context["apply_feedback"] = _build_apply_feedback(request.args)
        return render_template_string(TEMPLATE, **context)

    @app.post("/approve/<path:product_id>")
    def approve(product_id):
        state = _load_approvals()
        if product_id not in state["approved"]:
            state["approved"].append(product_id)
        state["rejected"] = [pid for pid in state["rejected"] if pid != product_id]
        _save_approvals(state)

        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/reject/<path:product_id>")
    def reject(product_id):
        state = _load_approvals()
        if product_id not in state["rejected"]:
            state["rejected"].append(product_id)
        state["approved"] = [pid for pid in state["approved"] if pid != product_id]
        _save_approvals(state)
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/approve-bulk")
    def approve_bulk():
        queue, _, _ = _build_attention_queue()
        count_raw = (request.form.get("count") or "5").strip().lower()
        if count_raw == "all":
            selected = queue
        else:
            try:
                count = max(1, int(count_raw))
            except ValueError:
                count = 5
            selected = queue[:count]

        selected_ids = [rec.get("product_id") for rec in selected if rec.get("product_id")]
        stage_approved_product_ids(selected_ids)

        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/apply-approved")
    def apply_approved():
        queue, _, _ = _build_attention_queue()
        state = _load_approvals()
        selected = [rec for rec in queue if rec.get("product_id") in set(state.get("approved", []))]
        if selected:
            result = apply_recommendations(selected)
            scroll_y = request.form.get("scroll_y", "0")
            return redirect(
                url_for(
                    "index",
                    scroll_y=scroll_y,
                    apply_status="success",
                    applied_count=len(selected),
                    updated_products=result["updated_products"],
                    updated_alt_images=result["updated_alt_images"],
                    failures=result["failures"],
                )
            )
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y, apply_status="empty"))

    @app.post("/refresh-content")
    def refresh_content():
        _refresh_content_preview()
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", refresh_content="1", scroll_y=scroll_y))

    @app.get("/live")
    def live():
        return redirect(url_for("index", live="1"))

    @app.post("/agent")
    def agent():
        prompt = (request.form.get("prompt") or "").strip()
        _handle_agent_prompt(prompt)
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/agent/apply-review")
    def apply_agent_review():
      _apply_pending_agent_review()
      scroll_y = request.form.get("scroll_y", "0")
      return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/agent/discard-review")
    def discard_agent_review():
        _clear_agent_review()
        _agent_prompt_summary(
            "Discard pending agent review",
            "Pending agent review discarded.",
            details=[],
            intent="discard_review",
        )
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.post("/refresh-orchestrator")
    def refresh_orchestrator():
        orchestrator_run()
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

    @app.get("/reports/<path:filename>")
    def download_report(filename):
        if not _safe_file_path(REPORTS_DIR, filename):
            abort(404)
        return send_from_directory(REPORTS_DIR, filename, as_attachment=False)

    @app.get("/logs/<path:filename>")
    def download_log(filename):
        if not _safe_file_path(LOGS_DIR, filename):
            abort(404)
        return send_from_directory(LOGS_DIR, filename, as_attachment=False)

    @app.get("/documents/report/<path:filename>")
    def view_report_document(filename):
        path = _safe_file_path(REPORTS_DIR, filename)
        if not path:
            abort(404)
        content = _read_text(path)
        return _render_document_view(
            title=f"Report: {filename}",
            subtitle=f"Rendered from {html.escape(filename)}",
            content=content,
            back_url=url_for("index") + "#reports",
            raw_url=url_for("download_report", filename=filename),
        )

    @app.get("/documents/log/<path:filename>")
    def view_log_document(filename):
        path = _safe_file_path(LOGS_DIR, filename)
        if not path:
            abort(404)
        content = _read_text(path)
        return _render_document_view(
            title=f"Log: {filename}",
            subtitle=f"Rendered from {html.escape(filename)}",
            content=content,
            back_url=url_for("index") + "#logs",
            raw_url=url_for("download_log", filename=filename),
        )

    return app


def run(host="127.0.0.1", port=5050, open_browser=True):
    app = create_app()
    url = f"http://{host}:{port}"
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    print(f"Starting ForgeIQ web dashboard at {url}")
    app.run(host=host, port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    run()
