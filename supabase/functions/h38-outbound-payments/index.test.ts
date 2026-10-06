// Unit checks for h38-outbound-payments pure helpers.
// Run: deno test --allow-env supabase/functions/h38-outbound-payments/index.test.ts
import { buildTransferPayload, mapDwollaStatus, transferFee } from "./index.ts";

function eq(a: unknown, b: unknown, label: string) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${label}: expected ${y}, got ${x}`);
}

Deno.test("fee shape: 0.5% with $0.05 floor and $5 cap", () => {
  eq(transferFee(0), 0, "zero");
  eq(transferFee(1), 0.05, "floor");
  eq(transferFee(100), 0.5, "mid");
  eq(transferFee(2400), 5, "payroll-sized hits cap, not $12");
});

Deno.test("transfer payload is bank-to-bank with idempotency metadata", () => {
  const p = buildTransferPayload({
    sourceUrl: "https://api-sandbox.dwolla.com/funding-sources/src",
    destinationUrl: "https://api-sandbox.dwolla.com/funding-sources/dst",
    amount: 12.34,
    idempotencyKey: "h38-biz-BILL-1",
  });
  eq(p.amount, { currency: "USD", value: "12.34" }, "amount");
  eq(p._links.source.href.endsWith("/src"), true, "source");
  eq(p._links.destination.href.endsWith("/dst"), true, "destination");
  eq(p.metadata.h38IdempotencyKey, "h38-biz-BILL-1", "idem");
});

Deno.test("dwolla status mapping covers the register states", () => {
  eq(mapDwollaStatus("pending"), "pending", "pending");
  eq(mapDwollaStatus("processed"), "processed", "processed");
  eq(mapDwollaStatus("failed"), "failed", "failed");
  eq(mapDwollaStatus("cancelled"), "canceled", "cancelled");
  eq(mapDwollaStatus("reclaimed"), "returned", "returned");
  eq(mapDwollaStatus("something-new"), "pending", "unknown stays pending, never paid");
});
