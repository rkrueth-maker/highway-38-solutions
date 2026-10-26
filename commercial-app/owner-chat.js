/* H38 Owner Chat — build 20261026-owner-chat-3
 *
 * The owner's live chat with their Office (Kit). It lives on the existing
 * 'ai' page (Kit's Workspace, the chat at the bottom) — no new page, nav
 * tree, shell, or AI launcher. It upgrades that chat in place:
 *
 *  - Messages persist server-side in business_records, collection
 *    'ownerChatMessages', one thread per business + user. The server
 *    thread is the source of truth, so a conversation started on the
 *    phone continues at the desk (and survives reloads) with nothing lost.
 *  - Sending writes the owner's message row, then submits an
 *    ai_handoff_tasks task (task_type 'owner_chat') on the existing Kit
 *    rails. The 1-minute poller answers it: Kit reads this tenant's
 *    records, carries out the record changes the owner explicitly
 *    instructs, and confirms customer-facing sends / money actions in the
 *    thread first. Kit's reply is written back as a thread row and this
 *    module renders it from the thread.
 *  - The UI always shows a "working on it" state while a reply is in
 *    flight — never a dead screen. If the handoff rail is unavailable the
 *    chat says so plainly in the thread and the rest of the Office is
 *    untouched; when this module is off or the device is offline, the
 *    legacy Ask Hank path in app-16.js runs exactly as before.
 *
 * Enablement: business_module_settings module_key 'owner_chat', read
 * through the canonical window.H38ModuleVisible('ownerChat') gate
 * (PAGE_SERVER_MODULE_KEYS in owner-controls.js). No row = visible,
 * matching every other module.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD): route 'ai' (existing,
 * on-demand; nothing here loads at startup or touches Today). Server
 * owners: business_records + ai_handoff_tasks (existing). First-load
 * read: at most 200 thread rows for this business, filtered to this
 * thread client-side. Cache: none — TTL 0; the thread is re-read from
 * the server on every page open, which is what makes cross-view
 * continuity exact. Writes: owner message rows + handoff tasks only.
 * Failure behavior: plain in-thread error, Office unaffected.
 */
