(function () {
  'use strict';
  const BUILD = '20260809-1545';
  let scheduled = false;
  let startupAttempts = 0;
  let startupTimer = 0;

  function nativeBridge() {
    return window.AndroidH38Native && typeof window.AndroidH38Native.requestAutofill === 'function'
      ? window.AndroidH38Native : null;
  }

  function requestAutofill(input) {
    try { input?.focus?.({preventScroll:true}); } catch (_) { input?.focus?.(); }
    try { nativeBridge()?.requestAutofill(); } catch (_) {}
  }

  function chooseTarget(email,password) {
    if (email && !String(email.value || '').trim()) return email;
    if (password && !String(password.value || '')) return password;
    return email || password;
  }

  function startupAutofill(email,password) {
    clearTimeout(startupTimer);
    const attempt = () => {
      if (!document.getElementById('h38AuthForm')) return;
      const target = chooseTarget(email,password);
      if (!target) return;
      requestAutofill(target);
      startupAttempts += 1;
      if (startupAttempts < 4 && (!String(email?.value || '').trim() || !String(password?.value || ''))) {
        startupTimer = setTimeout(attempt, startupAttempts === 1 ? 350 : 700);
      }
    };
    startupTimer = setTimeout(attempt, 120);
  }

  function enhance() {
    scheduled = false;
    const form = document.getElementById('h38AuthForm');
    if (!form) return;

    const email = document.getElementById('h38AuthEmail');
    const password = document.getElementById('h38AuthPassword');
    const firstSetup = form.dataset.autofillReady !== 'true';
    form.dataset.autofillReady = 'true';
    form.setAttribute('autocomplete','on');

    if (email) {
      email.name = 'username';
      email.autocomplete = 'username';
      email.inputMode = 'email';
      email.setAttribute('autocapitalize','none');
      email.setAttribute('spellcheck','false');
      email.setAttribute('enterkeyhint','next');
      if (firstSetup) email.addEventListener('focus', () => requestAutofill(email));
      if (firstSetup) email.addEventListener('input', () => {
        if (String(email.value || '').trim() && !String(password?.value || '')) {
          setTimeout(() => requestAutofill(password), 80);
        }
      });
    }
    if (password) {
      password.name = 'password';
      password.autocomplete = 'current-password';
      password.setAttribute('enterkeyhint','go');
      if (firstSetup) password.addEventListener('focus', () => requestAutofill(password));
    }

    if (!document.getElementById('h38UseSavedLogin')) {
      const button = document.createElement('button');
      button.id = 'h38UseSavedLogin';
      button.type = 'button';
      button.className = 'secondary h38-saved-login';
      button.textContent = '🔐 Use saved username and password';
      button.addEventListener('click', () => requestAutofill(chooseTarget(email,password)));
      const actions = form.querySelector('.welcome-actions');
      if (actions) actions.appendChild(button);
      else form.appendChild(button);
    }

    let help = document.getElementById('h38AutofillHelp');
    if (!help) {
      help = document.createElement('p');
      help.id = 'h38AutofillHelp';
      help.className = 'muted h38-autofill-help';
      help.textContent = 'Saved login is requested automatically. Tap either field or Use saved username and password if your provider needs another prompt.';
      form.appendChild(help);
    }

    if (firstSetup) {
      startupAttempts = 0;
      startupAutofill(email,password);
    }
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
    window.addEventListener('pageshow',schedule);
    window.addEventListener('focus',schedule);
    schedule();
  }

  window.H38_AUTH_AUTOFILL = {build:BUILD,request:requestAutofill,startup:true,retryFields:true};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
