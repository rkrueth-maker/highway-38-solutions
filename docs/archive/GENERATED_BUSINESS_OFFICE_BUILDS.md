# Generated Business Office Build Outputs

Archived during issue #180 repository cleanup.

The previously committed directories below were reproducible installer outputs, not authoritative source:

- `artifacts/business-office-separation/builds/`
- `artifacts/separate-business-office-platform/builds/`
- `dist/business-office/`

Authoritative reusable installer inputs remain under `packages/`, `apps/business-office/`, and `business-packs/`. Highway 38 production inputs remain under `apps-script/`, `business-packs/highway38/`, and the protected unified-shell assembly scripts.

Generated installations and verification evidence must be created during CI, acceptance, or an authorized installation run and retained as workflow artifacts or external operational evidence rather than committed as duplicate source trees.

Removing these generated files does not remove the installer, clean-install capability, production source, rollback history, or prior Git history.
