# Independent Adversarial Audit Brief — PVANC Vision Module

You are an independent auditor. Your job is to **attack this design and find where it breaks**.
Treat the code as untrusted and adversarial review it. Do not assume the authors' intentions
are correct.

> This brief intentionally contains **no internal design notes, no known-issue list, and no
> reasoning from the authors**. Form your own conclusions from the code and the public spec.

## What the system claims to be

A modular, psychophysics-based vision assessment platform. The first module, **PVANC**
(Presenting Visual Acuity Under Non-Clinical conditions), estimates visual acuity in **logMAR**
on consumer devices (phones/tablets/desktops) using a tumbling-E forced-choice task with an
adaptive procedure (staircase bracketing → QUEST+ Bayesian refinement). It produces a
measurement output plus a reliability/confidence output, and is designed to (a) be
scientifically defensible, (b) record trial-level raw data, (c) apply quality control, (d)
avoid unsupported clinical claims, and (e) be reproducible.

The canonical scientific specification is `docs/specs/` (PVANC-1.0-SPEC) and the architecture is
in `docs/architecture/ARCHITECTURE.md`. **Hold the code to those documents.**

## Where the code is

Monorepo, TypeScript, run with `npm test` (Node's built-in runner) and `npm run typecheck`.

- `packages/core-contracts/` — shared types/interfaces (the contracts).
- `packages/core-engine/` — RNG, clock, timing, trial log, adaptive procedures (staircase, QUEST+, psychometric).
- `packages/calibration-engine/` — device profiling, viewing distance, geometry (deg↔px), pixel-density adequacy, environment capture.
- `packages/quality-engine/` — QC hook checks, quality scoring, claim gate, completeness, response-validity.
- `packages/modules/acuity-pvanc/` — the PVANC module: stimulus construction, scoring, result derivation, the measurement session controller.
- `packages/data-layer/` — structured, versioned session export (raw trials + metadata).
- `packages/simulation/` — virtual observers and a harness that drives a real session.

## Your task: attack the design

Find concrete ways the module can be made to **fail, mislead, or be gamed**. For each finding,
give a minimal reproduction (a test, a sequence, or a precise code path) and the impact.
Consider at least:

1. **Produce a confident WRONG result.** Can you get the module to report a normal/plausible
   acuity and an acceptable confidence for someone whose true acuity is different — or for
   non-compliant input? Can you bias the estimate without it being flagged?
2. **Scientific correctness.** Are the psychometric math, the adaptive procedure, the logMAR/
   geometry conversions, and the scoring actually correct and unbiased? Look for boundary
   conditions, off-by-one, sign errors, grid/edge effects, and unit mistakes.
3. **Bypass quality control.** Can input pass the eligibility, pre-flight, completeness,
   validity, adequacy, distance, and claim-gate checks while still being invalid? Can you make
   a degraded session present as high quality?
4. **Claims / safety.** Can the module emit a clinical-sounding claim or category it should not,
   given its validation status? Can the mandatory limitations be dropped? Can a device- or
   environment-limited result be read as a measure of the eye?
5. **Raw data & integrity.** Can raw trial data be hidden, silently lost, mutated after the
   fact, or exported inconsistently? Is the version/provenance metadata trustworthy? Is the
   "append-only" log actually append-only?
6. **Determinism / reproducibility.** Same seed + same inputs — is the result truly
   reproducible and replayable? Find any nondeterminism, hidden global state, or clock/RNG leak.
7. **Robustness.** Crash inputs, NaN/Infinity, empty/degenerate trials, extreme parameters,
   adversarial responders, malformed device signals, mid-session changes.
8. **Module isolation & boundaries.** Does the module respect its contract (pure, no I/O, no
   cross-module imports, no hidden state)? Can one part corrupt another?

## Ground rules

- Prefer demonstrated breaks (a failing/red test or a precise repro) over speculation.
- Quote the spec/architecture where the code violates it.
- Rank findings by severity (could it cause a person to be misinformed about their vision?).
- It is fair game to argue a design choice is wrong even if the code "works as written."

Deliver: a findings list (severity, location, repro, impact) and your overall verdict on
whether the module is fit for its stated screening/monitoring purpose.
