# Highway 38 Commercial System — Technical Build Record

Status: Built on `commercial-overhaul`; not deployed.

## Controlled public catalog

`catalog-data.js` is the authoritative public-safe source for product IDs, names, families, public prices, summaries, scopes, formats, turnaround, revisions, payment wording, upgrade paths, bundles, sample content, and request routing.

Internal labor targets, gross-margin assumptions, private links, queue IDs, customer records, and credentials do not belong in the public catalog.

## Public page map

- `index.html` — outcome-first homepage
- `solutions.html` — customer solution paths
- `products.html` — full catalog, product details, pricing, and bundles
- `pricing.html` — controlled pricing view
- `sample-library-now.html` — one complete samples hub; retains the approved Owner Portal link location
- `how-it-works.html` — customer process and operating-control explanation
- `faq.html` — catalog-aligned questions
- `start-request.html` — conditional outcome-based request guide
- `ai-workflow.html` — digital workflow solution page
- `shop-automation.html` — manufacturing and automation planning page

Legacy package, examples, workbook, automation-example, and backend pages redirect to controlled destinations.

## Deployment boundary

No deployment, customer communication, quote send, payment request, final delivery, or public publishing is authorized by this branch.

## Intake implementation

The website guide performs outcome selection, product and bundle preselection, conditional family questions, and structured request-summary generation. The current owner-approved Google Form remains the final live submission endpoint until its questions and response mapping are updated and verified.

`apps-script/commercial-intake/FormBuilder.gs` creates the approved outcome-first Google Form after owner-approved execution and configuration. It creates a separate form and does not replace or publish the current form automatically.

## Verification requirements before deployment

1. Confirm all 15 products and 9 bundles against the operational catalog.
2. Confirm the current public form or execute the approved form builder in a controlled Apps Script project.
3. Test all links, redirects, product preselection, conditional intake fields, printing, mobile navigation, keyboard focus, and the Owner Portal link.
4. Confirm no secrets, customer data, private Drive links, Gmail IDs, API credentials, tokens, or internal labor/margin data are present.
5. Obtain Rick approval for deployment.
