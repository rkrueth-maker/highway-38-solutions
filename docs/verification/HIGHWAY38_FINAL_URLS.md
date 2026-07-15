# Highway 38 Final URL and Access Plan

## Current stable URLs

- Public website: `https://rkrueth-maker.github.io/highway-38-solutions/`
- Customer request: `https://rkrueth-maker.github.io/highway-38-solutions/start-request.html`
- Sample Library: `https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html`
- Problem Starter: `https://rkrueth-maker.github.io/highway-38-solutions/problem-starter.html`
- Owner Portal: `https://rkrueth-maker.github.io/highway-38-solutions/portal.html`
- Owner Operations workspace: `https://rkrueth-maker.github.io/highway-38-solutions/portal.html#operations`
- Business Office workspace: `https://rkrueth-maker.github.io/highway-38-solutions/portal.html#business-office`

Normal owner use starts at the Owner Portal. Embedded Google Apps Script URLs are implementation details, not normal shareable destinations. Administrative spreadsheets remain separately labeled, confirmation-protected, and outside ordinary operation.

## Future branded structure

- `https://www.highway38solutions.com/`
- `https://www.highway38solutions.com/start`
- `https://www.highway38solutions.com/samples`
- `https://www.highway38solutions.com/owner`

A custom domain is technically ready after the owner approves the domain purchase, registrar, DNS records, and recurring cost. Do not change DNS, connect billing, purchase a domain, or publish a new domain without owner approval.

## Required DNS actions after approval

1. Purchase or confirm the approved domain and registrar.
2. Configure the GitHub Pages custom-domain setting.
3. Add the required apex and `www` DNS records.
4. Verify GitHub Pages HTTPS issuance before announcing the domain.
5. Add clean redirects for `/start`, `/samples`, and `/owner` without exposing raw Apps Script or spreadsheet URLs.
6. Keep the current GitHub Pages URLs working as rollback destinations until final acceptance passes.

## Cost and security

GitHub Pages hosting remains free. A custom domain normally adds only the registrar's recurring domain fee; no purchase is authorized by this document. HTTPS must remain mandatory. Owner Portal and Business Office access continue to rely on authorized Google accounts, role checks, approval gates, and selected-record execution.

## Redirect and rollback plan

The branded routes should redirect to the current canonical pages while the existing GitHub Pages URLs remain valid. To roll back, remove the custom-domain DNS records and GitHub Pages custom-domain setting, then return all public references to the GitHub Pages URLs above. Do not delete the legacy Owner Portal, Apps Script deployments, workbooks, Drive storage, backups, or acceptance evidence during a URL rollback.
