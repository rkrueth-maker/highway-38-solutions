"""Phase D fix F1 (D1) — durable pin for the shared screen-header anchor.

The quote send button (and a family of quote/status injectors) anchor to
'.page-tools'. WS4's H38Flow.screenHeader() originally emitted only
'.h38-screen-head__actions', so every '.page-tools' dependent silently
found no anchor on adopted screens and the send button vanished. The fix
is at the foundation: screenHeader's actions container carries BOTH
classes, and the app-02.js pageHead shim does the same. These tests pin
that contract so a future header refactor cannot regress it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLOW = (ROOT / "commercial-app" / "h38-flow-helpers.js").read_text(encoding="utf-8")
APP02 = (ROOT / "commercial-app" / "app-02.js").read_text(encoding="utf-8")
DELIVERY = (ROOT / "commercial-app" / "supabase-quote-delivery.js").read_text(encoding="utf-8")


def test_screen_header_actions_container_carries_page_tools():
    # screenHeader() is the single emitter of the WS4 header; its actions
    # container must carry the legacy '.page-tools' anchor class too.
    assert 'class="h38-screen-head__actions page-tools"' in FLOW


def test_pagehead_shim_actions_container_carries_page_tools():
    assert 'class="h38-screen-head__actions page-tools"' in APP02


def test_quote_delivery_still_anchors_on_page_tools():
    # supabase-quote-delivery.js keeps '.page-tools' as its primary anchor
    # for both the send button and its status node.
    assert "document.querySelector('.page-tools')" in DELIVERY
    assert "h38ApproveSendQuoteButton" in DELIVERY
