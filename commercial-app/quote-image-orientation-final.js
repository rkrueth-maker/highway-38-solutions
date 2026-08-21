(function () {
  'use strict';

  const BUILD = '20260821-quote-image-orientation-final-2';
  const Bridge = window.H38Bridge;
  if (!Bridge || !Bridge.prototype || typeof Bridge.prototype.request !== 'function') return;

  const previousRequest = Bridge.prototype.request;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function value(row, ...keys) {
    const source = row && row.payload && typeof row.payload === 'object' ? row.payload : row;
    for (const key of keys) {
      if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') {
        return source[key];
      }
    }
    return '';
  }

  function rows(name) {
    const snapshot = window.state && window.state.snapshot;
    return snapshot && Array.isArray(snapshot[name]) ? snapshot[name] : [];
  }

  function core() {
    return window.H38_SITE_VISIT_QUOTE_E2E_CORE || null;
  }

  function currentQuoteId() {
    return text(window.state && window.state.quote && window.state.quote.quoteId);
  }

  function quoteRecord(id) {
    return rows('quotes').find(function (row) {
      return text(value(row, 'Quote ID', 'quoteId')) === text(id);
    }) || null;
  }

  function resolveSourceId(id, args) {
    const quoteId = text(id || currentQuoteId());
    const options = args || {};
    const runtime = window.H38_QUOTE_RUNTIME_AUTHORITY;

    if (runtime && typeof runtime.actionPictureId === 'function') {
      const resolved = text(runtime.actionPictureId(quoteId, options));
      if (resolved) return resolved;
    }

    const api = core();
    if (api && typeof api.resolveActionPictureId === 'function') {
      const resolved = text(api.resolveActionPictureId({
        quoteId: quoteId,
        args: options,
        quote: quoteRecord(quoteId),
        documents: rows('documents'),
        map: window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE || {},
        visit: window.H38_FIELD_VISIT_CORE && window.H38_FIELD_VISIT_CORE.state
          ? window.H38_FIELD_VISIT_CORE.state.visit
          : null
      }));
      if (resolved) return resolved;
    }

    return text(value(quoteRecord(quoteId), 'Action Picture ID', 'actionPictureId'));
  }

  function normalizeRotation(degrees) {
    const api = core();
    if (api && typeof api.normalizeRotation === 'function') {
      return Number(api.normalizeRotation(degrees) || 0);
    }
    const number = Number(degrees);
    if (!Number.isFinite(number)) return 0;
    const rounded = Math.round(number / 90) * 90;
    return ((rounded % 360) + 360) % 360;
  }

  function resolveRotation(id, source) {
    const quoteId = text(id || currentQuoteId());
    const sourceId = text(source || resolveSourceId(quoteId, {}));
    const api = core();

    if (api && typeof api.actionPictureRotation === 'function') {
      return Number(api.actionPictureRotation({
        quoteId: quoteId,
        sourceId: sourceId,
        quote: quoteRecord(quoteId),
        documents: rows('documents')
      }) || 0);
    }

    return normalizeRotation(value(
      quoteRecord(quoteId),
      'Action Picture Rotation Degrees',
      'actionPictureRotationDegrees'
    ));
  }

  function rotationInstruction(degrees) {
    const api = core();
    if (api && typeof api.rotationInstruction === 'function') {
      return text(api.rotationInstruction(degrees));
    }
    const rotation = normalizeRotation(degrees);
    if (rotation === 90) return 'Rotate the source image 90 degrees clockwise before visual editing.';
    if (rotation === 180) return 'Rotate the source image 180 degrees before visual editing.';
    if (rotation === 270) return 'Rotate the source image 90 degrees counterclockwise before visual editing.';
    return 'Use the source image in its stored orientation.';
  }

  function applyImageRotation(image, degrees) {
    if (!image) return;
    const rotation = normalizeRotation(degrees);
    image.dataset.h38Rotation = String(rotation);
    image.style.transform = 'rotate(' + rotation + 'deg)';
    image.style.transformOrigin = 'center center';
    image.style.objectFit = 'contain';
    image.style.maxWidth = '100%';
    image.style.maxHeight = '100%';

    const parent = image.parentElement;
    if (parent) {
      parent.style.overflow = 'hidden';
      parent.style.display = 'grid';
      parent.style.placeItems = 'center';
      if (rotation === 90 || rotation === 270) parent.style.aspectRatio = '4 / 3';
    }
  }

  function selectedCustomerPhotos(quoteId) {
    return rows('documents').filter(function (row) {
      const sourceType = text(value(row, 'Source Type', 'sourceType')).toLowerCase();
      const sourceId = text(value(row, 'Source ID', 'sourceId'));
      const mimeType = text(value(row, 'Mime Type', 'mimeType')).toLowerCase();
      const selected = value(row, 'Customer Quote Selected', 'customerQuoteSelected');
      return sourceType === 'quote'
        && sourceId === quoteId
        && mimeType.indexOf('image/') === 0
        && (selected === true || text(selected).toLowerCase() === 'true');
    }).sort(function (left, right) {
      return text(value(left, 'Created Time', 'createdTime'))
        .localeCompare(text(value(right, 'Created Time', 'createdTime')));
    });
  }

  function applyPreviewOrientation() {
    const quoteId = currentQuoteId();
    if (!quoteId) return;

    const sourceId = resolveSourceId(quoteId, {});
    const rotation = resolveRotation(quoteId, sourceId);
    const panel = document.getElementById('h38ActionPictureFinal');
    if (panel) {
      applyImageRotation(panel.querySelector('.h38-action-preview img'), rotation);
    }

    const selected = selectedCustomerPhotos(quoteId);
    const figures = document.querySelectorAll('.h38-customer-photo-section figure');
    figures.forEach(function (figure, index) {
      const row = selected[index];
      if (!row) return;
      const photoRotation = normalizeRotation(value(
        row,
        'Action Picture Rotation Degrees',
        'actionPictureRotationDegrees',
        'Image Rotation Degrees',
        'imageRotationDegrees'
      ));
      applyImageRotation(figure.querySelector('img'), photoRotation);
    });
  }

  let scheduled = false;
  function schedulePreviewOrientation() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      applyPreviewOrientation();
    });
  }

  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(schedulePreviewOrientation).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
  window.addEventListener('h38:business-snapshot-updated', schedulePreviewOrientation);
  [0, 300, 1000].forEach(function (delay) {
    setTimeout(schedulePreviewOrientation, delay);
  });

  Bridge.prototype.request = async function (action, args, timeout) {
    if (action !== 'aiRenderQuoteConcept') {
      return previousRequest.call(this, action, args, timeout);
    }

    const prepared = Object.assign({}, args || {});
    const quoteId = text(prepared.quoteId || currentQuoteId());
    const sourceId = resolveSourceId(quoteId, prepared);
    const rotation = resolveRotation(quoteId, sourceId);
    const instruction = rotationInstruction(rotation);

    if (sourceId) prepared.actionPhotoDocumentId = sourceId;
    prepared.actionPhotoRotationDegrees = rotation;
    prepared.actionPhotoOrientationInstruction = instruction;

    if (rotation) {
      const existing = text(prepared.ownerWorkRequest);
      const orientationNote = 'SOURCE ACTION PICTURE ORIENTATION: ' + instruction;
      prepared.ownerWorkRequest = [existing, orientationNote].filter(Boolean).join('\n');
    }

    return previousRequest.call(this, action, prepared, timeout);
  };

  Bridge.prototype.request.__h38QuoteImageOrientationFinal = true;
  Bridge.prototype.request.__h38QuoteImageOrientationBase = previousRequest;

  window.H38_QUOTE_IMAGE_ORIENTATION_FINAL = Object.freeze({
    enabled: true,
    build: BUILD,
    sourceId: resolveSourceId,
    rotation: resolveRotation,
    apply: applyPreviewOrientation,
    renderUsesSavedActionPicture: true,
    rotationMetadataDoesNotOverwriteOriginal: true,
    customerSelectionIndependentOfRender: true,
    automaticApproval: false,
    automaticCustomerSending: false
  });
})();
