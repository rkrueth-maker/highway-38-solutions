# Price refresh research — what a search can and cannot honestly refresh

Date: 2026-11-09. Trigger: Rick's direction — "We can update prices with a
search every 30 days but we should look up what we can."

Context: the quote validator (`h38-quote-ai`, `LOCAL_RESEARCH_REFRESH_DAYS = 30`,
freshness measured from `price_book_items.updated_at`) demotes any
`local_research` row older than 30 days to a manual-required allowance.
On Rick's H38 tenant today: 113 active `local_research` rows, 69 priced,
44 of the priced rows older than 30 days (measured 2026-11-09). The other
55 active rows are `source_type='business'` (owner-set) and unpriced.

The four price classes, and what is actually searchable for each:

## (a) Materials with published retail/list prices — SEARCHABLE, from the source page only

Retailers publish real, current, per-product prices on their product pages,
including structured data a machine can read honestly:

- **Menards** product pages carry a schema.org JSON-LD `Product` offer.
  Verified live 2026-11-09: "3/8 x 4 x 8 Standard Drywall" (SKU 1311206)
  page returns `Price: 13.33 USD` in its JSON-LD offer block.
  Caveat, proven on the same page: Menards' JSON-LD price is the
  **after-11%-mail-in-rebate value** ($13.33); the shelf "Everyday Low
  Price" on that page is $14.98. Every source has its own price semantics —
  a refresh must record the source and let the owner see exactly what the
  number is, never silently equate it with a shelf price.
  Source: https://www.menards.com/main/building-materials/drywall/drywall-sheets/3-8-x-4-x-8-standard-drywall/1311206/p-1444422397786-c-5656.htm
- **Home Depot / Lowe's** product pages likewise publish a price and a
  per-square-foot unit price (e.g. USG Sheetrock 1/2" x 4' x 8' UltraLight
  shown at $14.60/sheet, 46¢/sq ft, with a bulk tier price). Their pages are
  heavier and more bot-guarded than Menards', so per-source fetch success
  varies; a failed or price-less fetch must produce NO finding, never a
  guess.
- **Homewyse** cost guides are a worked example of the honest pattern:
  their material figures are explicitly "Product and Supplies Data: Home
  Depot … Website" — i.e., read off retailer listings, refreshed monthly.
  Source: https://www.homewyse.com/services/cost_to_install_batt_floor_insulation.html
- Manufacturer list prices (USG, Owens Corning, Johns Manville) exist for
  some lines but are inconsistently published per SKU; usable only when the
  row's stored source link points at a page that actually prints a price.

**The hard rule this research produces:** a search-engine *result* is never
a price. Snippets mix dates, regions, pack sizes and rebate math. The only
honest machine refresh is: take the exact source URL stored on the price
row, fetch that page, read the price the page itself publishes (JSON-LD
offer), and put it in front of the owner with the source link and date.
Rows without a stored source link cannot be refreshed by search — full
stop. (44 of H38's priced local_research rows carry their rates in
`unit_cost`/description-era fields from the original research pass; whether
each carries a usable source URL in `source_note` decides whether it joins
the refresh — the scan reports those as `no_source` reviews instead of
inventing a source.)

Unit caveat: price-book material rows are often per-SF, while a retailer
page price is per sheet/bag/package. The scan stores the found price as the
page states it and shows the row's unit beside it; the owner converts
before approving. No automatic unit conversion is attempted — a wrong
automatic conversion is worse than none.

## (b) Labor rates — NOT searchable as a live price

There is no published, current, per-job "price of labor" to look up. What
exists is benchmark survey data:

- **BLS OEWS** (U.S. Bureau of Labor Statistics, Occupational Employment
  and Wage Statistics) publishes wage percentiles by occupation and state,
  updated **annually** (May survey). Drywall and ceiling tile installers:
  median $28.33/hr nationally (May 2025); Minnesota figures are published
  the same way. A wage is not a billing rate — billing adds burden,
  overhead and margin, which are the owner's business decisions.
  Source: https://www.bls.gov/ooh/construction-and-extraction/drywall-and-ceiling-tile-installers-and-tapers.htm
- **Homewyse / Angi / HomeAdvisor** installed-cost ranges are modeled
  estimates built from retailer material data plus wage models — useful
  context, not a price source for a specific business's rate.
- **RSMeans** labor/crew rates are a paid subscription (Data Online from
  $408/yr; assemblies at Complete tier from $1,049/yr) — licensed data,
  not a public search source, and buying it is Rick's call, not this
  system's.
  Source: https://www.rsmeans.com/products/online/tiers

Verdict: labor rows are **benchmark-only**. The refresh never proposes a
labor price. Once a month the owner gets a labor review that says exactly
that, and either confirms "still current" (freshness stamp) or edits the
rate by hand in the price book.

## (c) Assemblies — never searched directly; components refresh, assembly recomputes

An assembly (`price_book_assemblies`) is the business's own recipe:
component rows + waste % + labor hours + labor rate. No external page
publishes "the price" of a tenant's assembly, and the published assembly
libraries that do exist (RSMeans Assemblies) are paid licensed data with
national-average calibration problems (estimating literature reports
15–30% local adjustment is typical). The honest refresh path is the one
this system implements: the assembly's material component rows refresh
under (a), its labor stays owner-confirmed under (b), and the assembly's
stored cost fields recompute from components exactly as the app already
does when components change. The scan never writes an assembly row.

## (d) Owner-set and custom rows — never touched

Rows with `source_type='business'`, rows the owner has approved
(`approval_status='approved'`), and every blank/unpriced row are excluded
from scanning entirely. Blank stays blank: a row with no price is never
given one by automation (Rick's standing rule). Custom/flat rows (mobilization
fees, allowances the owner set) have no external source by definition.

## What shipped against this research

`h38-price-refresh` (edge function) + monthly pg_cron + Inventory-page
review card, build `20261109-price-refresh-1`:

- Scan: active `local_research`, non-approved, priced rows older than
  30 days. Material rows → fetch the row's stored source URL, read the
  JSON-LD offer price, write a pending review (item, current price, found
  price, source, date). Labor rows → benchmark-only review with no found
  price. No source URL → `no_source` review naming the gap. Fetch failure
  or no published price → `no_price_found`, no number invented.
- Resolve (owner/administrator JWT only): `approve` applies the found
  price and stamps `updated_at`; `still_current` keeps the price and
  stamps `updated_at`; `dismiss` records the decision and changes nothing.
  The stamp is what clears the validator's stale demotion — and it only
  ever happens on a recorded owner decision.
