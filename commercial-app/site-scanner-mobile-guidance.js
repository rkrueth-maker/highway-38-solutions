(function () {
  'use strict';

  const BUILD = '20260806-0605';
  const MAIN_ID = 'mainContent';
  let scheduled = false;

  function text(value) {
    return String(value == null ? '' : value);
  }

  function greatestCommonDivisor(a, b) {
    let left = Math.abs(a);
    let right = Math.abs(b);
    while (right) {
      const next = left % right;
      left = right;
      right = next;
    }
    return left || 1;
  }

  function inchesFrom(value, unit) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 0;
    switch (text(unit).toLowerCase()) {
      case 'ft': return amount * 12;
      case 'yd': return amount * 36;
      case 'm': return amount * 39.3700787402;
      case 'cm': return amount * 0.3937007874;
      case 'in': return amount;
      default: return amount * 12;
    }
  }

  function formatFeetInches(value, unit) {
    let eighths = Math.round(inchesFrom(value, unit) * 8);
    const negative = eighths < 0;
    eighths = Math.abs(eighths);
    const wholeInches = Math.floor(eighths / 8);
    const remainder = eighths % 8;
    const feet = Math.floor(wholeInches / 12);
    const inches = wholeInches % 12;
    let fraction = '';
    if (remainder) {
      const divisor = greatestCommonDivisor(remainder, 8);
      fraction = `${remainder / divisor}/${8 / divisor}`;
    }
    const inchValue = [inches || (!feet ? 0 : ''), fraction].filter(part => part !== '').join(' ');
    const pieces = [];
    if (feet) pieces.push(`${feet} ft`);
    if (inchValue || !feet) pieces.push(`${inchValue} in`);
    return `${negative ? '-' : ''}${pieces.join(' ')}`;
  }

  function isScannerPage(main) {
    return text(main?.querySelector('.page-head h1')?.textContent).trim() === 'H38 Site Scanner'
      || !!main?.querySelector('.scanner-layout');
  }

  function formatMeasurementRows(main) {
    main.querySelectorAll('.scanner-measure-row small').forEach(node => {
      const raw = text(node.textContent).trim();
      const match = raw.match(/^(-?\d+(?:\.\d+)?)\s+(in|ft|yd|m|cm)\s+·\s+(.+)$/i);
      if (!match) return;
      const formatted = `${formatFeetInches(match[1], match[2])} · ${match[3]}`;
      if (node.textContent !== formatted) node.textContent = formatted;
    });

    const perimeter = main.querySelector('.scanner-geometry-summary > div:nth-child(2) strong');
    if (perimeter && !perimeter.dataset.feetInches) {
      const raw = Number(perimeter.textContent);
      if (Number.isFinite(raw)) {
        perimeter.textContent = formatFeetInches(raw, 'ft');
        perimeter.dataset.feetInches = 'true';
      }
    }

    main.querySelectorAll('.scanner-svg-preview svg text').forEach(node => {
      const raw = text(node.textContent);
      const formatted = raw.replace(/—\s*(-?\d+(?:\.\d+)?)\s+(in|ft|yd|m|cm)\b/i, (_all, value, unit) => `— ${formatFeetInches(value, unit)}`);
      if (formatted !== raw) node.textContent = formatted;
    });
  }

  function createGuide(main, nativeButton, hasMeasurements) {
    let guide = document.getElementById('scannerSimpleGuide');
    if (!guide) {
      guide = document.createElement('section');
      guide.id = 'scannerSimpleGuide';
      guide.className = 'card scanner-simple-guide';
      const statusCard = main.querySelector('.scanner-status-card');
      if (statusCard) statusCard.insertAdjacentElement('afterend', guide);
      else main.querySelector('.scanner-main')?.prepend(guide);
    }

    guide.innerHTML = `<div class="scanner-step-heading">
      <span class="scanner-step-number">${hasMeasurements ? '✓' : '1'}</span>
      <div>
        <strong>${hasMeasurements ? 'Measurement saved' : 'Measure one distance'}</strong>
        <p>${hasMeasurements
          ? 'Measure another wall or opening, or continue to photos and notes below.'
          : 'The camera will guide you through two points. Measure one wall, opening, or edge at a time.'}</p>
      </div>
    </div>
    <ol class="scanner-three-directions">
      <li>Move the phone slowly until it says <strong>Tracking ready</strong>.</li>
      <li>Aim the center crosshair and set the <strong>first point</strong>.</li>
      <li>Aim at the other end, set the <strong>second point</strong>, then use the measurement.</li>
    </ol>
    <div id="scannerGuideAction" class="scanner-guide-action"></div>
    <p class="scanner-guide-note">Results are shown in feet and inches. Check important dimensions with a tape or laser before final work.</p>`;

    const action = guide.querySelector('#scannerGuideAction');
    if (nativeButton && action) {
      nativeButton.textContent = hasMeasurements ? 'Measure Another Distance' : 'Measure with Camera';
      nativeButton.classList.remove('secondary');
      nativeButton.classList.add('scanner-primary-measure');
      action.appendChild(nativeButton);
    }
  }

  function simplifySessionHistory(sidebar) {
    if (!sidebar || sidebar.querySelector('.scanner-history-details')) return;
    const list = sidebar.querySelector('.scanner-session-list');
    if (!list) return;
    const heading = Array.from(sidebar.querySelectorAll('h2')).find(node => text(node.textContent).trim() === 'Sessions');
    const details = document.createElement('details');
    details.className = 'scanner-history-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Previous scans';
    details.appendChild(summary);
    details.appendChild(list);
    if (heading) heading.replaceWith(details);
    else sidebar.appendChild(details);
  }

  function simplifyManualMeasurement(main) {
    const form = document.getElementById('scannerMeasurementForm');
    if (!form || form.dataset.feetInchesReady === 'true') return;
    form.dataset.feetInchesReady = 'true';

    const valueField = form.elements.measurementValue;
    const unitField = form.elements.unit;
    const firstGroup = valueField?.closest('.three');
    if (valueField && unitField && firstGroup) {
      valueField.closest('div')?.classList.add('scanner-original-unit-field');
      unitField.closest('div')?.classList.add('scanner-original-unit-field');
      valueField.removeAttribute('required');
      unitField.value = 'in';

      const feetWrap = document.createElement('div');
      feetWrap.className = 'scanner-us-measure-field';
      feetWrap.innerHTML = '<label>Feet</label><input name="displayFeet" type="number" min="0" step="1" inputmode="numeric" value="0">';
      const inchesWrap = document.createElement('div');
      inchesWrap.className = 'scanner-us-measure-field';
      inchesWrap.innerHTML = '<label>Inches</label><input name="displayInches" type="number" min="0" step="0.125" inputmode="decimal" placeholder="0 or 3 1/2">';
      firstGroup.append(feetWrap, inchesWrap);

      form.addEventListener('submit', () => {
        const feet = Math.max(0, Number(form.elements.displayFeet?.value || 0));
        const inches = Math.max(0, Number(form.elements.displayInches?.value || 0));
        valueField.value = String((feet * 12) + inches);
        unitField.value = 'in';
      }, true);
    }

    const directChildren = Array.from(form.children);
    const groups = directChildren.filter(node => node.classList?.contains('three') || node.classList?.contains('four'));
    const advancedGroups = groups.slice(1);
    const notesInput = form.querySelector('[name="notes"]');
    const notesLabel = notesInput?.previousElementSibling?.tagName === 'LABEL' ? notesInput.previousElementSibling : null;
    if (advancedGroups.length || notesInput) {
      const advanced = document.createElement('details');
      advanced.className = 'scanner-measurement-options';
      const summary = document.createElement('summary');
      summary.textContent = 'Source, confidence, coordinates, and notes';
      advanced.appendChild(summary);
      advancedGroups.forEach(group => advanced.appendChild(group));
      if (notesLabel) advanced.appendChild(notesLabel);
      if (notesInput) advanced.appendChild(notesInput);
      const actions = form.querySelector('.actions');
      if (actions) form.insertBefore(advanced, actions);
      else form.appendChild(advanced);
    }
  }

  function labelCards(main) {
    main.querySelectorAll('.scanner-main > section.card').forEach(section => {
      const heading = section.querySelector('h2');
      const label = text(heading?.textContent).trim();
      if (label.startsWith('1. Capture')) {
        section.classList.add('scanner-evidence-card');
        heading.textContent = '2. Add photos and notes (optional)';
        section.querySelector('#scannerPhotoButton')?.replaceChildren(document.createTextNode('Add a Site Photo'));
        section.querySelector('#scannerVideoButton')?.replaceChildren(document.createTextNode('Record a Walkthrough'));
        section.querySelector('#scannerSaveTranscript')?.replaceChildren(document.createTextNode('Save Notes'));
      } else if (label.startsWith('2. Add or verify')) {
        section.classList.add('scanner-measurements-card');
        heading.textContent = 'Measurements';
      } else if (label.startsWith('3. AI')) {
        section.classList.add('scanner-after-measure', 'scanner-optional-card');
        heading.textContent = '3. Optional AI site review';
      } else if (label.startsWith('4. Deterministic')) {
        section.classList.add('scanner-after-measure', 'scanner-optional-card');
        heading.textContent = '4. Optional drawing';
      } else if (label.startsWith('5. Review')) {
        section.classList.add('scanner-after-measure', 'scanner-finish-card');
        heading.textContent = '5. Finish and attach';
      }
    });
  }

  function enhanceScanner() {
    scheduled = false;
    const main = document.getElementById(MAIN_ID);
    if (!main || !isScannerPage(main)) {
      document.body.classList.remove('scanner-focus-mode', 'scanner-no-measurements');
      return;
    }

    document.body.classList.add('scanner-focus-mode');
    const measurementRows = main.querySelectorAll('.scanner-measure-row');
    const hasMeasurements = measurementRows.length > 0;
    document.body.classList.toggle('scanner-no-measurements', !hasMeasurements);

    const title = main.querySelector('.page-head h1');
    if (title) title.textContent = 'Site Measure';
    const intro = main.querySelector('.page-head p');
    if (intro) intro.textContent = 'Measure one wall, opening, or edge at a time. The app saves each reading to this quote.';
    const back = document.getElementById('scannerBack');
    if (back) back.textContent = '← Back to Quote';

    const sidebar = main.querySelector('.scanner-sidebar');
    if (sidebar) {
      sidebar.classList.add('scanner-project-card');
      const heading = sidebar.querySelector('h2');
      if (heading) heading.textContent = 'Project setup';
      const start = document.getElementById('scannerNewSession');
      if (start) start.textContent = 'Start New Area';
      simplifySessionHistory(sidebar);
    }

    const statusCard = main.querySelector('.scanner-status-card');
    statusCard?.classList.add('scanner-compact-status');
    const nativeButton = document.getElementById('scannerNativeCapture');
    createGuide(main, nativeButton, hasMeasurements);
    labelCards(main);
    simplifyManualMeasurement(main);
    formatMeasurementRows(main);
  }

  function scheduleEnhancement() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhanceScanner);
  }

  function start() {
    const main = document.getElementById(MAIN_ID);
    if (!main) return;
    new MutationObserver(scheduleEnhancement).observe(main, { childList: true, subtree: true });
    document.addEventListener('click', event => {
      if (event.target?.closest?.('#scannerBack, #h38SiteScannerButton, #h38OpenSiteScanner')) {
        setTimeout(scheduleEnhancement, 0);
      }
    });
    scheduleEnhancement();
  }

  window.H38_SITE_SCANNER_US_DISPLAY = {
    build: BUILD,
    formatFeetInches
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
