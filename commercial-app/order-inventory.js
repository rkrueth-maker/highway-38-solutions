/* ============================================================================
 * H38 Office — Order Inventory / Supplies guided flow — Phase 2 Owner Ease
 * ----------------------------------------------------------------------------
 * SCRIPT TAG (coordinator adds to index.html, AFTER inventory-checker.js):
 *   <script src="order-inventory.js"></script>
 *
 * EXPOSES: window.H38OrderInventory.start()
 *   Called from the Owner Home "Low stock" action card.
 *
 * DATA COLLECTIONS USED (read/write):
 *   priceBook            (read) — Item ID, Description, SKU, Reorder Point,
 *                                Purchase Cost, Unit of Measure
 *   inventoryTransactions(read) — Direction / Quantity (append-only ledger,
 *                                same on-hand math as renderInventory)
 *   inventoryAlerts      (read + write) — open low-stock alerts are marked
 *                                "Ordered" when the order goes through
 *   vendors              (read) — supplier picker (Vendor ID, Vendor Name,
 *                                Email, Phone)
 *   purchaseOrders       (write) — one order record: Sent via email / text,
 *                                or saved as an order list
 *   tasks                (write) — 5-day "check the order arrived" reminder
 *
 * EXISTING HELPERS USED (globals from app-01.js / app-02.js / app-19.js):
 *   records(), v(), rowId(), esc(), num(), money(), now(), newId(),
 *   pageHead(), openPage(), toast(), saveParity(), queueOperation(),
 *   empty(), pill(), optionRows(), state
 *
 * DESIGN SOURCE: ~/workspace/your_files/owner-ease-rebuild-design.md §3.2
 * RULES:
 *   - Manual mode always works; Kit is an optional reviewer (assists, never gates).
 *   - Nothing auto-sends: email opens a pre-filled mailto, text opens an sms:
 *     link, "just save as list" keeps it in the app. The owner always confirms.
 *   - Suggested quantities are pre-filled; owner can adjust +/-, uncheck items,
 *     or change supplier.
 * ============================================================================ */
