'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'browser-artifacts', 'project-images');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function server() {
  return http.createServer((req, res) => {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

async function waitForProjectImages(page) {
  const images = page.locator('.project-card .project-visual img');
  const count = await images.count();
  if (count !== 16) throw new Error(`Expected 16 project images, found ${count}`);

  await images.evaluateAll(elements => {
    for (const image of elements) image.loading = 'eager';
  });

  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(async element => {
      if (!element.complete || element.naturalWidth === 0) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Image decode timeout: ${element.getAttribute('src')}`)), 15000);
          element.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
          element.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`Image load failed: ${element.getAttribute('src')}`)); }, { once: true });
        });
      }
      if (typeof element.decode === 'function') await element.decode();
      if (!element.complete || element.naturalWidth < 100 || element.naturalHeight < 100) {
        throw new Error(`Invalid rendered image: ${element.getAttribute('src')} ${element.naturalWidth}x${element.naturalHeight}`);
      }
    });
  }
  return images;
}

(async () => {
  let local = null;
  let base = process.argv[2] || '';
  if (!base) {
    local = server();
    await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${local.address().port}`;
  }
  base = base.replace(/\/$/, '');

  const browser = await chromium.launch({ headless: true });
  const records = [];
  try {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 1200 },
      { name: 'mobile', width: 390, height: 844 }
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      await page.goto(`${base}/sample-library-now.html?visual=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.locator('.project-card').first().waitFor({ state: 'visible', timeout: 15000 });
      if (await page.locator('.project-card').count() !== 8) throw new Error('Project card count is not 8');

      const images = await waitForProjectImages(page);
      await page.screenshot({ path: path.join(out, `project-examples-${viewport.name}.png`), fullPage: true });

      if (viewport.name === 'desktop') {
        const count = await images.count();
        for (let index = 0; index < count; index += 1) {
          const image = images.nth(index);
          const article = image.locator('xpath=ancestor::article[1]');
          const title = ((await article.locator('h3').first().textContent()) || `card-${Math.floor(index / 2) + 1}`).trim();
          const side = index % 2 ? 'after' : 'before';
          const file = `${String(index + 1).padStart(2, '0')}-${side}.png`;
          const meta = await image.evaluate(element => ({
            src: element.getAttribute('src') || '',
            currentSrc: element.currentSrc || '',
            complete: element.complete,
            naturalWidth: element.naturalWidth,
            naturalHeight: element.naturalHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight
          }));
          await image.screenshot({ path: path.join(out, file), animations: 'disabled' });
          records.push({ ...meta, index, title, side, file });
        }
      }
      await page.close();
    }

    fs.writeFileSync(path.join(out, 'metadata.json'), JSON.stringify({ base, records }, null, 2) + '\n');
  } catch (error) {
    fs.writeFileSync(path.join(out, 'capture-error.txt'), `${error.stack || error}\n`);
    throw error;
  } finally {
    await browser.close();
    if (local) await new Promise(resolve => local.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
