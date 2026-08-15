import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGINAL_FETCH = globalThis.fetch.bind(globalThis);
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const BASE_SOURCE_COMMIT = "e8a33d12b67f6be2015a5dadea9b71ccfbd60800";
const BASE_SOURCE_URL = `https://raw.githubusercontent.com/rkrueth-maker/highway-38-solutions/${BASE_SOURCE_COMMIT}/supabase/functions/h38-quote-ai/index.ts`;

type Obj = Record<string, unknown>;

function text(value: unknown): string { return String(value ?? ""); }
function asObj(value: unknown): Obj { return value && typeof value === "object" ? value as Obj : {}; }
function parseJson(value: unknown): Obj {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" ? parsed as Obj : {};
  } catch (_) { return {}; }
}
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}
function deepClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function developerText(body: Obj): string {
  const input = Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    const row = asObj(item);
    if (row.role !== "developer") continue;
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      const p = asObj(part);
      if (p.type === "input_text") return text(p.text);
    }
  }
  return "";
}
function appendDeveloperText(body: Obj, extra: string): void {
  const input = Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    const row = asObj(item);
    if (row.role !== "developer") continue;
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      const p = asObj(part);
      if (p.type !== "input_text") continue;
      p.text = `${text(p.text)}\n\n${extra}`;
      return;
    }
  }
}
function userContext(body: Obj): Obj {
  const input = Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    const row = asObj(item);
    if (row.role !== "user") continue;
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      const p = asObj(part);
      if (p.type === "input_text") return parseJson(p.text);
    }
  }
  return {};
}
function enforceCostTypeSchema(body: Obj): void {
  const schema = asObj(asObj(asObj(body.text).format).schema);
  const properties = asObj(schema.properties);
  const suggested = asObj(properties.suggestedLines);
  const items = asObj(suggested.items);
  const lineProps = asObj(items.properties);
  lineProps.costType = { type: "string", enum: ["material", "labor", "equipment", "other"] };
  const required = Array.isArray(items.required) ? items.required.map(text) : [];
  if (!required.includes("costType")) required.push("costType");
  items.required = required;
}
function outputText(payload: Obj): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(asObj(item).content) ? asObj(item).content as unknown[] : [];
    for (const part of content) {
      const p = asObj(part);
      if (p.type === "output_text" && typeof p.text === "string") return p.text;
    }
  }
  return "";
}
function scopeRequires(context: Obj, target: "insulation" | "drywall"): boolean {
  const scope = `${text(context.scope)} ${text(context.ownerInstructions)}`.toLowerCase();
  return target === "insulation" ? /\binsulat(e|ed|ing|ion)\b/.test(scope) : /\b(drywall|sheet\s*rock|sheetrock)\b/.test(scope);
}
function targetLine(line: Obj, target: "insulation" | "drywall"): boolean {
  const description = text(line.description).toLowerCase();
  return target === "insulation" ? /\binsulat(e|ed|ing|ion)\b/.test(description) : /\b(drywall|sheet\s*rock|sheetrock)\b/.test(description);
}
function draftProblems(draft: Obj, context: Obj): string[] {
  const lines = Array.isArray(draft.suggestedLines) ? draft.suggestedLines.map(asObj) : [];
  const problems: string[] = [];
  const badQty = lines.filter((line) => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0);
  if (badQty.length) problems.push(`non-positive quantity: ${badQty.slice(0, 4).map((line) => text(line.description)).join(" | ")}`);
  for (const target of ["insulation", "drywall"] as const) {
    if (!scopeRequires(context, target)) continue;
    const relevant = lines.filter((line) => targetLine(line, target));
    const materials = relevant.filter((line) => text(line.costType).toLowerCase() === "material");
    const labor = relevant.filter((line) => text(line.costType).toLowerCase() === "labor");
    if (!materials.length || !labor.length) problems.push(`${target} material/labor split missing`);
  }
  return problems;
}
const BREAKOUT_CONTRACT = [
  "H38 NON-NEGOTIABLE COMPONENT TAKEOFF CONTRACT:",
  "Every suggestedLines row MUST set costType to material, labor, equipment, or other.",
  "If insulation is in scope, output distinct INSULATION MATERIAL and INSULATION LABOR rows. Do not output only an installed/blended insulation row.",
  "If drywall/sheetrock is in scope, output distinct DRYWALL MATERIAL and DRYWALL LABOR rows. Do not output only a waste/disposal row or a blended installed drywall row.",
  "Prefer separate wall and ceiling rows where labor factors or material assemblies differ.",
  "Material purchase/order quantity = net installed material quantity plus 10%. State the net quantity and 10% ordering allowance in the material rationale.",
  "Labor quantity = net installed quantity only. Never apply the 10% material allowance to labor.",
  "Do not use blended installed assembly sell rates as material-only or labor-only rates.",
  "Use these existing owner-review assembly calculation bases when applicable: R-19 wall insulation material basis $1.06/SF and labor 0.01 hr/SF × $65/hr = $0.65/SF; R-24 ceiling insulation material basis $1.25/SF and labor 0.014 hr/SF × $65/hr = $0.91/SF; standard drywall wall labor 0.02 hr/SF × $65/hr = $1.30/SF; standard drywall ceiling labor 0.026 hr/SF × $65/hr = $1.69/SF; standard 1/2-in 4x8 drywall uses 0.03125 sheet per installed SF before the 10% material order allowance.",
  "Use exact raw-material Price Book rows for material pricing when available; otherwise use owner-review-required local_research/manual component pricing.",
  "Do not ask again for a dimension already present as FIELD_MEASURED, OPERATOR_VERIFIED, FIELD_VERIFIED, VERIFIED_BY_OPERATOR, or VERIFIED structured evidence. A camera estimate does not override or invalidate a verified measurement.",
  "For the current Garage evidence, verified 26 ft × 26 ft overall size and verified 105 in ceiling height are controlling when present; two verified 9 ft × 7 ft garage-door openings and the verified 36 in × 80 in service-door opening control over camera estimates.",
  "Never approve, send, purchase, pay, schedule, or financially commit anything. All rates remain owner-review required.",
].join(" ");