(function () {
  'use strict';

  /* ---------------- local state ---------------- */
  var h38OI = {
    step: 1,
    items: [],        // low-stock items with suggested quantities
    checked: {},      // Item ID -> true
    qty: {},          // Item ID -> quantity (owner-adjustable)
    supplierId: '',   // vendors collection row id, or '' for typed name
    supplierName: '', // typed supplier name when not in the list
    sendMethod: 'list', // 'email' | 'sms' | 'list'
    kitAdvice: '',
    result: null      // {items, total, supplier, method} for the Done screen
  };

  /* ---------------- stock math (same as inventory-checker / renderInventory) ---------------- */

  function h38OIStockMap() {
    var stock = new Map();
    (records('inventoryTransactions') || []).forEach(function (row) {
      var id = v(row, 'Item ID');
      var qty = Math.abs(num(v(row, 'Quantity')));
      var dir = String(v(row, 'Direction')).toUpperCase();
      stock.set(id, (stock.get(id) || 0) + (dir === 'OUT' ? -qty : qty));
    });
    return stock;
  }

  function h38OILowStock() {
    var stock = h38OIStockMap();
    return (records('priceBook') || [])
      .map(function (item) {
        var itemId = v(item, 'Item ID');
        var onHand = stock.get(itemId) || 0;
        var reorderPoint = num(v(item, 'Reorder Point'));
        return { item: item, itemId: itemId, onHand: onHand, reorderPoint: reorderPoint };
      })
      .filter(function (x) { return x.reorderPoint > 0 && x.onHand <= x.reorderPoint; })
      .sort(function (a, b) { return (a.onHand / a.reorderPoint) - (b.onHand / b.reorderPoint); });
  }

  function h38OISuggestedQty(x) {
    var target = num(v(x.item, 'Reorder Quantity')) || (x.reorderPoint * 2);
    return Math.max(1, Math.ceil(target - x.onHand));
  }

  function h38OIUnitCost(x) {
    return num(v(x.item, 'Purchase Cost', 'Unit Cost', 'Last Cost', 'Cost'));
  }

  function h38OISelectedItems() {
    return h38OI.items.filter(function (x) { return h38OI.checked[x.itemId]; });
  }

  function h38OIOrderTotal() {
    return h38OISelectedItems().reduce(function (s, x) {
      return s + h38OI.qty[x.itemId] * h38OIUnitCost(x);
    }, 0);
  }

  function h38OISupplierName() {
    if (h38OI.supplierId) {
      var row = (records('vendors') || []).find(function (r) { return rowId(r, 'Vendor ID') === h38OI.supplierId; });
      return row ? String(v(row, 'Vendor Name') || '') : '';
    }
    return h38OI.supplierName;
  }

  /* ---------------- AI assist (optional, never gates) ---------------- */

  async function h38OIAskKit() {
    var btn = $('h38OIAskKit');
    if (btn) { btn.disabled = true; btn.textContent = 'Kit is reviewing…'; }
    try {
      if (!window.H38_AI_HANDOFF || typeof window.H38_AI_HANDOFF.runTask !== 'function')
        throw new Error('Kit review is not available right now.');
      var summary = h38OI.items.map(function (x) {
        return { description: v(x.item, 'Description'), sku: v(x.item, 'SKU'), onHand: x.onHand, reorderPoint: x.reorderPoint, suggested: h38OISuggestedQty(x) };
      });
      var result = await window.H38_AI_HANDOFF.runTask('reorder_review', {
        businessId: state.businessId, items: summary
      });
      var text = (result && (result.advice || result.summary || result.review)) || '';
      h38OI.kitAdvice = String(text).trim() || 'Kit reviewed the order and the suggested quantities look reasonable.';
    } catch (e) {
      h38OI.kitAdvice = 'Kit could not review this time (' + (e && e.message || e) + '). The suggested quantities are still fine to use — nothing is blocked.';
    }
    h38OIRenderStep1();
  }

  /* ---------------- Step 1: REVIEW ORDER ---------------- */

  function h38OIRenderStep1() {
    h38OI.items = h38OILowStock();
    h38OI.items.forEach(function (x) {
      if (!(x.itemId in h38OI.checked)) h38OI.checked[x.itemId] = true;
      if (!(x.itemId in h38OI.qty)) h38OI.qty[x.itemId] = h38OISuggestedQty(x);
    });
    var advice = h38OI.kitAdvice
      ? '<div class="notice"><strong>Kit’s review:</strong> ' + esc(h38OI.kitAdvice) + '</div>' : '';
    var body;
    if (!h38OI.items.length) {
      body = '<section class="card span12"><h2>✅ Stock looks good</h2><p class="muted">Nothing is at or below its reorder point right now. You can still place a general supply order.</p>' +
        '<div class="actions"><button id="h38OIGeneral">Start a general order</button>' +
        '<button class="secondary" data-open-page="inventory">Inventory page</button></div></section>';
    } else {
      var total = h38OIOrderTotal();
      body = '<section class="card span8"><h2>Restock Order</h2>' + advice +
        '<div class="list">' + h38OI.items.map(function (x) {
          var desc = esc(v(x.item, 'Description') || x.itemId);
          var unit = esc(v(x.item, 'Unit of Measure') || 'each');
          var cost = h38OIUnitCost(x);
          var q = h38OI.qty[x.itemId];
          var line = money(q * cost);
          return '<div class="row"><div class="row-top"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">' +
            '<input type="checkbox" data-h38oi-check="' + esc(x.itemId) + '" ' + (h38OI.checked[x.itemId] ? 'checked' : '') + ' style="width:22px;height:22px;margin-top:2px">' +
            '<span><strong>' + desc + '</strong><br><small class="muted">Have: ' + esc(String(x.onHand)) + ' ' + unit + ' · Reorder at: ' + esc(String(x.reorderPoint)) +
            (cost > 0 ? ' · Last price: ' + money(cost) + '/' + unit : '') + '</small></span></label>' +
            '<span><strong id="h38oiLine-' + esc(x.itemId) + '">' + line + '</strong></span></div>' +
            '<div class="row-actions" style="align-items:center">' +
            '<button type="button" class="secondary" data-h38oi-minus="' + esc(x.itemId) + '" style="min-width:44px">−</button>' +
            '<span id="h38oiQty-' + esc(x.itemId) + '" style="min-width:60px;text-align:center;font-weight:bold">' + esc(String(q)) + '</span>' +
            '<button type="button" class="secondary" data-h38oi-plus="' + esc(x.itemId) + '" style="min-width:44px">+</button></div></div>';
        }).join('') + '</div>' +
        '<div class="stats" style="margin-top:12px"><div class="stat"><strong id="h38OIItemCount">' + h38OISelectedItems().length + '</strong><span>Items selected</span></div>' +
        '<div class="stat"><strong id="h38OITotal">' + money(total) + '</strong><span>Est. total</span></div></div>' +
        '<div class="actions" style="margin-top:12px"><button id="h38OIContinue">Place Order →</button>' +
        '<button type="button" class="secondary" data-open-page="inventory">Inventory page</button></div></section>' +
        '<section class="card span4"><h2>Supplier</h2><label>Choose supplier</label>' +
        '<select id="h38OISupplier"><option value="">Type a name below…</option>' +
        (records('vendors') || []).map(function (r) {
          var id = rowId(r, 'Vendor ID');
          return '<option value="' + esc(id) + '" ' + (h38OI.supplierId === id ? 'selected' : '') + '>' + esc(v(r, 'Vendor Name') || id) + '</option>';
        }).join('') + '</select>' +
        '<label>Or type supplier name</label><input id="h38OISupplierName" placeholder="e.g. Menards" value="' + esc(h38OI.supplierName) + '">' +
        '<p class="muted small">Quantities are suggestions from your reorder points. Change anything — nothing is sent yet.</p></section>';
    }
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Order Inventory — Review', 'Confirm what to order and from whom.',
      h38OI.items.length ? '<button class="secondary" id="h38OIAskKit">Ask Kit to check quantities</button>' : '') +
      '<div class="grid">' + body + '</div>' + '</div>';
    var ask = $('h38OIAskKit'); if (ask) ask.onclick = h38OIAskKit;
    var gen = $('h38OIGeneral'); if (gen) gen.onclick = function () { toast('Add reorder points on the Inventory page to enable restock suggestions.', false); openPage('inventory'); };
    document.querySelectorAll('[data-h38oi-check]').forEach(function (box) {
      box.onchange = function () { h38OI.checked[box.getAttribute('data-h38oi-check')] = box.checked; h38OIRefreshTotals(); };
    });
    document.querySelectorAll('[data-h38oi-plus]').forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-h38oi-plus'); h38OI.qty[id] = h38OI.qty[id] + 1; h38OIRefreshRow(id); };
    });
    document.querySelectorAll('[data-h38oi-minus]').forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-h38oi-minus'); h38OI.qty[id] = Math.max(1, h38OI.qty[id] - 1); h38OIRefreshRow(id); };
    });
    var sup = $('h38OISupplier');
    if (sup) sup.onchange = function () { h38OI.supplierId = sup.value; };
    var supName = $('h38OISupplierName');
    if (supName) supName.oninput = function () { h38OI.supplierName = supName.value.trim(); if (supName.value.trim()) h38OI.supplierId = ''; };
    var cont = $('h38OIContinue');
    if (cont) cont.onclick = function () {
      h38OI.supplierId = ($('h38OISupplier') || {}).value || '';
      h38OI.supplierName = (($('h38OISupplierName') || {}).value || '').trim();
      var supplier = h38OISupplierName();
      var chosen = h38OISelectedItems();
      if (!chosen.length) { toast('Select at least one item to order.', true); return; }
      if (!supplier) { toast('Pick or type a supplier name.', true); return; }
      h38OI.step = 2; h38OIRenderStep2();
    };
  }

  function h38OIRefreshRow(itemId) {
    var x = h38OI.items.find(function (i) { return i.itemId === itemId; });
    if (!x) return;
    var qEl = $('h38oiQty-' + itemId), lEl = $('h38oiLine-' + itemId);
    if (qEl) qEl.textContent = String(h38OI.qty[itemId]);
    if (lEl) lEl.textContent = money(h38OI.qty[itemId] * h38OIUnitCost(x));
    h38OIRefreshTotals();
  }

  function h38OIRefreshTotals() {
    var c = $('h38OIItemCount'), t = $('h38OITotal');
    if (c) c.textContent = String(h38OISelectedItems().length);
    if (t) t.textContent = money(h38OIOrderTotal());
  }

  /* ---------------- Step 2: CONFIRM (how to send) ---------------- */

  function h38OIOrderText() {
    var supplier = h38OISupplierName();
    var biz = (state.snapshot && state.snapshot.business) || {};
    var bizName = String(v(biz, 'Name', 'Business Name') || 'Our business');
    var lines = h38OISelectedItems().map(function (x) {
      var unit = String(v(x.item, 'Unit of Measure') || 'each');
      return '- ' + String(v(x.item, 'Description') || x.itemId) +
        (v(x.item, 'SKU') ? ' (' + String(v(x.item, 'SKU')) + ')' : '') +
        ': ' + h38OI.qty[x.itemId] + ' ' + unit +
        (h38OIUnitCost(x) > 0 ? ' @ ' + money(h38OIUnitCost(x)) : '');
    });
    return 'Purchase order from ' + bizName + '\nTo: ' + supplier + '\n\n' + lines.join('\n') +
      '\n\nEstimated total: ' + money(h38OIOrderTotal()) + '\nPlease confirm availability and delivery time. Thank you!';
  }

  function h38OIRenderStep2() {
    var chosen = h38OISelectedItems();
    var total = h38OIOrderTotal();
    var supplier = h38OISupplierName();
    var vendorRow = h38OI.supplierId
      ? (records('vendors') || []).find(function (r) { return rowId(r, 'Vendor ID') === h38OI.supplierId; })
      : null;
    var contact = vendorRow ? (String(v(vendorRow, 'Email') || '') || String(v(vendorRow, 'Phone') || '') || 'No email/phone on file') : 'No vendor record — you will type or paste the order yourself';
    var methodCard = function (value, title, desc) {
      return '<label class="row" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin-bottom:8px">' +
        '<input type="radio" name="h38oiMethod" value="' + value + '" ' + (h38OI.sendMethod === value ? 'checked' : '') + ' style="width:22px;height:22px;margin-top:2px">' +
        '<span><strong>' + title + '</strong><br><small class="muted">' + desc + '</small></span></label>';
    };
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Order Inventory — Send', 'Review and send the order.') +
      '<div class="grid"><section class="card span8"><h2>Send this order?</h2>' +
      '<div class="stats"><div class="stat"><strong>' + chosen.length + '</strong><span>Items</span></div>' +
      '<div class="stat"><strong>' + money(total) + '</strong><span>Est. total</span></div></div>' +
      '<p><strong>To:</strong> ' + esc(supplier) + '<br><small class="muted">' + esc(contact) + '</small></p>' +
      '<div class="list">' + chosen.map(function (x) {
        return '<div class="row"><div class="row-top"><strong>' + esc(v(x.item, 'Description') || x.itemId) + '</strong><span>' + esc(String(h38OI.qty[x.itemId])) + ' × ' + (h38OIUnitCost(x) > 0 ? money(h38OIUnitCost(x)) : '—') + '</span></div></div>';
      }).join('') + '</div>' +
      '<h2>How to send</h2>' +
      methodCard('email', '✉️ Email order', 'Opens a pre-filled email to the supplier. You review and hit send in your mail app.') +
      methodCard('sms', '💬 Text order (SMS)', 'Opens a pre-filled text. You review and hit send on your phone.') +
      methodCard('list', '📋 Just save as list', 'Keeps a printable order list in the app — you call them yourself.') +
      '<div class="notice warn"><strong>Nothing is sent automatically.</strong> Email and text only open pre-filled drafts on your device. You review and send.</div>' +
      '<pre id="h38OITextPreview" style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px;font-size:13px">' + esc(h38OIOrderText()) + '</pre>' +
      '<div class="row-actions"><button type="button" class="secondary" id="h38OICopy">Copy order text</button></div>' +
      '<div class="actions" style="margin-top:12px"><button id="h38OISend">Send Order</button>' +
      '<button type="button" class="secondary" id="h38OIBack">← Back</button></div></section>' +
      '<section class="card span4"><h2>After you send</h2><p class="muted small">We save the order in your books, mark the stock alerts as ordered, and set a reminder in 5 days to check it arrived.</p></section></div>' + '</div>';
    document.querySelectorAll('input[name="h38oiMethod"]').forEach(function (radio) {
      radio.onchange = function () { h38OI.sendMethod = radio.value; };
    });
    $('h38OICopy').onclick = function () {
      var t = h38OIOrderText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () { toast('Order text copied.'); }, function () { toast('Copy failed — select the text manually.', true); });
      } else { toast('Copy not supported here — select the text manually.', true); }
    };
    $('h38OIBack').onclick = function () { h38OI.step = 1; h38OIRenderStep1(); };
    $('h38OISend').onclick = h38OISendOrder;
  }

  /* ---------------- Send: write records + open drafts ---------------- */

  async function h38OISendOrder() {
    var chosen = h38OISelectedItems();
    if (!chosen.length) { toast('No items selected.', true); return; }
    var supplier = h38OISupplierName();
    var method = h38OI.sendMethod;
    var orderText = h38OIOrderText();
    var total = h38OIOrderTotal();
    var methodLabel = method === 'email' ? 'Sent via email' : method === 'sms' ? 'Sent via text (SMS)' : 'Order list — owner will call';
    var confirmed = confirm('Send this order to ' + supplier + '? ' + chosen.length + ' items, ' + money(total) + '. ' +
      (method === 'list' ? 'This saves the order as a list — nothing is sent automatically.'
        : 'This opens a pre-filled ' + (method === 'email' ? 'email' : 'text') + ' on your device. You review and send.'));
    if (!confirmed) return;
    try {
      // 1. Save the purchase order record (draft/pending — nothing purchased).
      var poId = newId('PURCHASE');
      var po = {
        'Purchase Order ID': poId, 'Business ID': state.businessId,
        'Vendor ID': h38OI.supplierId, 'Vendor Name': supplier, 'Job ID': '',
        'Order Number': 'PO-' + Date.now(), 'Order Date': new Date().toISOString().slice(0, 10),
        'Description': chosen.map(function (x) { return String(v(x.item, 'Description') || x.itemId) + ' ×' + h38OI.qty[x.itemId]; }).join('; '),
        'Items JSON': JSON.stringify(chosen.map(function (x) {
          return { itemId: x.itemId, description: String(v(x.item, 'Description') || ''), sku: String(v(x.item, 'SKU') || ''), quantity: h38OI.qty[x.itemId], unitCost: h38OIUnitCost(x), unit: String(v(x.item, 'Unit of Measure') || 'each') };
        })),
        'Subtotal': Math.round(total * 100) / 100, 'Tax': 0, 'Total': Math.round(total * 100) / 100,
        'Status': methodLabel, 'Approval Status': 'Owner Approval Required',
        'Created By': (state.snapshot && state.snapshot.user && state.snapshot.user.userId) || '',
        'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
      };
      await saveParity('purchaseOrders', 'Purchase Order', poId, po, 'purchaseOrders', ['Purchase Order ID']);
      // 2. Mark open low-stock alerts for these items as Ordered.
      for (var i = 0; i < chosen.length; i++) {
        var openAlerts = (records('inventoryAlerts') || [])
          .filter(function (r) { return v(r, 'Item ID') === chosen[i].itemId && String(v(r, 'Status')).toUpperCase() === 'OPEN'; })
          .sort(function (a, b) { return String(v(b, 'Created Time')).localeCompare(String(v(a, 'Created Time'))); });
        if (openAlerts.length) {
          var updated = Object.assign({}, openAlerts[0], {
            'Status': 'Ordered', 'Updated Time': now(), 'Record Version': num(v(openAlerts[0], 'Record Version')) + 1
          });
          await queueOperation('SAVE_ENTITY', 'Inventory Alert', v(openAlerts[0], 'Alert ID'),
            { entity: 'inventoryAlerts', record: updated },
            { collection: 'inventoryAlerts', record: updated, idKeys: ['Alert ID'] });
        }
      }
      // 3. 5-day "did it arrive?" reminder task for the owner.
      var due = new Date(); due.setDate(due.getDate() + 5);
      var taskId = newId('TASK');
      var taskRecord = {
        'Task ID': taskId, 'Business ID': state.businessId, 'Job ID': '',
        'Task Title': 'Check that the ' + supplier + ' order arrived',
        'Assigned User ID': (state.snapshot && state.snapshot.user && state.snapshot.user.userId) || '',
        'Status': 'Open', 'Priority': 'Normal',
        'Due Time': due.toISOString().slice(0, 10),
        'Notes': 'Auto-created from the guided Order Inventory flow (' + po['Order Number'] + '). No message was sent automatically.',
        'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
      };
      await queueOperation('SAVE_TASK', 'Task', taskId, { entity: 'tasks', record: taskRecord },
        { collection: 'tasks', record: taskRecord, idKeys: ['Task ID'] });
      // 4. Open the pre-filled draft on the owner's device (mailto / sms).
      if (method === 'email' || method === 'sms') {
        var vendorRow = h38OI.supplierId
          ? (records('vendors') || []).find(function (r) { return rowId(r, 'Vendor ID') === h38OI.supplierId; })
          : null;
        if (method === 'email') {
          var email = vendorRow ? String(v(vendorRow, 'Email') || '') : '';
          var subject = encodeURIComponent('Purchase order — ' + po['Order Number']);
          window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + subject + '&body=' + encodeURIComponent(orderText);
          if (!email) toast('No email on file for this supplier — the order text is below; copy it into your mail app.');
        } else {
          var phone = vendorRow ? String(v(vendorRow, 'Phone') || '') : '';
          window.location.href = 'sms:' + encodeURIComponent(phone) + '?body=' + encodeURIComponent(orderText);
          if (!phone) toast('No phone on file for this supplier — the order text is below; copy it into your texts.');
        }
      }
      h38OI.result = { items: chosen, total: total, supplier: supplier, method: methodLabel, orderNumber: po['Order Number'] };
      h38OI.step = 3; h38OIRenderStep3();
      toast('Order recorded.');
    } catch (e) { toast('Could not send the order: ' + (e && e.message || e), true); }
  }

  /* ---------------- Step 3: DONE ---------------- */

  function h38OIRenderStep3() {
    var r = h38OI.result;
    var verb = r.method === 'Order list — owner will call' ? 'saved as a list' : 'sent';
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Order Inventory — Done', 'Order ' + verb + '.') +
      '<div class="grid"><section class="card span8"><h2>✅ Order ' + esc(verb) + (r.method === 'Order list — owner will call' ? '' : ' to ' + esc(r.supplier)) + '</h2>' +
      '<div class="list">' + r.items.map(function (x) {
        return '<div class="row"><div class="row-top"><strong>' + esc(v(x.item, 'Description') || x.itemId) + '</strong><span>' + esc(String(h38OI.qty[x.itemId])) + ' ' + esc(v(x.item, 'Unit of Measure') || 'each') + '</span></div></div>';
      }).join('') + '</div>' +
      '<div class="stats" style="margin-top:12px"><div class="stat"><strong>' + money(r.total) + '</strong><span>Est. total</span></div>' +
      '<div class="stat"><strong>' + esc(r.orderNumber) + '</strong><span>Order #</span></div></div>' +
      '<p class="muted">We saved the order in your books, marked the stock alerts as ordered, and set a reminder in 5 days to check it arrived.</p>' +
      '<div class="actions"><button id="h38OIDone">Done → Home</button></div></section></div>' + '</div>';
    $('h38OIDone').onclick = function () { openPage('today'); };
  }

  /* ---------------- public entry ---------------- */

  function h38OIStart() {
    if (!state.businessId) { toast('Open a business first.', true); return; }
    h38OI.step = 1;
    h38OI.items = [];
    h38OI.checked = {};
    h38OI.qty = {};
    h38OI.supplierId = '';
    h38OI.supplierName = '';
    h38OI.sendMethod = 'list';
    h38OI.kitAdvice = '';
    h38OI.result = null;
    h38OIRenderStep1();
  }

  window.H38OrderInventory = { start: h38OIStart };
})();
