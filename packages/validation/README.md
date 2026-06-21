# `@vision-platform/validation` — Validation Layer

**This is where validation lives.** Validation produces the evidence that gates claims
(`research-only → provisional → validated`). It is a first-class deliverable, not a test
folder. Two tiers.

> Skeleton status: placeholders only. No statistical logic yet. See
> `docs/architecture/ARCHITECTURE.md` §9.

## Tier A — automated (runs in CI on every change)

Simulation-driven checks that must pass to merge:

| Folder / check | Method | Pass criterion |
|---|---|---|
| `recovery/` | Ground-truth recovery via simulation sweeps | bias & variance within the module's declared tolerance |
| (determinism) | re-run from seed + trial log | bit-identical stimulus sequence & result |
| (convergence) | trials-to-criterion distribution | within declared bounds; no non-termination |
| (QC behaviour) | inject degradations | flags fire; quality bands correct |

## Tier B — human-subjects (run per a module's validation protocol)

Statistical machinery that **consumes exported raw bundles** (from the data layer) plus
reference-standard data. It never touches the engine, keeping the system under test
separate from its evaluator.

| Folder | Role |
|---|---|
| `agreement/` | Bland-Altman (mean bias + 95% LoA), ICC, limits-of-agreement calculators. |
| `reliability/` | Test-retest reliability and Minimum Detectable Change (MDC). |
| `reports/` | Generated, version-stamped validation artefacts (CI-checked). |

## Acceptance criteria are data, not code

Each module declares its targets in `docs/validation/<module>.protocol.yaml` (e.g. PVANC
§13.2: bias, LoA, ICC thresholds). This package reads those — it has no module-specific
logic baked in. A module's `validationStatus` is only advanced when the corresponding
Tier-B report meets its protocol's criteria; until then the claim gate caps what the module
may output.

## Where module-specific validation lives

- Cross-cutting tooling and reports: **here** (`packages/validation/`).
- A module's own recovery harness and protocol: in that module
  (`packages/modules/<name>/validation/`) and `docs/validation/<module>.protocol.yaml`.

## Dependencies

`@vision-platform/core-contracts` and `@vision-platform/simulation` (for Tier A).
