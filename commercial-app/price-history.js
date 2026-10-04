/* H38 Price History — log every price book cost/price change and show per-item trends.
 * Owner Controls toggle: 'price_history' (default ON, internal-only feature).
 * The Office app has no other in-app priceBook edit path (priceBook is read-only
 * in the quote builder / inventory views; seeds come from example data), so the
 * manual "Record price change" form on the Inventory page is the recording path.
 * logPriceChange() is also callable directly so a future edit UI can hook it. */

(function () {
  'use strict';

  // Register the Owner Controls toggle without touching owner-controls.js.
  try {
    var oc = window.H38OwnerControls;
    var T = {
      id: 'price_history',
      title: 'Price history tracking',
      desc: 'Log every price book cost/price change and show per-item price trends on the Inventory page.',
      icon: '📈',
      default: true,
      category: 'Inventory'
    };
    if (oc && oc.FEATURES && !oc.FEATURES.some(function (f) { return f && f.id === T.id; })) oc.FEATURES.push(T);
  } catch (e) { /* owner-controls not loaded yet; gated at render time instead */ }

  function priceHistoryEnabled() {
    try {
      var o = window.H38OwnerControls;
      return !!(o && typeof o.isEnabled === 'function' && o.isEnabled('price_history'));
    } catch (e) { return false; }
  }

  /**
   * Log a price change for a priceBook item.
   * itemId: 'Item ID' value. old* are current values before the change, new* after.
   */
  async function logPriceChange(itemId, oldPurchase, newPurchase, oldSell, newSell, reason) {
    if (!priceHistoryEnabled()) throw new Error('Price history tracking is off (Owner Controls).');
    if (!itemId) throw new Error('Pick an item first.');
    var items = (typeof records === 'function') ? records('priceBook') : [];
    var item = items.find(function (r) { return String(rowId(r, 'Item ID')) === String(itemId); }) || null;
    var id = newId('PHIST');
    var record = {
      'History ID': id,
      'Business ID': state.businessId,
      'Item ID': itemId,
      'SKU': item ? v(item, 'SKU') : '',
      'Description': item ? v(item, 'Description') : '',
      'Old Purchase Cost': num(oldPurchase),
      'New Purchase Cost': num(newPurchase),
      'Old Selling Price': num(oldSell),
      'New Selling Price': num(newSell),
      'Changed By': (state.snapshot && state.snapshot.user) ? state.snapshot.user.userId : '',
      'Changed Time': now(),
      'Reason': reason || '',
      'Record Version': 1
    };
    await queueOperation('LOG_PRICE_CHANGE', 'Price History', id, { record: record },
      { collection: 'priceHistory', record: record, idKeys: ['History ID'] });
    return record;
  }

  function pctChange(oldV, newV) {
    oldV = num(oldV); newV = num(newV);
    if (!oldV) return '';
    var pct = ((newV - oldV) / oldV) * 100;
    var tone = pct > 0 ? 'bad' : (pct < 0 ? 'good' : '');
    return '<span class="' + tone + '">' + (pct > 0 ? '+' : '') + pct.toFixed(1) + '%</span>';
  }

  function historyRows(itemId) {
    var rows = (typeof records === 'function') ? records('priceHistory') : [];
    return rows
      .filter(function (r) { return String(v(r, 'Item ID')) === String(itemId); })
      .sort(function (a, b) { return String(v(b, 'Changed Time') || '').localeCompare(String(v(a, 'Changed Time') || '')); });
  }

  function priceHistoryCard() {
    if (!priceHistoryEnabled()) return '';
    var items = (typeof records === 'function') ? records('priceBook') : [];
    var selectId = 'phItemSelect', listId = 'phHistoryList';

    function listHtml(itemId) {
      var rows = historyRows(itemId);
      if (!rows.length) return '<p class="muted small">No recorded price changes for this item yet. Use the form below to record one.</p>';
      return '<div class="list">' + rows.map(function (r) {
        return '<div class="row"><div class="row-top"><strong>Cost ' + money(v(r, 'Old Purchase Cost')) + ' → ' + money(v(r, 'New Purchase Cost')) + ' ' + pctChange(v(r, 'Old Purchase Cost'), v(r, 'New Purchase Cost')) + '</strong></div>'
          + '<div class="row-top"><span>Sell ' + money(v(r, 'Old Selling Price')) + ' → ' + money(v(r, 'New Selling Price')) + ' ' + pctChange(v(r, 'Old Selling Price'), v(r, 'New Selling Price')) + '</span></div>'
          + '<small>' + esc(v(r, 'Changed By') || '') + ' · ' + dateTime(v(r, 'Changed Time')) + (v(r, 'Reason') ? ' · ' + esc(v(r, 'Reason')) : '') + '</small></div>';
      }).join('') + '</div>';
    }

    // Expose a refresh hook so the item selector can redraw the list without a full page re-render.
    window.__h38PriceHistoryList = function (itemId) {
      var el = document.getElementById(listId);
      if (el) el.innerHTML = listHtml(itemId);
    };

    var html = '<section class="card span12"><h2>📈 Price history</h2>'
      + '<p class="muted small">Per-item price book trends. Every recorded change logs who, when, and why.</p>'
      + '<label>Item</label><select id="' + selectId + '">' + optionRows(items, ['Item ID'], function (row) { return v(row, 'SKU') + ' — ' + v(row, 'Description'); }, 'Select item') + '</select>'
      + '<div id="' + listId + '">' + listHtml(items.length ? rowId(items[0], 'Item ID') : '') + '</div>'
      + '<h3>Record price change</h3>'
      + '<form id="priceHistoryForm"><div class="two">'
      + '<div><label>Item</label><select name="itemId" required>' + optionRows(items, ['Item ID'], function (row) { return v(row, 'SKU') + ' — ' + v(row, 'Description'); }, 'Select item') + '</select></div>'
      + '<div><label>Reason</label><input name="reason" placeholder="e.g. Supplier increase"></div>'
      + '</div><div class="two">'
      + '<div><label>New purchase cost</label><input name="newPurchase" type="number" step="0.01" required></div>'
      + '<div><label>New selling price</label><input name="newSell" type="number" step="0.01" required></div>'
      + '</div><div class="actions"><button>Record price change</button></div></form></section>';

    // Wire up after insertion (card HTML is injected by renderInventory).
    setTimeout(function () {
      try {
        var sel = document.getElementById(selectId);
        if (sel && !sel.dataset.phBound) {
          sel.dataset.phBound = '1';
          if (items.length) sel.value = rowId(items[0], 'Item ID');
          sel.onchange = function () { window.__h38PriceHistoryList(sel.value); };
          window.__h38PriceHistoryList(sel.value);
        }
        bindForm('priceHistoryForm', async function (data, form) {
          var itemId = data.itemId;
          var cur = (typeof records === 'function' ? records('priceBook') : [])
            .find(function (r) { return String(rowId(r, 'Item ID')) === String(itemId); });
          var oldPurchase = cur ? num(v(cur, 'Purchase Cost')) : 0;
          var oldSell = cur ? num(v(cur, 'Selling Price')) : 0;
          var rec = await logPriceChange(itemId, oldPurchase, num(data.newPurchase), oldSell, num(data.newSell), data.reason);
          toast('Price change recorded for ' + (v(rec, 'SKU') || itemId) + '.');
          form.reset();
          var s2 = document.getElementById(selectId);
          if (s2) { s2.value = itemId; window.__h38PriceHistoryList(itemId); }
        });
      } catch (e) { /* render context without DOM helpers */ }
    }, 0);
    return html;
  }

  window.H38PriceHistory = {
    logPriceChange: logPriceChange,
    priceHistoryCard: priceHistoryCard,
    priceHistoryEnabled: priceHistoryEnabled,
    BUILD: '20261004-price-history-1'
  };
})();
