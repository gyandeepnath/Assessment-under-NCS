# PVANC v1 — Implementation Note

Version 1 of the Presenting Visual Acuity Under Non-Clinical Conditions module
(`PVANC-1.0-SPEC`), built entirely on the shared measurement core. **36 module tests
pass; strict `tsc` is clean.** The module imports only engine packages — never another
module.

## What it does

Implements the spec's §6.2 **hybrid adaptive procedure** and §9 scoring:

1. **Calibration** (`@vision-platform/calibration-engine`): resolves a device profile,
   attaches a viewing-distance estimate with method-specific uncertainty, captures the
   ambient environment, and runs the pixel-density adequacy gate.
2. **Pre-flight QC** (`@vision-platform/quality-engine`): blocks on dark mode / colour
   filter; flags auto-brightness, illuminance, low battery.
3. **Phase 1 — staircase bracketing** (`Staircase`): a fast 1-up/1-down descent from the
   largest optotype to bracket the threshold and detect a floor (5 consecutive errors).
4. **Phase 2 — QUEST+ refinement** (`QuestPlus`): Bayesian posterior over (threshold, slope)
   with a weak slope prior (mean 2.0, SD 0.5; §6.2). Phase 1 trials are **replayed** into the
   posterior as valid observations, so the hybrid accelerates Phase 2 **without bias**.
5. **Scoring** (§9): logMAR estimate = posterior mean; 68% / 95% credible intervals; screening
   category (age-norm-relaxed only); Snellen/decimal/ETDRS conversions.
6. **Two outputs**: the measurement (`ModuleResult`) and the reliability/confidence output
   (`QualityScore` — the five §9.3 components, band, and flags), plus the claim-gate verdict.
7. **Trial logging**: every Phase 1 and Phase 2 trial is written to the append-only trial log
   with full provenance; a raw JSON export bundle is produced.

## Key design decision: strength = logMAR size

The engine's adaptive procedures work in a "strength" convention (higher = easier). For
acuity that is satisfied directly by using **optotype size in logMAR** as the strength — a
larger optotype is a higher logMAR size and easier — so the recovered QUEST+ threshold *is*
the logMAR acuity, with no transform. This keeps the core construct-agnostic.

## Measurement correctness

Ground-truth recovery against the reference observer is **unbiased** across the range
(bias ≈ 0.00 at true logMAR 0.0 / 0.3 / 0.6) with RMSE ≈ 0.09–0.17 over ~32 trials — in line
with the spec's repeatability targets (§12, ±0.15–0.18 logMAR). An earlier +0.10 bias was
found and fixed: the Phase 1 bracket (which stops at the first error, above threshold) was
seeding the QUEST+ prior; replacing that with a uniform threshold prior + replay of the
Phase 1 trials removed the bias. The fix was verified by isolating the core (unbiased) from
the module before changing the module.

## Edge cases handled (tested)

- Under-18 / unsupported device → **blocked** before measuring.
- Dark mode active → **blocked** (QC pre-flight).
- Cannot see the largest optotype → **floor → inconclusive**, `retake`.
- Responses beyond the 5 s window → recorded as errors, flagged, → **inconclusive**.
- Too few valid Phase 2 trials → completeness gate → **inconclusive** (no category).
- Coarse display / short distance → adequacy gate fails → **quality capped** at 70; and when the estimate is as fine as or finer than the display can render, the result is marked **device-limited** (category suppressed to `inconclusive`, `device-limited-result` flag, retake) so it is never read as reduced *eye* acuity. Genuine low vision on an adequate device keeps its category.
- Wrong-but-confident viewing distance → optional **distance corroboration**; disagreement widens uncertainty, collapses the distance-stability component, flags `distance-corroboration-disagreement`, and drops to retake; an uncorroborated distance carries a `distance-uncorroborated` info flag.
- User-reported vs measured distance → lower distance-stability component.
- Floating-point grid drift in the staircase → rounded to the optotype grid.

## No unsupported claims

`validationStatus: 'provisional'` (built to spec, not yet ETDRS-validated), so the claim gate
caps output at `trend-with-caveat` — never a full clinical claim. Every result carries the
mandatory limitations (not BCVA, not a diagnosis, central vision only, not for legal/
certification/treatment use, not clinically validated).

## Deliberately deferred (not v1)

Practice trials, multi-language instructions, baseline/trend persistence (the MDC and
baseline-comparison functions exist on the plugin but no longitudinal store is wired),
Sloan/Landolt optotypes, camera-based distance, and photometric luminance/gamma calibration.

## Run

```bash
npm test          # node --test  → 102 passing (66 core + 36 PVANC)
npm run typecheck  # strict tsc
```
