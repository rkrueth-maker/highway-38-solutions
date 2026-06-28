import json
import os
import re
import threading
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, redirect, render_template_string, request, send_from_directory, url_for

from logger import LOG_DIR
from settings import settings
from shopify.analytics_dashboard import build_dashboard_data
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

APPROVAL_STATE_FILE = os.path.join("reports", "forgeiq_web_approvals.json")
REPORTS_DIR = os.path.join("reports")
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
      --bg: #0b1220;
      --panel: #111a2b;
      --panel-2: #172238;
      --border: rgba(255, 255, 255, 0.08);
      --text: #e5eefc;
      --muted: #9fb1cf;
      --accent: #7dd3fc;
      --accent-2: #f59e0b;
      --success: #34d399;
      --danger: #fb7185;
      --shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: "Space Grotesk", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(125, 211, 252, 0.14), transparent 30%),
        radial-gradient(circle at top right, rgba(245, 158, 11, 0.12), transparent 24%),
        linear-gradient(180deg, #08101d 0%, #0b1220 100%);
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
      background-size: 48px 48px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.24), transparent 90%);
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .shell { max-width: 1600px; margin: 0 auto; padding: 24px; }
    .hero {
      display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 16px;
      align-items: stretch;
      margin-bottom: 18px;
    }
    .hero-card, .panel {
      background: linear-gradient(180deg, rgba(17, 26, 43, 0.96), rgba(12, 18, 31, 0.96));
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
    }
    .hero-card {
      padding: 26px;
      position: relative;
      overflow: hidden;
      border-color: rgba(125, 211, 252, 0.18);
    }
    .hero-card::after {
      content: "";
      position: absolute;
      right: -80px;
      top: -80px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(125, 211, 252, 0.18), transparent 68%);
      animation: floatGlow 8s ease-in-out infinite;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: clamp(2.2rem, 2.8vw, 3.3rem);
      line-height: 0.98;
      letter-spacing: -0.04em;
    }
    .hero p { margin: 0; color: var(--muted); max-width: 68ch; line-height: 1.5; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    .status-strip {
      margin-top: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: #dbeafe;
      font-size: 0.95rem;
    }
    .status-strip span {
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(125, 211, 252, 0.09);
      border: 1px solid rgba(125, 211, 252, 0.14);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--text);
      font-size: 0.92rem;
      backdrop-filter: blur(12px);
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 20px;
    }
    .action-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
    }
    .action-card h3 { margin: 0 0 8px; font-size: 1rem; }
    .action-card p { margin: 0 0 12px; color: var(--muted); font-size: 0.95rem; line-height: 1.4; }

    .grid-6, .grid-4, .grid-3 { display: grid; gap: 14px; margin: 16px 0; }
    .grid-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .metric {
      padding: 16px;
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(23, 34, 56, 0.94), rgba(16, 25, 42, 0.94));
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      position: relative;
      overflow: hidden;
    }
    .metric .label { color: var(--muted); font-size: 0.86rem; text-transform: uppercase; letter-spacing: 0.08em; }
    .metric .value { font-size: 2rem; font-weight: 700; margin-top: 8px; }
    .metric .sub { color: var(--muted); font-size: 0.92rem; margin-top: 6px; }

    .section { margin-top: 18px; }
    .section h2 { margin: 0 0 10px; font-size: 1.2rem; }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 14px;
      margin-bottom: 10px;
    }
    .section-head p {
      margin: 0;
      color: var(--muted);
      max-width: 66ch;
    }
    .panel { padding: 18px; }

    .chart-row { display: grid; grid-template-columns: 160px 1fr 88px; gap: 12px; align-items: center; margin: 12px 0; }
    .chart-label { color: var(--muted); font-size: 0.92rem; }
    .bar-track {
      height: 14px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
    }
    .chart-value { text-align: right; font-variant-numeric: tabular-nums; }

    table { width: 100%; border-collapse: collapse; }
    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.08em; }
    tbody tr:hover { background: rgba(255, 255, 255, 0.03); }

    .tag {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.8rem;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.03);
    }
    .tag.success { color: var(--success); }
    .tag.warn { color: #fbbf24; }
    .tag.danger { color: var(--danger); }

    .actions form { display: inline; }
    .preserve-scroll { display: inline; }
    .btn {
      appearance: none;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 9px 12px;
      margin-right: 6px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      cursor: pointer;
    }
    .btn.primary { background: linear-gradient(90deg, var(--accent), #60a5fa); color: #06101c; border: 0; }
    .btn.danger { background: rgba(251, 113, 133, 0.14); color: #fecdd3; }
    .btn.good { background: rgba(52, 211, 153, 0.14); color: #a7f3d0; }

    .card-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .mini-card {
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.03);
    }
    .mini-card h3 { margin: 0 0 8px; font-size: 1rem; }
    .mini-card p, .mini-card li, .muted { color: var(--muted); }
    .stack { display: grid; gap: 10px; }
    .quick-prompts {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }
    .quick-prompts .pill {
      cursor: pointer;
      border-style: dashed;
      background: rgba(125, 211, 252, 0.07);
    }
    pre {
      margin: 0;
      padding: 14px;
      white-space: pre-wrap;
      background: rgba(0, 0, 0, 0.24);
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: #dbeafe;
      font-size: 0.9rem;
      line-height: 1.5;
      overflow-x: auto;
    }
    .two-col { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 14px; }
    .file-list { display: grid; gap: 8px; }
    .file-item { display: flex; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 14px; background: rgba(255, 255, 255, 0.03); }
    .file-item span { color: var(--muted); }
    @keyframes floatGlow {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.72; }
      50% { transform: translate3d(-16px, 10px, 0) scale(1.05); opacity: 1; }
    }

    @media (max-width: 1200px) {
      .hero, .two-col, .grid-6 { grid-template-columns: 1fr; }
      .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .chart-row { grid-template-columns: 1fr; }
      .chart-value { text-align: left; }
    }
    @media (max-width: 720px) {
      .grid-4, .grid-3 { grid-template-columns: 1fr; }
      .actions-grid { grid-template-columns: 1fr; }
      .shell { padding: 14px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <div class="hero-card">
        <div class="pill">ForgeIQ OS</div>
        <h1>Shopify operating system for content, analytics, and automation.</h1>
        <p>
          This browser dashboard replaces the old text menu with a control center for store health,
          recommendations, approvals, analytics, drafts, scheduled work, logs, and generated reports.
        </p>
        <div class="status-strip">
          <span>Browser-first workflow</span>
          <span>AI agent ready</span>
          <span>Automation + intelligence live</span>
        </div>
        <div class="hero-meta">
          <span class="pill">Generated {{ dashboard.generated_at }}</span>
          <span class="pill">{% if live_refresh %}Live refresh on{% else %}Live refresh off{% endif %}</span>
          <span class="pill">Approved {{ approvals.approved|length }}</span>
          <span class="pill">Rejected {{ approvals.rejected|length }}</span>
          <span class="pill">Jobs {{ scheduled_tasks|length }}</span>
          <span class="pill">Reports {{ report_files|length }}</span>
        </div>
      </div>
      <div class="panel">
        <div class="actions-grid">
          <div class="action-card">
            <h3>Refresh content</h3>
            <p>Regenerate recent blog drafts and Pinterest queue items.</p>
            <form method="post" action="{{ url_for('refresh_content') }}">
              <button class="btn primary" type="submit">Refresh drafts</button>
            </form>
          </div>
          <div class="action-card">
            <h3>Run orchestrator</h3>
            <p>Regenerate intelligence summaries, actions, and forecasts.</p>
            <form method="post" action="{{ url_for('refresh_orchestrator') }}">
              <button class="btn primary" type="submit">Refresh AI</button>
            </form>
          </div>
          <div class="action-card">
            <h3>Apply approvals</h3>
            <p>Push all approved optimization actions in one click.</p>
            <form method="post" action="{{ url_for('apply_approved') }}">
              <button class="btn good" type="submit">Apply approved</button>
            </form>
          </div>
          <div class="action-card">
            <h3>Open reports</h3>
            <p>Jump straight to reports, logs, and generated artifacts below.</p>
          </div>
          <div class="action-card">
            <h3>Live refresh</h3>
            <p>Keep the dashboard on a 45-second refresh cycle for fresh store data.</p>
            <form method="get" action="{{ url_for('index') }}">
              <input type="hidden" name="live" value="1" />
              <button class="btn" type="submit">Enable live mode</button>
            </form>
            <form method="get" action="{{ url_for('index') }}">
              <button class="btn" type="submit">Disable live mode</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div class="section panel">
      <div class="section-head">
        <div>
          <h2>AI Agent</h2>
          <p>Use natural language to turn store signals into actions, priorities, and content workflows.</p>
        </div>
      </div>
      <div class="two-col">
        <div class="mini-card" style="background: linear-gradient(180deg, rgba(125, 211, 252, 0.08), rgba(255, 255, 255, 0.03));">
          <h3>Ask ForgeIQ</h3>
          <p>Use plain English to optimize products, generate content, fix alt tags, or ask for priorities.</p>
          <form method="post" action="{{ url_for('agent') }}">
            <textarea name="prompt" rows="4" style="width:100%; padding:12px; border-radius:14px; border:1px solid var(--border); background: rgba(0,0,0,0.24); color: var(--text);" placeholder="Optimize products under SEO score 85."></textarea>
            <div style="margin-top: 10px; display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn primary" type="submit">Run agent</button>
              <a class="btn" href="{{ url_for('index') }}?live=1">Use live mode</a>
            </div>
          </form>
          <div class="quick-prompts">
            <div class="pill">Optimize products under SEO score 85.</div>
            <div class="pill">Fix every missing alt tag.</div>
            <div class="pill">Generate blog posts for all garage storage products.</div>
            <div class="pill">What should I do to make another sale today?</div>
          </div>
        </div>
        <div class="mini-card" style="background: linear-gradient(180deg, rgba(245, 158, 11, 0.08), rgba(255, 255, 255, 0.03));">
          <h3>Recent agent runs</h3>
          {% if pending_agent_review %}
          <div class="mini-card" style="margin-bottom: 12px; border-style: dashed;">
            <h3>Pending review</h3>
            <p>{{ pending_agent_review.summary }}</p>
            <div class="muted">{{ pending_agent_review.prompt }}</div>
            <div class="stack" style="margin-top: 10px;">
              {% for item in pending_agent_review.details[:4] %}
                <div>• {{ item }}</div>
              {% endfor %}
            </div>
            <div style="margin-top: 12px; display:flex; gap:10px; flex-wrap:wrap;">
              <form class="preserve-scroll" method="post" action="{{ url_for('apply_agent_review') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn good" type="submit">Apply review</button>
              </form>
              <form class="preserve-scroll" method="post" action="{{ url_for('discard_agent_review') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn danger" type="submit">Discard</button>
              </form>
            </div>
          </div>
          {% endif %}
          <div class="stack">
            {% for entry in agent_history[:5] %}
              <div>
                <strong>{{ entry.prompt }}</strong><br />
                <span class="muted">{{ entry.timestamp }} • {{ entry.intent }} • {{ entry.status }}</span>
                <pre>{{ entry.summary }}</pre>
              </div>
            {% else %}
              <div class="muted">No agent commands yet.</div>
            {% endfor %}
          </div>
        </div>
      </div>
    </div>

    <div class="grid-6">
      <div class="metric"><div class="label">Store Health</div><div class="value">{{ dashboard.health.store_health_score }}</div><div class="sub">Composite operating score</div></div>
      <div class="metric"><div class="label">Products</div><div class="value">{{ dashboard.shopify.product_count }}</div><div class="sub">Catalog items tracked</div></div>
      <div class="metric"><div class="label">SEO Avg</div><div class="value">{{ dashboard.shopify.average_seo_score }}</div><div class="sub">Average product score</div></div>
      <div class="metric"><div class="label">CTR</div><div class="value">{{ (dashboard.search_console.ctr * 100) | round(1) }}%</div><div class="sub">Search performance</div></div>
      <div class="metric"><div class="label">Orders</div><div class="value">{{ dashboard.shopify_native.orders_last_50 }}</div><div class="sub">Last 50 orders</div></div>
      <div class="metric"><div class="label">Revenue</div><div class="value">{{ dashboard.shopify_native.estimated_revenue_last_50 }}</div><div class="sub">{{ dashboard.shopify_native.currency }}</div></div>
    </div>

    <div class="section panel">
      <h2>Analytics charts</h2>
      <div class="chart-row">
        <div class="chart-label">Store health</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ dashboard.health.store_health_score }}%;"></div></div>
        <div class="chart-value">{{ dashboard.health.store_health_score }}</div>
      </div>
      <div class="chart-row">
        <div class="chart-label">Average SEO</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ dashboard.shopify.average_seo_score }}%;"></div></div>
        <div class="chart-value">{{ dashboard.shopify.average_seo_score }}</div>
      </div>
      <div class="chart-row">
        <div class="chart-label">Search CTR</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ (dashboard.search_console.ctr * 100) | round(0) }}%;"></div></div>
        <div class="chart-value">{{ (dashboard.search_console.ctr * 100) | round(1) }}%</div>
      </div>
      <div class="chart-row">
        <div class="chart-label">GA sessions</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ [dashboard.google_analytics.sessions, 100] | min }}%;"></div></div>
        <div class="chart-value">{{ dashboard.google_analytics.sessions }}</div>
      </div>
      <div class="chart-row">
        <div class="chart-label">GA users</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ [dashboard.google_analytics.users, 100] | min }}%;"></div></div>
        <div class="chart-value">{{ dashboard.google_analytics.users }}</div>
      </div>
      <div class="chart-row">
        <div class="chart-label">Orders</div>
        <div class="bar-track"><div class="bar-fill" style="width: {{ [dashboard.shopify_native.orders_last_50 * 2, 100] | min }}%;"></div></div>
        <div class="chart-value">{{ dashboard.shopify_native.orders_last_50 }}</div>
      </div>
    </div>

    <div class="section panel">
      <h2>Products needing attention</h2>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Priority</th>
            <th>Confidence</th>
            <th>Needs Update</th>
            <th>Approval</th>
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
            <td>
              title={{ rec.needs_title }}, description={{ rec.needs_description }}, tags={{ rec.needs_tags }}, alt={{ rec.alt_recommendations|length }}
            </td>
            <td class="actions">
              <form class="preserve-scroll" method="post" action="{{ url_for('approve', product_id=rec.product_id) }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn good" type="submit">Approve</button>
              </form>
              <form class="preserve-scroll" method="post" action="{{ url_for('reject', product_id=rec.product_id) }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
                <button class="btn danger" type="submit">Reject</button>
              </form>
            </td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>

    <div class="section two-col">
      <div class="panel">
        <h2>AI recommendations</h2>
        <div class="card-grid">
          <div class="mini-card">
            <h3>Trends</h3>
            <p>{{ trends.trend_note }}</p>
            <p class="muted">Priority change: {{ trends.priority_change }}</p>
          </div>
          <div class="mini-card">
            <h3>Forecast</h3>
            <p>Baseline: {{ forecast.baseline_health_score }}</p>
            <p>30-day projection: {{ forecast.projected_health_score_30d }}</p>
          </div>
          <div class="mini-card">
            <h3>Campaigns</h3>
            {% if campaigns %}
              <ul>
                {% for campaign in campaigns %}
                  <li>{{ campaign.title }} - {{ campaign.campaign }}</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No campaigns generated yet.</p>
            {% endif %}
          </div>
          <div class="mini-card">
            <h3>Inventory</h3>
            {% if inventory_recommendations %}
              <ul>
                {% for item in inventory_recommendations %}
                  <li>{{ item.title }} - {{ item.action }}</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No inventory signals detected.</p>
            {% endif %}
          </div>
        </div>
        <div class="mini-card" style="margin-top: 12px;">
          <h3>Planned actions</h3>
          <div class="stack">
            {% for action in planned_actions %}
              <div>• {{ action }}</div>
            {% endfor %}
          </div>
        </div>
        <div class="mini-card" style="margin-top: 12px;">
          <h3>Recent orchestrator runs</h3>
          <div class="stack">
            {% for run in orchestrator_runs %}
              <div>
                <strong>{{ run.timestamp }}</strong><br />
                <span class="muted">{{ run.planned_actions|length }} planned actions, {{ run.top_recommendations|length }} recommendations</span>
              </div>
            {% else %}
              <div class="muted">No orchestrator runs recorded yet.</div>
            {% endfor %}
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>Workflow actions</h2>
        <div class="stack">
          <div class="mini-card">
            <h3>Approvals</h3>
            <p>{{ approvals.approved|length }} approved, {{ approvals.rejected|length }} rejected.</p>
              <form class="preserve-scroll" method="post" action="{{ url_for('apply_approved') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
              <button class="btn primary" type="submit">Apply approved</button>
            </form>
          </div>
          <div class="mini-card">
            <h3>Content engine</h3>
            <p>Refresh recent blog drafts and Pinterest queue entries.</p>
              <form class="preserve-scroll" method="post" action="{{ url_for('refresh_content') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
              <button class="btn primary" type="submit">Refresh content drafts</button>
            </form>
          </div>
          <div class="mini-card">
            <h3>AI orchestrator</h3>
            <p>Rebuild the daily summary and action plan.</p>
              <form class="preserve-scroll" method="post" action="{{ url_for('refresh_orchestrator') }}">
                <input type="hidden" name="scroll_y" class="scroll-y" value="0" />
              <button class="btn primary" type="submit">Refresh orchestrator</button>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div class="section panel">
      <h2>Competitive Intelligence</h2>
      <div class="grid-4">
        <div class="metric"><div class="label">Price gaps</div><div class="value">{{ competitive_intelligence.summary.price_gap_count }}</div><div class="sub">Competitor price checks</div></div>
        <div class="metric"><div class="label">Trend signals</div><div class="value">{{ competitive_intelligence.summary.trend_count }}</div><div class="sub">Search volume movement</div></div>
        <div class="metric"><div class="label">Keyword gaps</div><div class="value">{{ competitive_intelligence.summary.keyword_gap_count }}</div><div class="sub">Ranking opportunities</div></div>
        <div class="metric"><div class="label">Margin alerts</div><div class="value">{{ competitive_intelligence.summary.margin_count }}</div><div class="sub">Profitability watch list</div></div>
      </div>
      <div class="two-col">
        <div class="card-grid">
          <div class="mini-card">
            <h3>Price monitoring</h3>
            {% if competitive_intelligence.price_signals %}
              <ul>
                {% for item in competitive_intelligence.price_signals[:4] %}
                  <li>{{ item.product }} vs {{ item.competitor }}: gap {{ item.price_gap }}</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No competitor price data configured yet.</p>
            {% endif %}
          </div>
          <div class="mini-card">
            <h3>Trend analysis</h3>
            {% if competitive_intelligence.trend_signals %}
              <ul>
                {% for item in competitive_intelligence.trend_signals[:4] %}
                  <li>{{ item.keyword }}: {{ item.change }} ({{ item.pct_change }}%)</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No trend export configured yet.</p>
            {% endif %}
          </div>
        </div>
        <div class="card-grid">
          <div class="mini-card">
            <h3>Keyword gaps</h3>
            {% if competitive_intelligence.keyword_gaps %}
              <ul>
                {% for item in competitive_intelligence.keyword_gaps[:4] %}
                  <li>{{ item.keyword }}: our {{ item.our_rank or 'n/a' }} vs competitor {{ item.competitor_rank or 'n/a' }}</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No keyword gap export configured yet.</p>
            {% endif %}
          </div>
          <div class="mini-card">
            <h3>Suggested additions</h3>
            {% if competitive_intelligence.product_additions %}
              <ul>
                {% for item in competitive_intelligence.product_additions[:4] %}
                  <li>{{ item.suggested_product }}</li>
                {% endfor %}
              </ul>
            {% else %}
              <p>No product additions suggested yet.</p>
            {% endif %}
          </div>
        </div>
      </div>
      <div class="mini-card" style="margin-top: 12px;">
        <h3>Forecast</h3>
        <p>Projected revenue lift: {{ competitive_intelligence.forecast.projected_revenue_lift }} | Confidence: {{ competitive_intelligence.forecast.confidence }}</p>
        <p class="muted">Report file: <a href="{{ url_for('download_report', filename='forgeiq_competitive_intelligence.md') }}">forgeiq_competitive_intelligence.md</a></p>
      </div>
    </div>

    <div class="section two-col">
      <div class="panel">
        <h2>Recent blog drafts</h2>
        <div class="card-grid">
          {% for draft in blog_drafts %}
            <div class="mini-card">
              <h3>{{ draft.title }}</h3>
              <pre>{{ draft.excerpt }}</pre>
            </div>
          {% else %}
            <div class="mini-card"><p>No blog drafts found. Refresh content drafts to generate them.</p></div>
          {% endfor %}
        </div>
      </div>
      <div class="panel">
        <h2>Pinterest queue</h2>
        <div class="card-grid">
          {% for pin in pinterest_queue %}
            <div class="mini-card">
              <h3>{{ pin.title }}</h3>
              <pre>{{ pin.excerpt }}</pre>
            </div>
          {% else %}
            <div class="mini-card"><p>No Pinterest queue items found. Refresh content drafts to generate them.</p></div>
          {% endfor %}
        </div>
      </div>
    </div>

    <div class="section two-col">
      <div class="panel">
        <h2>Scheduled tasks</h2>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Cadence</th>
              <th>Last run</th>
              <th>Next run</th>
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
            {% endfor %}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <h2>Logs</h2>
        <div class="stack">
          <div class="mini-card">
            <h3>Recent log files</h3>
            <div class="file-list">
              {% for file in log_files %}
                <div class="file-item">
                  <a href="{{ url_for('download_log', filename=file.name) }}">{{ file.name }}</a>
                  <span>{{ file.modified }}</span>
                </div>
              {% else %}
                <div class="muted">No log files found.</div>
              {% endfor %}
            </div>
          </div>
          <div class="mini-card">
            <h3>Latest log tail</h3>
            <pre>{{ latest_log_tail }}</pre>
          </div>
        </div>
      </div>
    </div>

    <div class="section panel">
      <h2>Reports</h2>
      <div class="file-list">
        {% for file in report_files %}
          <div class="file-item">
            <a href="{{ url_for('download_report', filename=file.name) }}">{{ file.name }}</a>
            <span>{{ file.modified }} • {{ file.size_kb }} KB</span>
          </div>
        {% else %}
          <div class="muted">No reports found yet.</div>
        {% endfor %}
      </div>
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


def _load_approvals():
    if not os.path.exists(APPROVAL_STATE_FILE):
        return {"approved": [], "rejected": []}

    with open(APPROVAL_STATE_FILE, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _save_approvals(data):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(APPROVAL_STATE_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


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
    log_files = _list_files(LOG_DIR, limit=5)
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

    @app.post("/apply-approved")
    def apply_approved():
        queue, _, _ = _build_attention_queue()
        state = _load_approvals()
        selected = [rec for rec in queue if rec.get("product_id") in set(state.get("approved", []))]
        if selected:
            apply_recommendations(selected)
        scroll_y = request.form.get("scroll_y", "0")
        return redirect(url_for("index", scroll_y=scroll_y))

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
        if not os.path.exists(os.path.join(REPORTS_DIR, filename)):
            abort(404)
        return send_from_directory(REPORTS_DIR, filename, as_attachment=False)

    @app.get("/logs/<path:filename>")
    def download_log(filename):
        if not os.path.exists(os.path.join(LOG_DIR, filename)):
            abort(404)
        return send_from_directory(LOG_DIR, filename, as_attachment=False)

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
