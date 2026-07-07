# Highway 38 Solutions — Deployment Checklist

Use this checklist every time you launch or update the live site.

---

## Pre-launch checklist

- [ ] `sample-library-now.html` contains Version 5 package ladder content
- [ ] All 8 approved Version 4 products are present and unchanged:
  1. Problem Snapshot / Messy Details In → Finished Document Out
  2. Basic Layout Builder
  3. Project Packet Builder
  4. Shop Flow Review
  5. Business System Builder
  6. Digital Setup Builder
  7. Cleanup Rescue
  8. Custom Build Scope / Custom Work Build
- [ ] All 5 package ladder levels present: $500, $1,000, $1,500, $2,000, $2,500
- [ ] Legal / approval notice section is present
- [ ] `Rick Review Required / Owner Approval Required` appears in the approval gate
- [ ] No forbidden promises in the page:
  - No "automatically sends customer emails"
  - No "automatically approves quotes"
  - No "payment requested automatically"
  - No "final delivery without Rick approval"
  - No "fully autonomous real-customer automation"
- [ ] Local verification script passes: `node scripts/verify-live-page.js`

---

## Deployment steps

1. Commit all changes to the `main` branch.
2. Push to `main` — the **Deploy Highway 38 site to GitHub Pages** workflow triggers automatically.
3. Monitor the deployment workflow at:
   `https://github.com/rkrueth-maker/highway-38-solutions/actions/workflows/pages.yml`
4. Confirm the deploy job completes with a green checkmark.

---

## Post-launch verification

### Automated (preferred)
After a successful deployment, the **Verify Version 5 live page** workflow runs automatically.

- Workflow: `.github/workflows/verify-pages.yml`
- Direct run: `https://github.com/rkrueth-maker/highway-38-solutions/actions/workflows/verify-pages.yml`
- Click **Run workflow** → **Run workflow** to trigger manually at any time.

The workflow:
- Waits 60 seconds for GitHub Pages CDN propagation
- Fetches: `https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=v5-ladder-final`
- Confirms HTTP 200 response
- Confirms all required Version 5 strings are present
- Confirms no forbidden unsafe strings are present
- Fails the workflow (red checkmark) if anything is wrong

### Manual spot check
Open the live URL in a browser and confirm the page shows Version 5 content:

```
https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=v5-ladder-final
```

Visually confirm:
- [ ] Page title includes "Version 5 Package Ladder"
- [ ] Hero section shows "Version 5 package ladder add-on"
- [ ] Package ladder section shows all 5 price levels
- [ ] Legal / approval notice section is visible
- [ ] "Rick Review Required / Owner Approval Required" text is present

### Local script verification
Run the Node.js live-page verifier locally (requires internet access):

```bash
node scripts/verify-live-page.js
```

Expected output ends with:
```
RESULT: PASS — all required strings present, no forbidden strings found.
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Pages still shows old content after push | CDN cache delay | Wait 1–2 minutes, hard-refresh the browser |
| Deploy workflow not triggered | Push didn't land on `main` | Confirm branch and merge the PR |
| Verify workflow fails on required string | File missing V5 content | Check `sample-library-now.html` in the repo |
| Verify workflow fails on HTTP status | Pages not deployed yet | Re-run deploy workflow, then re-run verify |
| GitHub Pages source mismatch | Settings changed | Check Settings → Pages → Source is "GitHub Actions" |

---

## GitHub Pages source setting

This repository uses **GitHub Actions** as the Pages source (not branch/folder).  
The `pages.yml` workflow builds and deploys the site.

Confirm at: `https://github.com/rkrueth-maker/highway-38-solutions/settings/pages`

Expected: Source = **GitHub Actions**

---

## Key URLs

| Resource | URL |
|----------|-----|
| Live page (V5 check) | https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=v5-ladder-final |
| Live homepage | https://rkrueth-maker.github.io/highway-38-solutions/ |
| Deploy workflow | https://github.com/rkrueth-maker/highway-38-solutions/actions/workflows/pages.yml |
| Verify workflow | https://github.com/rkrueth-maker/highway-38-solutions/actions/workflows/verify-pages.yml |
| Pages settings | https://github.com/rkrueth-maker/highway-38-solutions/settings/pages |