(function () {
  'use strict';

  var BUILD = '20261026-owner-chat-3';
  var COLLECTION = 'ownerChatMessages';
  var MAX_THREAD_ROWS = 200;
  var WATCH_SOFT_CAP_MS = 15 * 60 * 1000;

  var runtime = {
    threadId: '',
    businessId: '',
    messages: [],      // [{id, role:'user'|'assistant', body, createdAt, taskId, inReplyTo}]
    pendingTasks: [],  // [{taskId, messageId, startedAt, soft}]
    tickTimer: null,
    installed: false
  };

  /* ---------- small helpers ---------- */

  function st() { try { return window.state || null; } catch (e) { return null; } }

  function escText(s) {
    s = String(s == null ? '' : s);
    if (typeof window.esc === 'function') return window.esc(s);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function errText(e) {
    var m = (e && (e.message || e.code)) ? String(e.message || e.code) : String(e || 'unknown error');
    return m.slice(0, 160);
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function currentUser() {
    var s = st();
    return (s && s.snapshot && s.snapshot.user) || {};
  }
  function userId() { var u = currentUser(); return String(u.id || u.userId || u.authUserId || ''); }
  function userName() { var u = currentUser(); return String(u.displayName || u.name || u.email || 'Owner'); }
  function userRole() { var u = currentUser(); return String(u.roleName || u.roleId || ''); }
  function businessId() { var s = st(); return String((s && s.businessId) || ''); }

  function sharedClient() {
    try { return window.H38_SUPABASE_SHARED_CLIENT.ensure(); } catch (e) { return null; }
  }

  /* ---------- enablement ---------- */

  function enabled() {
    try {
      if (!businessId()) return false;
      if (!st() || !st().snapshot) return false;
      if (typeof window.H38ModuleVisible === 'function' && window.H38ModuleVisible('ownerChat') === false) return false;
      if (!window.H38_AI_HANDOFF || typeof window.H38_AI_HANDOFF.submitTask !== 'function') return false;
      if (!window.H38_SUPABASE_SHARED_CLIENT || typeof window.H38_SUPABASE_SHARED_CLIENT.ensure !== 'function') return false;
      return true;
    } catch (e) { return false; }
  }

  /* askAi() in app-16.js routes here when this returns true; otherwise the
   * legacy Ask Hank behavior runs unchanged (offline / module off). */
  function handlesWorkspaceChat() {
    return enabled() && navigator.onLine !== false;
  }

  /* ---------- thread state ---------- */

  function ensureThread() {
    var bid = businessId();
    var uid = userId() || 'owner';
    var tid = 'ownerchat-' + bid.slice(0, 8) + '-' + String(uid).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
    if (runtime.threadId !== tid) {
      runtime.threadId = tid;
      runtime.businessId = bid;
      runtime.messages = [];
      runtime.pendingTasks = [];
      runtime.emptyRetried = false;
    }
    return tid;
  }

  function rowToMessage(row) {
    var p = row.payload || {};
    return {
      id: String(p['Message ID'] || row.record_key || ''),
      role: p['Role'] === 'kit' ? 'assistant' : 'user',
      body: String(p['Body'] || ''),
      createdAt: String(p['Created Time'] || row.created_at || ''),
      taskId: String(p['Task ID'] || ''),
      inReplyTo: String(p['In Reply To'] || '')
    };
  }

  async function loadThread() {
    ensureThread();
    var client = sharedClient();
    if (!client) throw new Error('Supabase client unavailable.');
    var res = await client.from('business_records')
      .select('record_key,payload,created_at')
      .eq('business_id', runtime.businessId)
      .eq('collection', COLLECTION)
      .eq('record_status', 'active')
      .order('created_at', { ascending: true })
      .limit(MAX_THREAD_ROWS);
    if (res.error) throw res.error;
    var rows = (res.data || []).filter(function (r) {
      return r.payload && r.payload['Thread ID'] === runtime.threadId;
    });
    runtime.messages = rows.map(rowToMessage);
    mirrorState();
    return runtime.messages;
  }

  function pendingText() {
    if (!runtime.pendingTasks.length) return '';
    var first = runtime.pendingTasks[0];
    var secs = Math.max(0, Math.round((Date.now() - first.startedAt) / 1000));
    if (first.soft) return 'Kit is still working on it — the reply will appear right here in this thread when it is ready.';
    return 'Kit is working on it… (' + secs + 's)';
  }

  /* Keep state.aiChat mirroring the server thread so any workspace
   * re-render (which draws from state.aiChat) shows the same thread,
   * including the in-flight "working on it" bubble. */
  function mirrorState() {
    var s = st();
    if (!s) return;
    var list = runtime.messages.map(function (m) { return { role: m.role, body: m.body }; });
    if (runtime.pendingTasks.length) list.push({ role: 'assistant', body: pendingText(), pending: true });
    s.aiChat = list;
  }

  var WELCOME = 'This is your thread with Kit. Ask about jobs, the schedule, customers, quotes or money — or give an instruction and Kit will carry it out and confirm it here.';

  function renderBubbles() {
    mirrorState();
    var box = document.getElementById('kwAiChat');
    if (!box) return;
    var s = st();
    var list = (s && s.aiChat) || [];
    box.innerHTML = list.length
      ? list.map(function (m) {
          return '<div class="ai-bubble ' + escText(m.role) + '">' + escText(m.body) + '</div>';
        }).join('')
      : '<div class="ai-bubble assistant">' + escText(WELCOME) + '</div>';
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- sending ---------- */

  async function insertMessage(role, body, extra) {
    var client = sharedClient();
    if (!client) throw new Error('Chat storage is unavailable right now.');
    var now = new Date().toISOString();
    var id = uuid();
    var payload = {
      'Message ID': id,
      'Thread ID': runtime.threadId,
      'Role': role,
      'Body': body,
      'User ID': userId(),
      'User Name': userName(),
      'Created Time': now,
      'Source': 'owner-chat'
    };
    if (extra) { for (var k in extra) payload[k] = extra[k]; }
    var row = {
      business_id: runtime.businessId,
      collection: COLLECTION,
      record_key: id,
      payload: payload,
      record_status: 'active'
    };
    var uid = userId();
    if (/^[0-9a-fA-F-]{36}$/.test(uid)) row.created_by = uid;
    var res = await client.from('business_records').insert(row);
    if (res.error) throw res.error;
    return { id: id, role: role === 'kit' ? 'assistant' : 'user', body: body, createdAt: now };
  }

  function handoffErrorText(e) {
    if (e && e.code === 'HANDOFF_NOT_DEPLOYED') return 'the chat service is not switched on for this Office yet';
    return errText(e);
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    ensureThread();
    var localMsg = { id: 'local-' + Date.now(), role: 'user', body: text, createdAt: new Date().toISOString(), taskId: '', inReplyTo: '' };
    runtime.messages.push(localMsg);
    renderBubbles();

    var saved = null;
    try {
      saved = await insertMessage('owner', text);
      localMsg.id = saved.id;
    } catch (e) {
      runtime.messages.push({ id: 'err-' + Date.now(), role: 'assistant', body: 'That message could not be saved to your thread (' + errText(e) + '). Nothing was sent to Kit. Check your connection and try again — the rest of the Office is unaffected.', createdAt: new Date().toISOString(), taskId: '', inReplyTo: '' });
      renderBubbles();
      return;
    }

    var pending = { taskId: null, messageId: saved.id, startedAt: Date.now(), soft: false };
    runtime.pendingTasks.push(pending);
    renderBubbles();
    startTicker();

    var task;
    try {
      task = await window.H38_AI_HANDOFF.submitTask('owner_chat', {
        businessId: runtime.businessId,
        threadId: runtime.threadId,
        messageId: saved.id,
        text: text,
        ownerUserId: userId(),
        ownerName: userName(),
        role: userRole()
      });
    } catch (e) {
      removePending(pending);
      runtime.messages.push({ id: 'err-' + Date.now(), role: 'assistant', body: 'Kit could not be reached just now (' + handoffErrorText(e) + '). Your message is saved in this thread — send it again in a moment and Kit will pick it up.', createdAt: new Date().toISOString(), taskId: '', inReplyTo: '' });
      renderBubbles();
      return;
    }
    pending.taskId = task.id;
    watchTask(pending);
  }

  /* ---------- reply watching ---------- */

  function removePending(pending) {
    runtime.pendingTasks = runtime.pendingTasks.filter(function (p) { return p !== pending; });
    if (!runtime.pendingTasks.length) stopTicker();
  }

  function startTicker() {
    if (runtime.tickTimer) return;
    runtime.tickTimer = setInterval(function () {
      if (!runtime.pendingTasks.length) { stopTicker(); return; }
      if (document.getElementById('kwAiChat')) renderBubbles();
    }, 1000);
  }
  function stopTicker() {
    if (runtime.tickTimer) { clearInterval(runtime.tickTimer); runtime.tickTimer = null; }
  }

  function lastAssistantBody() {
    for (var i = runtime.messages.length - 1; i >= 0; i--) {
      if (runtime.messages[i].role === 'assistant') return runtime.messages[i].body;
    }
    return '';
  }

  function speakLast() {
    try {
      if (typeof speak === 'function') {
        var body = lastAssistantBody();
        if (body) speak(body);
      }
    } catch (e) { /* voice is optional */ }
  }

  async function finishTask(pending, result) {
    removePending(pending);
    var haveReplyRow = false;
    try {
      await loadThread();
      haveReplyRow = runtime.messages.some(function (m) {
        return m.role === 'assistant' && (m.taskId === pending.taskId || m.inReplyTo === pending.messageId);
      });
    } catch (e) { /* fall back to the task result below */ }
    if (!haveReplyRow && result && result.reply) {
      runtime.messages.push({ id: 'task-' + (pending.taskId || Date.now()), role: 'assistant', body: String(result.reply), createdAt: new Date().toISOString(), taskId: pending.taskId || '', inReplyTo: pending.messageId });
    }
    renderBubbles();
    speakLast();
  }

  function failTask(pending, e) {
    removePending(pending);
    var why = e && e.code === 'TASK_FAILED' ? String(e.message || 'Kit could not finish that one.').slice(0, 200) : errText(e);
    runtime.messages.push({ id: 'err-' + Date.now(), role: 'assistant', body: 'Kit could not finish that one (' + why + '). Your message is saved in this thread — try again, or rephrase it and Kit will take another run at it.', createdAt: new Date().toISOString(), taskId: '', inReplyTo: '' });
    renderBubbles();
  }

  /* The poller answers within about a minute; soft mode covers a slow
   * answer: keep watching the thread itself until the reply row lands. */
  function watchTask(pending) {
    var handoff = window.H38_AI_HANDOFF;
    if (!handoff || typeof handoff.waitForResult !== 'function') { goSoft(pending); return; }
    handoff.waitForResult(pending.taskId, 5 * 60 * 1000).then(function (result) {
      finishTask(pending, result || {});
    }).catch(function (e) {
      if (e && e.code === 'TASK_FAILED') { failTask(pending, e); return; }
      goSoft(pending);
    });
  }

  function goSoft(pending) {
    if (pending.soft) return;
    pending.soft = true;
    renderBubbles();
    var iv = setInterval(function () {
      if (runtime.pendingTasks.indexOf(pending) === -1) { clearInterval(iv); return; }
      if (Date.now() - pending.startedAt > WATCH_SOFT_CAP_MS) {
        clearInterval(iv);
        removePending(pending);
        runtime.messages.push({ id: 'note-' + Date.now(), role: 'assistant', body: 'Kit is taking longer than usual on that one. The reply will still land in this thread when it is ready — you can leave this page and come back to it here.', createdAt: new Date().toISOString(), taskId: '', inReplyTo: '' });
        renderBubbles();
        return;
      }
      loadThread().then(function () {
        var found = runtime.messages.some(function (m) {
          return m.role === 'assistant' && (m.taskId === pending.taskId || m.inReplyTo === pending.messageId);
        });
        if (found) {
          clearInterval(iv);
          removePending(pending);
          renderBubbles();
          speakLast();
        } else if (document.getElementById('kwAiChat')) {
          renderBubbles();
        }
      }).catch(function () {});
    }, 12000);
  }

  /* ---------- workspace integration ---------- */

  async function hydrateAndRender() {
    if (!handlesWorkspaceChat()) return;
    try {
      await loadThread();
      renderBubbles();
      /* Cold-boot guard: on a slow first load the session identity or the
       * snapshot may not have settled when the first read runs, and the
       * thread can come back empty even though it exists. If this thread
       * looks empty, read it once more a few seconds later so the owner
       * sees their history without having to send a message first. */
      if (!runtime.messages.length && !runtime.emptyRetried) {
        runtime.emptyRetried = true;
        setTimeout(function () {
          if (!runtime.messages.length && document.getElementById('kwAiChat')) hydrateAndRender();
        }, 3500);
      }
    } catch (e) {
      var box = document.getElementById('kwAiChat');
      if (box && !runtime.messages.length) {
        box.innerHTML = '<div class="ai-bubble assistant">Your saved thread could not be loaded just now (' + escText(errText(e)) + '). Sending a message still works, and the rest of the Office is unaffected.</div>';
      }
    }
  }

  /* Wrap the workspace renderer so opening the Hank page hydrates the
   * chat from the server thread before/after it draws. The workspace
   * object is frozen, so replace the window reference with a frozen
   * wrapper that preserves its shape. */
  function install() {
    if (runtime.installed) return true;
    var ws = window.H38KitsWorkspace;
    if (!ws || typeof ws.render !== 'function') return false;
    var baseRender = ws.render;
    var wrapped = async function () {
      var result = await baseRender.apply(this, arguments);
      hydrateAndRender();
      return result;
    };
    try {
      window.H38KitsWorkspace = Object.freeze({ render: wrapped, build: ws.build });
    } catch (e) {
      window.H38KitsWorkspace = { render: wrapped, build: ws.build };
    }
    runtime.installed = true;
    /* If the chat is already on screen (module loaded late), hydrate now. */
    if (document.getElementById('kwAiChat')) hydrateAndRender();
    return true;
  }

  var installTries = 0;
  (function tryInstall() {
    if (install()) return;
    if (installTries++ < 160) setTimeout(tryInstall, 250);
  })();

  window.H38_OWNER_CHAT = Object.freeze({
    build: BUILD,
    enabled: enabled,
    handlesWorkspaceChat: handlesWorkspaceChat,
    send: send,
    hydrate: hydrateAndRender,
    loadThread: loadThread
  });
})();
