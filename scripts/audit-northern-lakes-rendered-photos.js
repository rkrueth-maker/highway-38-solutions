'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const siteRoot = path.join(root, 'businesses', 'northern-lakes');
const outRoot = path.join(root, 'artifacts', 'northern-lakes-photo-audit');
const pages = fs.readdirSync(siteRoot).filter(name => name.endsWith('.html')).sort();
const publicPhotoPages = new Set([
  'index.html', 'services.html', 'snow.html', 'lawn.html', 'landscaping.html',
  'excavation.html', 'equipment-rental.html', 'materials.html', 'about.html',
  'gallery.html', 'reviews.html', 'service-areas.html', 'contact.html',
  'quote-request.html', 'faq.html', 'privacy.html', 'terms.html', '404.html'
]);
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 }
];
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

function safeName(value) {
  return value.replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function server() {
  return http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') pathname = '/businesses/northern-lakes/index.html';
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store, max-age=0'
    });
    fs.createReadStream(file).pipe(res);
  });
}

(async () => {
  const local = server();
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${local.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const report = { generatedAt: new Date().toISOString(), pages: [], failures: [], warnings: [] };

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1
      });
      await context.route('https://script.google.com/**', route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><html><body>Google sign-in required.</body></html>'
      }));

      for (const file of pages) {
        const page = await context.newPage();
        const pageErrors = [];
        const failedAssets = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
        page.on('response', response => {
          if (response.url().startsWith(base) && response.status() >= 400 && response.request().resourceType() !== 'document') {
            failedAssets.push(`${response.status()} ${response.url()}`);
          }
        });
        page.on('requestfailed', request => {
          if (request.url().startsWith(base)) failedAssets.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`);
        });

        const url = `${base}/businesses/northern-lakes/${file}?render-audit=1`;
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.evaluate(async () => {
          const images = Array.from(document.images);
          await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })));
          if (document.fonts?.ready) await document.fonts.ready;
        });
        await page.waitForTimeout(250);

        const dir = path.join(outRoot, viewport.name);
        fs.mkdirSync(path.join(dir, 'opening'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'full'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
        await page.screenshot({ path: path.join(dir, 'opening', `${file}.png`), fullPage: false });
        await page.screenshot({ path: path.join(dir, 'full', `${file}.png`), fullPage: true });

        const images = await page.locator('img').evaluateAll(nodes => nodes.map((img, index) => {
          const rect = img.getBoundingClientRect();
          const style = getComputedStyle(img);
          return {
            index,
            src: img.getAttribute('src') || '',
            currentSrc: img.currentSrc || '',
            alt: img.getAttribute('alt') || '',
            complete: img.complete,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            renderedWidth: Math.round(rect.width),
            renderedHeight: Math.round(rect.height),
            visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0,
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
            aboveFold: rect.top < innerHeight && rect.bottom > 0
          };
        }));

        for (const image of images) {
          if (!image.visible) continue;
          const locator = page.locator('img').nth(image.index);
          try {
            await locator.screenshot({
              path: path.join(dir, 'images', `${file}-${String(image.index + 1).padStart(2, '0')}-${safeName(path.basename((image.src || 'image').split('?')[0]))}.png`)
            });
          } catch (error) {
            report.warnings.push(`${viewport.name}/${file}: could not capture image ${image.index + 1}: ${error.message}`);
          }
        }

        const broken = images.filter(img => img.visible && (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0));
        const underResolved = images.filter(img => {
          if (!img.visible || img.renderedWidth < 220 || img.renderedHeight < 140) return false;
          const scaleX = img.renderedWidth / img.naturalWidth;
          const scaleY = img.renderedHeight / img.naturalHeight;
          const effectiveScale = Math.max(scaleX, scaleY);
          return effectiveScale > 1.25;
        });
        const missingAlt = images.filter(img => img.visible && !img.alt.trim());
        const duplicateSources = Object.entries(images.filter(img => img.visible).reduce((acc, img) => {
          const key = (img.currentSrc || img.src).replace(/[?&]v=[^&]+/g, '');
          (acc[key] ||= []).push(img.index + 1);
          return acc;
        }, {})).filter(([, indexes]) => indexes.length >= 3);

        const record = {
          viewport: viewport.name,
          file,
          status: response?.status() || 0,
          title: await page.title(),
          images,
          broken,
          underResolved,
          missingAlt,
          duplicateSources,
          pageErrors,
          failedAssets
        };
        report.pages.push(record);

        if (!response || response.status() >= 400) report.failures.push(`${viewport.name}/${file}: page load ${response?.status() || 'no response'}`);
        if (broken.length) report.failures.push(`${viewport.name}/${file}: broken images ${broken.map(img => img.src).join(', ')}`);
        if (failedAssets.length) report.failures.push(`${viewport.name}/${file}: failed assets ${failedAssets.join(' | ')}`);
        if (pageErrors.length) report.failures.push(`${viewport.name}/${file}: runtime errors ${pageErrors.join(' | ')}`);
        if (underResolved.length && publicPhotoPages.has(file)) report.failures.push(`${viewport.name}/${file}: under-resolved rendered images ${underResolved.map(img => `${img.src} ${img.naturalWidth}x${img.naturalHeight}->${img.renderedWidth}x${img.renderedHeight}`).join(' | ')}`);
        if (missingAlt.length && publicPhotoPages.has(file)) report.failures.push(`${viewport.name}/${file}: visible photos missing alt text`);

        if (file === 'index.html') {
          const hero = images.find(img => /hero-media/.test((img.currentSrc || img.src)) || /assets\/hero\./.test(img.src));
          if (!hero || !hero.visible || !hero.aboveFold) report.failures.push(`${viewport.name}/index.html: opening hero is not visibly rendered above the fold`);
          if (!hero || !/duramax/i.test(hero.alt) || !/boss/i.test(hero.alt)) report.failures.push(`${viewport.name}/index.html: opening hero alt does not identify Duramax and BOSS plow`);
        }

        await page.close();
      }
      await context.close();
    }

    const sourceUsage = {};
    for (const page of report.pages) {
      for (const image of page.images.filter(img => img.visible)) {
        const source = image.src.replace(/[?&]v=[^&]+/g, '');
        const key = `${page.viewport}:${source}`;
        (sourceUsage[key] ||= []).push(page.file);
      }
    }
    report.sourceUsage = sourceUsage;
    report.summary = {
      pageFiles: pages.length,
      renderedPages: report.pages.length,
      renderedImages: report.pages.reduce((sum, page) => sum + page.images.filter(img => img.visible).length, 0),
      failures: report.failures.length,
      warnings: report.warnings.length,
      status: report.failures.length ? 'FAIL' : 'PASS'
    };

    fs.writeFileSync(path.join(outRoot, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outRoot, 'summary.txt'), [
      `Northern Lakes rendered-photo audit: ${report.summary.status}`,
      `HTML files: ${report.summary.pageFiles}`,
      `Rendered page/viewport combinations: ${report.summary.renderedPages}`,
      `Visible rendered images: ${report.summary.renderedImages}`,
      `Failures: ${report.summary.failures}`,
      `Warnings: ${report.summary.warnings}`,
      '',
      ...report.failures.map(item => `FAIL: ${item}`),
      ...report.warnings.map(item => `WARN: ${item}`)
    ].join('\n'));
    console.log(JSON.stringify(report.summary, null, 2));
    if (report.failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
    await new Promise(resolve => local.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
