---
name: h38-ux-polish
description: Perform a systematic Highway 38 Business Office UX and flow polish on desktop and phone. Use when the user asks to polish, simplify, improve flow, find dead ends, reorganize buttons, or make Office easier for operators.
---

1. Start from the canonical runtime and current shared components. Do not invent a second shell or navigation system.
2. Inspect the full task path, not isolated screenshots. Follow the operator from entry point through completion.
3. Check desktop and phone separately for:
   - navigation discoverability;
   - primary action hierarchy;
   - button placement and labels;
   - form order and required fields;
   - back/cancel/save behavior;
   - loading/empty/error/success states;
   - list/card density and tap targets;
   - keyboard/viewport behavior;
   - dead ends and hidden actions;
   - stale or duplicated status information.
4. Put the most important current-customer context and next action first; secondary history belongs lower or behind detail views.
5. Keep common creation actions available through the canonical create/+ flow rather than scattering duplicate buttons.
6. Prefer shared component fixes when multiple tenants/screens show the same problem.
7. Protect startup and route-performance budgets while polishing. Do not solve UX problems with broad observers, duplicate fetches, or page-specific global hacks.
8. Verify accessibility basics: readable labels, meaningful control text, keyboard/focus behavior where applicable, sufficient structure, and descriptive alt text for non-decorative imagery.
9. Re-run affected end-to-end workflows after polish; visual correctness alone is not acceptance.
10. Return findings grouped as `BLOCKER`, `FLOW`, `MOBILE`, `CLARITY`, `CONSISTENCY`, and `POLISH`, without assigning arbitrary scores unless the user explicitly provided a non-political product rubric.
