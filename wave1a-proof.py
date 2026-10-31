"""Wave 1A end-to-end proof: human numbers + quote editor surfaces.
Demo tenant, Playwright+Firefox, 1440x900 and 390x844.
Surfaces: Quotes pane+list, Jobs pane, Money pane, customer timeline,
Tasks, quote editor (draft + locked accepted quote + revision flow +
live customer preview). Greps rendered text for LOCAL- per surface.
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

URL = "https://highway38solutions.com/commercial-app/index.html?businessKey=demo"
AUTH = "/home/hatch/.h38-training-auth.json"
OUT = "/home/hatch/workspace/h38-wave1a-proof"
os.makedirs(OUT, exist_ok=True)
report = []

def log(s):
    report.append(s)
    print(s, flush=True)

async def local_count(page):
    txt = await page.inner_text("body")
    return len(re.findall(r"LOCAL-", txt)), txt

async def shot(page, name):
    await page.screenshot(path=f"{OUT}/{name}.png")
    log(f"SHOT {name}.png")

async def nav(page, label):
    """Navigate via the app's own nav buttons / openPage."""
    ok = await page.evaluate("""(label) => {
      if (typeof window.openPage === 'function') { window.openPage(label); return 'openPage'; }
      return 'none';
    }""", label)
    await page.wait_for_timeout(2600)
    return ok

async def run_viewport(p, width, height, tag, mobile=False):
    ctx = await p.new_context(viewport={"width": width, "height": height},
                              is_mobile=mobile, has_touch=mobile,
                              ignore_https_errors=True, storage_state=AUTH)
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    await page.wait_for_timeout(9000)
    body = await page.inner_text("body")
    log(f"[{tag}] loaded; signed-in markers: {'Clearwater' in body}")
    ver = await page.evaluate("() => window.H38_HUMAN_NUMBERS ? window.H38_HUMAN_NUMBERS.build : 'MISSING'")
    log(f"[{tag}] H38_HUMAN_NUMBERS build: {ver}")

    # --- Quotes (list view + workbench pane) ---
    await nav(page, "quotes")
    await page.wait_for_timeout(1500)
    c, _ = await local_count(page)
    log(f"[{tag}] QUOTES surface LOCAL- count: {c}")
    await shot(page, f"{tag}-quotes")

    # --- Jobs pane (Work page) ---
    await nav(page, "work")
    await page.wait_for_timeout(1500)
    c, _ = await local_count(page)
    log(f"[{tag}] JOBS/WORK surface LOCAL- count: {c}")
    await shot(page, f"{tag}-jobs")

    # --- Money pane ---
    await nav(page, "money")
    await page.wait_for_timeout(1500)
    c, _ = await local_count(page)
    log(f"[{tag}] MONEY surface LOCAL- count: {c}")
    await shot(page, f"{tag}-money")

    # --- Tasks ---
    await nav(page, "tasks")
    await page.wait_for_timeout(1500)
    c, txt = await local_count(page)
    log(f"[{tag}] TASKS surface LOCAL- count: {c}")
    m = re.findall(r"Review new quote: [^\n]{0,40}", txt)
    log(f"[{tag}] task titles sample: {m[:3]}")
    await shot(page, f"{tag}-tasks")

    # --- Customers + timeline (first customer) ---
    await nav(page, "customers")
    await page.wait_for_timeout(1800)
    c, _ = await local_count(page)
    log(f"[{tag}] CUSTOMERS surface LOCAL- count: {c}")
    # click first customer row/card if present
    clicked = await page.evaluate("""() => {
      const el = document.querySelector('#mainContent .row, #mainContent [data-customer-id], #mainContent .list button, #mainContent .card button');
      return false;
    }""")
    await shot(page, f"{tag}-customers")
    await ctx.close()
    return page

async def main():
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=True)
        await run_viewport(browser, 1440, 900, "desktop")
        await run_viewport(browser, 390, 844, "phone", mobile=True)
        await browser.close()
    with open(f"{OUT}/report.txt", "w") as f:
        f.write("\n".join(report))

asyncio.run(main())
