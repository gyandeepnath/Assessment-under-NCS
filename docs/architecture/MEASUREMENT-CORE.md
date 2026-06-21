# Shared Measurement Core — Implementation Notes

This documents the first implementation pass of the **shared measurement core**: the
construct-agnostic machinery every future module will reuse. It deliberately stops short of
any clinical module, the session-orchestrator FSM, and host shells (those need a concrete
module and are marked *deferred* in code).

- **Runtime:** TypeScript executed directly by Node ≥ 22 (native type stripping). No bundler.
- **Tests:** Node's built-in runner (`node --test`). **66 tests, all passing.**
- **Type safety:** strict `tsc --noEmit` (incl. `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) passes on source and tests.
- **Runtime dependencies: none.** Dev-only tooling: `typescript`, `@types/node`.

Run locally:

```bash
npm install        # links workspaces + dev tooling, no runtime deps
npm test           # node --test  → 66 passing
npm run typecheck  # tsc -p tsconfig.json
```

## Component-by-component

### `core-contracts` — shared types (no logic)
The lingua franca all packages import. Implementing the core surfaced small, honest
additions: optional **screen-metadata** fields on `DeviceSignals` (for device profiling) and
renaming the persisted longitudinal record to `UserBaseline` to disambiguate it from the
module-facing `Baseline`.

### `core-engine/rng` — randomization utilities
`Mulberry32`, a seedable 32-bit PRNG (FNV-1a string→seed), exposing `next/int/pick/shuffle`.
Chosen over `Math.random()` because the engine **must be reproducible**: the same seed yields
the same stimulus order and optotype identities, which is what makes replay, simulation, and
audit possible. Not cryptographic — it doesn't need to be. *Tested:* reproducibility,
range, uniformity, non-mutating Fisher–Yates, input validation.

### `core-engine/clock` — monotonic time
`Clock` interface with `SystemClock` (monotonic `performance.now()`) and `ManualClock`
(test/simulation, with monotonicity enforced). All timing is injected so tests are
deterministic and fast.

### `core-engine/timing` — stimulus timing
`StimulusTimer` classifies a trial's temporal envelope from host-stamped timestamps:
`valid` / `anticipatory` (<200 ms, likely a guess) / `timeout` (beyond the response window),
and enforces the inter-stimulus interval between trials. The engine never renders — it
*classifies* timing — so this stays a pure function of timestamps. *Tested:* each
classification, ISI enforcement, monotonicity guard.

### `core-engine/trial-log` — response logging
`TrialLog` is **append-only**: no update/delete API, and every record is deep-frozen on
append so the scientific record cannot be retroactively altered. It exposes ordered reads,
per-session filtering, and subscriptions (the data layer and QC hooks listen). *Tested:*
ordering, immutability (deep freeze), filtering, subscribe/unsubscribe.

### `core-engine/adaptive` — adaptive threshold utilities (the psychophysics)
Implemented faithfully, not approximated:
- **`psychometric`** — cumulative-Gaussian (probit) and Weibull functions in the standard
  `γ + (1−γ−δ)·F((x−μ)β)` form, with an `erf` approximation. *Tested:* asymptotes,
  monotonicity, midpoint-at-threshold, parameter validation.
- **`staircase`** — transformed up/down (Levitt 1971): `nDown`/`nUp` rules, reversal tracking,
  optional step-shrinking, threshold = mean of last *N* reversals. Used for fast bracketing.
  *Tested:* step rules, reversal detection, clamping, stopping, config validation.
- **`questplus`** — Bayesian adaptive estimation (Watson 2017 QUEST+): a posterior over a
  parameter grid; each trial picks the stimulus **minimising expected posterior entropy**;
  Bayesian update; posterior-mean threshold + SD, with stopping on posterior width. *Tested
  by ground-truth recovery:* over 60 seeds the recovered threshold is **unbiased** (|bias|
  < 0.08) and RMSE shrinks with trial count; posterior SD shrinks with evidence; the
  stopping rule fires; joint threshold+slope estimation still recovers the threshold.

### `calibration-engine` — device, distance, geometry, adequacy, environment
- **`device-profile`** — resolves a `DeviceProfile` by curated DB → reported PPI →
  resolution+diagonal → **per-device-class fallback** (flagged `isFallback`). No single device
  class is hard-coded; the resolution source is recorded for audit.
- **`distance`** — attaches a method-specific uncertainty to every viewing-distance estimate
  (cord < camera < user-reported) and grades confidence; camera estimation is explicitly
  uncertain and never silently trusted.
- **`geometry`** — the single authoritative degrees↔pixels mapping
  (`size = 2·d·tan(θ/2)`), plus pixels-per-degree. No module re-derives it.
- **`adequacy`** — scale-agnostic pixel-density gate: computes the finest renderable detail
  (arcmin) and returns a **quality cap** rather than an over-confident measurement when the
  device can't resolve what a module needs.
- **`environment`** — captures ambient light **only if available** (records availability
  explicitly), plus brightness/dark-mode/orientation/battery context.
*Tested:* DB/PPI/resolution/fallback paths, distance grading and validation, geometry
round-trip and distance scaling, adequacy pass/cap, ambient-available vs not.

### `quality-engine` — QC hooks, scoring, claim gating, completeness
- **`hooks`** — a registry of pure checks run at `preflight` (may **block**) or `inflight`
  (may **flag**), aggregated into a `QualityVerdict`. The engine provides the mechanism;
  policy is pluggable.
- **`checks`** — generic, configurable device/environment checks (dark mode/colour filter →
  block; auto-brightness/illuminance/battery → flag; latency anomalies → flag). These are
  engine-level, **not** clinical-module scoring.
- **`scoring`** — composable weighted 0–100 score → band, with an optional cap (e.g. from
  adequacy). Weights/thresholds come from a module-supplied `QualityModel`.
- **`claim-gate`** — enforces, in code, that permitted output is the **minimum** of what the
  quality band and the validation status allow (structural prevention of unsupported claims).
- **`completeness`** — gates scoring on minimum valid trials and an error+correct pair.
*Tested:* blocking vs flagging, missing-sensor info-flag, scoring/banding/cap, the full claim
matrix, completeness rules.

### `data-layer/export` — exportable raw data
`buildExportBundle` + `toJson` (key-sorted, deterministic, lossless) + `toCsv` (flattened,
escaped trial table). The bundle carries trials + session + calibration + versions, so an
external tool can **recompute the result off-device** — the operational test of
reproducibility. *Tested:* bundle assembly, deterministic JSON, CSV shape and escaping,
format dispatch.

### `simulation/observers` — virtual observer (dev only)
`PsychometricObserver` with known ground-truth parameters, used to validate the procedures by
recovery. Deterministic given a seed. *Tested:* asymptotes, determinism, and an end-to-end
cross-package recovery (QUEST+ centres on the observer's true threshold).

## Assumptions made

1. **TypeScript on Node ≥ 22 with native type stripping**, no bundler. Cross-package imports
   resolve via npm-workspace symlinks + `exports` pointing at `src/index.ts`. (A build step
   can be added later; nothing here depends on one.)
2. **Strength convention for adaptive code.** The engine treats stimulus "intensity" as
   *strength* (higher ⇒ easier ⇒ higher P(correct)). Each module maps its own scale (e.g.
   logMAR, log-contrast) onto strength. This keeps the core construct-agnostic; the mapping
   is a module responsibility and is not baked into the engine.
3. **No parameter properties / no enums in hot code.** Node's strip-only mode rejects them, so
   classes use explicit fields and the contracts use string-literal unions.
4. **Physical-unit stimulus model is sufficient** for the constructs targeted first (acuity/
   contrast). Colour and stereo may need richer photometry; the contracts allow it but the
   core does not assume it.
5. **Quality scoring is a framework, not a fixed policy.** The engine provides weighted
   composition + banding + capping; concrete components/weights belong to each module.
6. **Adequacy is reported in arcminutes** (scale-agnostic). Converting to a construct scale
   (e.g. logMAR) is left to the module, so the core makes no construct-specific claim.
7. **Distance uncertainty defaults are placeholders** (cord 2 cm, camera 5 cm, user 10 cm)
   pending per-device validation; they are overridable and only affect quality grading, never
   the geometry silently.
8. **The curated device database is illustrative** (two entries + per-class fallbacks). The
   real database is a versioned data asset to be populated later.
9. **Test tolerances reflect statistics, not shortcuts.** Recovery tests assert the
   scientifically meaningful property (unbiasedness + convergence) over many seeds, because a
   stochastic adaptive procedure has irreducible per-run variance at finite trial counts.
10. **Only dev tooling was added** (`typescript`, `@types/node`); there are **zero runtime
    dependencies**.

## Explicitly deferred (not in this pass)

Session-orchestrator FSM, trial-runner integration, module-host sandbox, storage adapters
(sqlite/postgres/in-memory), and the full simulation harness — all of which require a concrete
`ModulePlugin` and/or host shell that do not yet exist. Their folders carry placeholders that
name the responsibility and point back to the architecture.
