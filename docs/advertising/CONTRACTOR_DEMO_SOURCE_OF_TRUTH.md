# Contractor Demo and Advertising Source of Truth

## Permanent source

All contractor-demo quote content and contractor-facing advertising content must be maintained in:

`assets/js/h38-contractor-demo-data.js`

This file controls:

- demo project titles and quote numbers;
- base scopes and regional benchmark prices;
- measurements, quantities, assumptions, and exclusions;
- itemized quote records;
- optional upgrades and upgrade prices;
- before-and-after image assignments and captions;
- Highway 38 capabilities language;
- sample regional planning ranges;
- platform-pricing and call-to-action language.

## Pages that consume this source

- `contractor-demo.html`
- `contractor-demo-quote.html`
- `contractor-capabilities.html`
- the optional Highway 38 advertising page printed with a demo quote.

Do not copy pricing or advertising wording into another independent data file. When contractor advertising, capabilities, pricing examples, or demo quotes change, update the central source and verify every consuming page in the same pull request.

## Required update procedure

1. Update the version and updated date in `h38-contractor-demo-data.js`.
2. Update all affected scope, itemization, option, pricing, image, and advertising records together.
3. Confirm every base itemization equals its displayed base quote.
4. Confirm selected options recalculate the screen, itemized record, and printed total.
5. Confirm before-and-after visuals represent the same project/property and preserve fixed features and camera viewpoint whenever a concept rendering is used.
6. Confirm the approved Highway 38 logo cache key remains unchanged unless the approved-asset manifest changes.
7. Test desktop, mobile, print, Save as PDF, and no-itemization/no-advertising choices.
8. Verify the Demo Center, every example quote, the capabilities page, and the live GitHub Pages routes.

## Contact rule

Until the Owner explicitly changes it, contractor-demo and advertising materials use only:

`highway38solutions@gmail.com`

Do not publish a phone number in these materials.

## Truth and disclosure controls

Every hypothetical example must remain clearly labeled as hypothetical and must not be described as a real customer, accepted contract, or completed project. Regional sample prices require field measurements, supplier pricing, access, site-condition, permit, hauling, disposal, and owner-scope verification before customer use.
