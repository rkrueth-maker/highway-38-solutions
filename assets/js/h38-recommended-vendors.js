(function () {
  'use strict';
  // Highway 38 "Recommended local pros" block for tenant websites.
  // Optional and OFF by default: the block renders nothing until the
  // business owner turns Recommended Vendors ON in their Office (Settings →
  // Owner Controls). The vendor-directory function enforces that server-side;
  // this file only asks and renders. Test listings never appear here.
  var FN_URL = 'https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-vendor-directory';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var STYLE_ID = 'h38-rv-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.h38-rv{padding:56px 24px;background:#f5f8f5}',
      '.h38-rv-inner{max-width:1100px;margin:0 auto}',
      '.h38-rv h2{font-size:1.9rem;margin:0 0 6px}',
      '.h38-rv-sub{margin:0 0 26px;opacity:.8;max-width:640px}',
      '.h38-rv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}',
      '.h38-rv-card{background:#fff;border:1px solid rgba(20,40,30,.12);border-radius:14px;padding:20px}',
      '.h38-rv-card h3{margin:0 0 4px;font-size:1.1rem}',
      '.h38-rv-cat{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.65;margin-bottom:8px}',
      '.h38-rv-area{font-size:.9rem;margin:0 0 8px;opacity:.85}',
      '.h38-rv-blurb{font-size:.95rem;margin:0 0 12px}',
      '.h38-rv-call{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid rgba(20,40,30,.35);text-decoration:none;font-weight:700;margin-right:10px}',
      '.h38-rv-web{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;font-weight:600}',
      '.h38-rv-paid{font-size:.75rem;opacity:.7;margin-top:10px}',
      '.h38-rv-soon{font-size:1.05rem;opacity:.85;background:#fff;border:1px dashed rgba(20,40,30,.3);border-radius:14px;padding:22px}'
    ].join('');
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function render(box, data) {
    if (!data || data.enabled !== true) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    injectStyle();
    var partners = Array.isArray(data.partners) ? data.partners : [];
    var inner;
    if (!partners.length) {
      inner = '<div class="h38-rv-inner"><h2>Recommended local pros</h2>' +
        '<p class="h38-rv-sub">Suppliers and services we work with around here.</p>' +
        '<p class="h38-rv-soon">Coming soon — our recommended local partner list is on the way.</p></div>';
    } else {
      var cards = partners.map(function (p) {
        var phone = String(p.phone || '').replace(/[^+\d]/g, '');
        return '<article class="h38-rv-card">' +
          '<span class="h38-rv-cat">' + esc(p.category || 'Local pro') + '</span>' +
          '<h3>' + esc(p.name) + '</h3>' +
          (p.serviceArea ? '<p class="h38-rv-area">Serving ' + esc(p.serviceArea) + '</p>' : '') +
          (p.blurb ? '<p class="h38-rv-blurb">' + esc(p.blurb) + '</p>' : '') +
          '<div>' +
          (phone ? '<a class="h38-rv-call" href="tel:' + esc(phone) + '">Call ' + esc(p.phone) + '</a>' : '') +
          (p.website ? '<a class="h38-rv-web" href="' + esc(p.website) + '" target="_blank" rel="noopener">Website ↗</a>' : '') +
          '</div>' +
          (p.paidPlacement ? '<p class="h38-rv-paid">Paid placement' + (p.placementDisclosure ? ' — ' + esc(p.placementDisclosure) : '') + '</p>' : '') +
          '</article>';
      }).join('');
      inner = '<div class="h38-rv-inner"><h2>Recommended local pros</h2>' +
        '<p class="h38-rv-sub">Suppliers and services we work with around here, approved by Highway 38.</p>' +
        '<div class="h38-rv-grid">' + cards + '</div></div>';
    }
    box.innerHTML = inner;
    box.hidden = false;
  }

  function init() {
    var boxes = document.querySelectorAll('[data-h38-recommended-pros]');
    boxes.forEach(function (box) {
      var businessId = box.getAttribute('data-business') || '';
      box.hidden = true; // stays hidden unless the server says this business turned it on
      if (!businessId) return;
      fetch(FN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'publicList', businessId: businessId })
      }).then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (data) { render(box, data); })
        .catch(function () { box.hidden = true; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
