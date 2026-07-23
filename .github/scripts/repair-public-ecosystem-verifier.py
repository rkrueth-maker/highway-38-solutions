#!/usr/bin/env python3
"""Correct stale public-ecosystem checks to the accepted July 23 architecture."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "scripts/verify-public-ecosystem-tools.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return text.replace(old, new, 1)


def main() -> int:
    text = PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "const pages = ['ecosystem-status.html', 'customer-portal.html', 'business-concept-builder.html', 'tool-center.html', 'proof-center.html', 'portal.html'];",
        "const pages = ['ecosystem-status.html', 'customer-portal.html', 'business-concept-builder.html', 'proof-center.html', 'portal.html'];",
        "retired tool-center page list",
    )

    old_inline = """  const inlineScripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(match => match[1]).filter(Boolean);
  inlineScripts.forEach((source, index) => {
    try { new vm.Script(source, { filename: `${rel}:inline-${index + 1}` }); pass.push({ name: `${rel} inline script ${index + 1} syntax`, detail: '' }); }
    catch (error) { failures.push({ name: `${rel} inline script ${index + 1} syntax`, detail: error.message }); }
  });"""
    new_inline = """  const inlineScripts = [...html.matchAll(/<script([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match => !/\\bsrc=/.test(match[1]) && !/\\btype=[\"']application\\/(?:ld\\+)?json[\"']/i.test(match[1]))
    .map(match => match[2])
    .filter(source => source.trim());
  inlineScripts.forEach((source, index) => {
    try { new vm.Script(source, { filename: `${rel}:inline-${index + 1}` }); pass.push({ name: `${rel} inline script ${index + 1} syntax`, detail: '' }); }
    catch (error) { failures.push({ name: `${rel} inline script ${index + 1} syntax`, detail: error.message }); }
  });"""
    text = replace_once(text, old_inline, new_inline, "non-JavaScript script filtering")

    text = replace_once(
        text,
        "const ownerBusinessClient = read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');",
        "const ownerBusinessClient = read('apps-script/core-engine/owner-portal-next/Portal_Business_Client.html');\nconst moduleContract = read('apps-script/business-office/BusinessOffice_ModuleContract.gs');\nconst moduleRegistry = read('apps-script/core-engine/owner-portal-next/Portal_Module_Registry.js');",
        "canonical module sources",
    )

    text = replace_once(
        text,
        "check('owner portal is a single automatic secure gateway', /Opening Highway 38 Business System/.test(ownerPortal) && /location\\.replace\\(target\\)/.test(ownerPortal));",
        "check('owner portal is a single automatic secure gateway', /Opening Highway 38 Business Office/.test(ownerPortal) && /location\\.replace\\(target\\)/.test(ownerPortal));",
        "unified owner gateway label",
    )

    old_groups = "check('secure app includes command tasks messaging sales work money people documents growth and control', ['command','tasksWork','messaging','sales','work','money','people','documents','growth','control'].every(id => ownerUnified.includes(`id: '${id}'`)));"
    new_groups = """const canonicalGroupIds = ['command','sales','work','money','documents','growth','office'];
check('secure app derives seven workspace groups from canonical module contract',
  canonicalGroupIds.every(id => moduleContract.includes(`{id:'${id}'`)) &&
  /h38PortalModuleRegistry_/.test(ownerUnified) &&
  /boGetUnifiedModuleContract_/.test(moduleRegistry) &&
  /groups:groups/.test(ownerUnified)
);"""
    text = replace_once(text, old_groups, new_groups, "seven canonical workspace groups")

    text = replace_once(
        text,
        "check('owner portal preserves approval boundaries', /Customer sends, publishing, advertising spend, financial posting, payroll export, tax finalization, delivery/.test(ownerPortal));",
        "check('owner portal preserves approval boundaries', /External customer sends, publishing, financial posting, payroll export, tax finalization/.test(ownerPortal) && /owner-approval gated/.test(ownerPortal));",
        "current owner approval language",
    )

    old_tools = """const tools = read('tool-center.html');
check('four calculators', ([...tools.matchAll(/data-tool=/g)]).length === 4, String(([...tools.matchAll(/data-tool=/g)]).length));
check('calculator downloads', /new Blob/.test(tools) && /estimate\\.txt/.test(tools));
check('calculator coverage', ['area', 'labor', 'margin', 'project'].every(name => tools.includes(`data-tool=\"${name}\"`)));"""
    new_tools = """const tools = read('tool-center.html');
check('retired tool center redirects to project examples',
  /location\\.replace\\(['\"]sample-library-now\\.html\\?from=retired-tool-center['\"]\\)/.test(tools) &&
  /http-equiv=[\"']refresh[\"'][^>]+sample-library-now\\.html\\?from=retired-tool-center/i.test(tools)
);
check('retired tool center contains no calculator product runtime',
  !/data-tool=|new Blob|estimate\\.txt/.test(tools)
);"""
    text = replace_once(text, old_tools, new_tools, "retired calculator checks")

    PATH.write_text(text, encoding="utf-8")
    print("Public ecosystem verifier corrected to the accepted project-first and seven-group architecture.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
