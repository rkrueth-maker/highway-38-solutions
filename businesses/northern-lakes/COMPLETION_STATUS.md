# Northern Lakes Complete Build Status

## Repository implementation complete
- Public website and required public pages
- Quote request flow with confirmation numbers
- Customer Portal application surface
- Owner Portal application surface
- Business Office application surface
- Executable Northern Lakes Apps Script business pack
- Shared Highway 38 Quote Builder engine installed under the Northern Lakes pack
- Separate Take Picture and Upload Photos controls
- Voice/photo field intake
- Owner-gated AI quote drafting and Price Book matching
- Owner-gated proposed-completion concept rendering
- Dedicated NLPS configuration keys, namespace and storage boundaries
- Roles, approval controls and external-action locks
- Dedicated installation verifier
- Dedicated create-or-update deployment workflow
- Canonical metadata, structured data, robots.txt and sitemap.xml
- Responsive styling and accessible semantic page structure
- Approved Northern Lakes logo direction and website imagery

## Protected boundary
No Highway 38 URL, data record, Apps Script deployment ID, authentication setting, routing rule or production control is replaced. Northern Lakes uses the reusable core with an isolated `NLPS` business pack.

## Production activation
Run `.github/workflows/deploy-northern-lakes-business-office.yml` with the repository's encrypted Google clasp credential.

For the first run, leave `script_id` and `deployment_id` blank. The workflow creates one dedicated Northern Lakes Apps Script project and one web-app deployment, then records their IDs and URL in the workflow artifact.

For every later release, supply those recorded IDs. The workflow updates the existing Northern Lakes project and deployment in place rather than creating replacements.

Live AI generation also requires the repository secret `OPENAI_API_KEY`. Without it, the Quote Builder remains operational for camera, uploads, voice, manual quoting, Price Book work and approvals, while AI draft/render actions stay locked with an explicit configuration error.

Production PASS is valid only after the deployment workflow succeeds and the resulting Northern Lakes web-app URL passes authenticated browser verification.