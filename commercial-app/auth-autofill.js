(function () {
  'use strict';
  const BUILD = '20260809-1829-local-secure-login';
  let scheduled = false;
  let lastNativeRequest = 0;

  function nativeBridge() {
    return window.AndroidH38Native && typeof window.AndroidH38Native.requestAutofill === 'function'
      ? window.AndroidH38Native : null;
  }

  function requestAutofill(input) {
    const now = Date.now();
    if (now - lastNativeRequest < 1400) return;
    lastNativeRequest = now;
    try { input?.focus?.({preventScroll:true}); } catch (_) { input?.focus?.(); }
    try { nativeBridge()?.requestAutofill(); } catch (_) {}
  }

  function rememberLogin(email,password) {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.rememberLogin !== 'function') return;
    const username = String(email?.value || '').trim();
    const secret = String(password?.value || '');
    if (!username || !secret) return;
    try { bridge.rememberLogin(username, secret); } catch (_) {}
  }

  function enhance() {
    scheduled = false;
    const form = document.getElementById('h38AuthForm');
    if (!form || form.dataset.autofillReady === 'true') return;
    form.dataset.autofillReady = 'true';
    form.setAttribute('autocomplete','on');

    const email = document.getElementById('h38AuthEmail');
    const password = document.getElementById('h38AuthPassword');
    if (email) {
      email.name = 'username';
      email.autocomplete = 'username';
      email.inputMode = 'email';
      email.setAttribute('autocapitalize','none');
      email.setAttribute('spellcheck','false');
      email.setAttribute('enterkeyhint','next');
      email.addEventListener('focus', () => requestAutofill(email), {once:true});
    }
    if (password) {
      password.name = 'password';
      password.autocomplete = 'current-password';
      password.setAttribute('enterkeyhint','go');
      password.addEventListener('focus', () => requestAutofill(password), {once:true});
    }

    form.addEventListener('submit', () => rememberLogin(email,password));

    if (!document.getElementById('h38UseSavedLogin')) {
      const button = document.createElement('button');
      button.id = 'h38UseSavedLogin';
      button.type = 'button';
      button.className = 'secondary h38-saved-login';
      button.textContent = '🔐 Use saved username and password';
      button.addEventListener('click', () => {
        lastNativeRequest = 0;
        requestAutofill(email || password);
      });
      const actions = form.querySelector('.welcome-actions');
      if (actions) actions.appendChild(button);
      else form.appendChild(button);
    }

    let help = document.getElementById('h38AutofillHelp');
    if (!help) {
      help = document.createElement('p');
      help.id = 'h38AutofillHelp';
      help.className = 'muted h38-autofill-help';
      help.textContent = 'Use your saved Highway 38 login, or sign in once and this Android phone will securely remember it for next time.';
      form.appendChild(help);
    }

    window.addEventListener('h38:saved-login-filled', () => {
      if (help) help.textContent = 'Saved username and password filled. Tap Sign in.';
    }, {once:true});

    setTimeout(() => requestAutofill(email), 260);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const main = document.getElementById('mainContent');
    if (main) new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
    document.addEventListener('focusin', event => {
      if (event.target?.id === 'h38AuthEmail' || event.target?.id === 'h38AuthPassword') schedule();
    });
    schedule();
  }

  window.H38_AUTH_AUTOFILL = {build:BUILD,request:requestAutofill};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();