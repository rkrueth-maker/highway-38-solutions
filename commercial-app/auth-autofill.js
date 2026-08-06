(function () {
  'use strict';
  const BUILD = '20260806-0700';
  let scheduled = false;

  function nativeBridge() {
    return window.AndroidH38Native && typeof window.AndroidH38Native.requestAutofill === 'function'
      ? window.AndroidH38Native : null;
  }

  function requestAutofill(input) {
    input?.focus?.();
    try { nativeBridge()?.requestAutofill(); } catch (_) {}
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

    if (!document.getElementById('h38UseSavedLogin')) {
      const button = document.createElement('button');
      button.id = 'h38UseSavedLogin';
      button.type = 'button';
      button.className = 'secondary h38-saved-login';
      button.textContent = '🔐 Use saved username and password';
      button.addEventListener('click', () => requestAutofill(email || password));
      const actions = form.querySelector('.welcome-actions');
      if (actions) actions.appendChild(button);
      else form.appendChild(button);
    }

    let help = document.getElementById('h38AutofillHelp');
    if (!help) {
      help = document.createElement('p');
      help.id = 'h38AutofillHelp';
      help.className = 'muted h38-autofill-help';
      help.textContent = 'Tap either field or Use saved username and password to open Google Password Manager or your selected autofill provider.';
      form.appendChild(help);
    }

    setTimeout(() => requestAutofill(email), 200);
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