async function interceptedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = requestUrl(input);
  if (url !== OPENAI_RESPONSES_URL || !init?.body || typeof init.body !== "string") return ORIGINAL_FETCH(input, init);
  const body = parseJson(init.body);
  const format = asObj(asObj(body.text).format);
  if (format.name !== "h38_quote_draft") return ORIGINAL_FETCH(input, init);

  const prepared = deepClone(body);
  enforceCostTypeSchema(prepared);
  if (!developerText(prepared).includes("H38 NON-NEGOTIABLE COMPONENT TAKEOFF CONTRACT")) appendDeveloperText(prepared, BREAKOUT_CONTRACT);
  const context = userContext(prepared);
  const first = await ORIGINAL_FETCH(input, { ...init, body: JSON.stringify(prepared) });
  const firstRaw = await first.text();
  if (!first.ok) return new Response(firstRaw, { status: first.status, statusText: first.statusText, headers: first.headers });
  const firstPayload = parseJson(firstRaw);
  const firstDraft = parseJson(outputText(firstPayload));
  const problems = draftProblems(firstDraft, context);
  if (!problems.length) {
    console.log(JSON.stringify({ event: "quote-ai-component-contract-pass", repair: false }));
    return new Response(firstRaw, { status: first.status, statusText: first.statusText, headers: first.headers });
  }

  const repaired = deepClone(prepared);
  appendDeveloperText(repaired, [
    "SERVER REPAIR REQUIRED: the previous draft violated the component takeoff contract.",
    `FAILURES: ${problems.join(" || ")}`,
    `PREVIOUS DRAFT: ${JSON.stringify(firstDraft).slice(0, 12000)}`,
    "Rebuild the full draft now. Produce genuinely separate positive-quantity material and labor rows for every in-scope insulation and drywall component. Do not merely rename the prior blended line.",
  ].join(" "));
  const second = await ORIGINAL_FETCH(input, { ...init, body: JSON.stringify(repaired) });
  const secondRaw = await second.text();
  if (!second.ok) return new Response(secondRaw, { status: second.status, statusText: second.statusText, headers: second.headers });
  const secondPayload = parseJson(secondRaw);
  const secondDraft = parseJson(outputText(secondPayload));
  const remaining = draftProblems(secondDraft, context);
  if (remaining.length) {
    console.warn(JSON.stringify({ event: "quote-ai-component-contract-fail", problems: remaining }));
    return new Response(JSON.stringify({ error: { message: `Quote AI still failed the server component breakout contract after repair: ${remaining.join("; ")}. No blended or zero-quantity draft was returned.` } }), {
      status: 422,
      headers: { "content-type": "application/json" },
    });
  }
  console.log(JSON.stringify({ event: "quote-ai-component-contract-pass", repair: true }));
  return new Response(secondRaw, { status: second.status, statusText: second.statusText, headers: second.headers });
}

globalThis.fetch = interceptedFetch as typeof fetch;
await import(BASE_SOURCE_URL);
