# Keep-number communications and AI receptionist acceptance

The Business Office communications changes are provider-neutral and tenant-scoped. They keep the existing carrier number in place. Native phone and messaging apps are launched only after the user chooses Call or Text. The Office records the handoff and waits for an explicit user outcome; opening a dialer or Messages is not treated as a completed contact.

## Automated acceptance

Run `npm run test:native-ai-communications` and the existing Business Office fast checks. The focused verifier checks that: native actions do not invoke a messaging provider; call and text outcomes require user confirmation; receptionist tests use the existing `aiAsk` route; simulation records are saved with the active business; only owners/administrators can edit receptionist settings; test mode is not enabled by default for a non-H38 business; customer history includes communication logs; and live voice and forwarding remain disabled; H38's plowing and lawn-care site-visit rules are covered.

## Staff test bench

1. Sign in to the Highway 38 Business Office and open **Communications → Receptionist test**, or use the global quick-create action.
2. Confirm the screen says simulation only. Choose a customer if the test should use an existing customer context.
3. Enter or dictate a test caller prompt. Listen for a calm, natural U.S. English voice and a short reply that asks one question at a time. Browser speech recognition may process audio through the browser/platform speech service; H38 stores the resulting text, not an audio recording. Typed input is available in every browser.
4. Try a service-area question, quote intake, an after-hours message, an authorized billing question, a pricing/refund request and an urgent message. Verify the response uses only the profile and authorized context, asks for missing details, and does not claim it contacted anyone or changed anything. For a new plowing or lawn-mowing property, verify it requests a site visit before quoting or starting service. With an existing customer selected, verify it asks for a preferred service day or window and directs staff to Schedule for office confirmation; it must not claim the work is booked. If a caller says they are an existing customer but no account is selected, verify it asks for identifying details so staff can check the account.
5. Use **Create internal quote request** only when the intake should become an internal record. Confirm the request appears in the selected customer’s history. No quote or customer message is sent.
6. Update greeting, hours, service area, services, FAQs, routing, after-hours and allowed-information settings while signed in as an owner or administrator. Verify the setting is attached to the active business. Confirm a Northern business is disabled until its own owner explicitly enables its settings.

## Native call/text checks on a phone

1. In Customer 360, choose **Call**. Confirm the native dialer opens with the current customer number and the Office records the outcome as unconfirmed. Return to the Office, select the outcome you observed, and save it.
2. Choose **Text**, review the draft, and continue to the native Messages app. Confirm that opening Messages does not mark the text as sent. After sending it yourself, return to Communications and press **I sent this text**; otherwise leave it unconfirmed.
3. On desktop, confirm Text copies the number and draft and reports that nothing was sent.
4. Confirm the customer timeline shows call/text records and their user-confirmed outcomes.
5. Confirm no carrier, number, forwarding, provider, or billing setting changed.

## Release boundary

Live voice provider activation and conditional forwarding are out of scope and remain disabled. iPhone and Android microphone, dialer, and Messages behavior requires manual acceptance on those devices; browser/static checks cannot establish those device results.
