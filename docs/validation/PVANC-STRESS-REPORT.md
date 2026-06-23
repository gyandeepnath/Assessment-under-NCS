# PVANC v1 — Stress-Test Failure Report

Suite: `packages/simulation/src/stress/stress.test.ts` (13 tests, all passing). Each
condition drives a **real `PvancSession`** and the suite records how the system reacts,
whether QC catches it, and whether the output is **ACCEPTED**, **FLAGGED**, or **SUPPRESSED**
(forced to retake / inconclusive). Conditions the synchronous v1 module does not model are
exercised to **document the gap**, not to fake handling.

## Results

| # | Condition | System reaction | QC catches? | Output |
|---|---|---|---|---|
| 1 | Extreme brightness variation | `auto-brightness` + `illuminance-out-of-range` flags; environment component → 0; quality → low | **Yes** | **SUPPRESSED** (retake) |
| 2 | Wrong viewing distance (corroborated) | corroboration disagreement detected; distance component → 0; quality → low | **Yes** | **SUPPRESSED** (retake) |
| 3 | Slow responses (beyond 5 s window) | every response a timeout → errors → floor; `response-timeout` flags | **Yes** | **SUPPRESSED** (inconclusive) |
| 3b | Slow but within window (4 s) | usable; converges | n/a | **ACCEPTED** |
| 4 | Repeated same-answer pattern | ~chance accuracy → 5-consecutive-error floor | **Yes** (floor) | **SUPPRESSED** (inconclusive) |
| 5 | Random tapping | ~chance → floor / validity detector | **Yes** | **SUPPRESSED** (inconclusive) |
| 6 | Interrupted session (exception mid-session) | exception propagates; **no partial result, no resume** | **No** | **GAP** (throws) |
| 7 | Device rotation (mid-session) | orientation recorded in export; **no orientation-lock / discard-on-rotation** | **No** (module level) | **GAP** (accepted) |
| 8 | Screen resize (mid-session) | device profile resolved **once** at start; never re-resolved | **No** | **GAP** (stale profile) |
| 9 | Calibration failure — unknown distance | distance confidence → low; component → 0; quality → low | **Yes** | **SUPPRESSED** (retake) |
| 9b | Calibration failure — fallback device profile | profile `isFallback`, confidence `low`, **but quality not penalised** if adequacy passes | **Partial** | **GAP** (accepted w/ caveat) |
| 10 | Partial data loss — below completeness threshold | < 15 valid Phase 2 trials → completeness gate | **Yes** | **SUPPRESSED** (inconclusive) |
| 10b | Partial data loss — export path | trials dropped; export rebuilds with smaller `trialCount`; **no expected-vs-actual check** | **No** | **GAP** (silent) |

## Verdict

**7 of the 10 conditions are caught and fail safe** (flagged and/or suppressed to retake):
extreme brightness, wrong distance, slow responses, repeated-answer, random tapping,
calibration failure (unknown distance), and data loss that crosses the completeness threshold.
The defence-in-depth stack — eligibility/pre-flight blocks → adequacy + distance + environment
quality components → floor + completeness gates → response-validity detector → claim gate —
handles the response-level and environment-level abuse well.

## Gaps uncovered (honest)

These are **not handled by the current synchronous, headless module**; by design they belong
to the deferred session-orchestrator (mid-session lifecycle) and data-layer adapters
(persistence/recovery integrity) — but until those exist they are real exposure:

- **G1 — Interruption is not graceful.** An exception mid-session (app backgrounded/killed)
  propagates out of `run()`; there is no checkpoint, no partial result, no resume. The
  architecture assigns pause/resume to the orchestrator (ARCHITECTURE §4), which is deferred.
  *Risk:* lost session; no audit trail of the partial attempt. *Fix direction:* wrap the trial
  loop so an interruption finalises an `inconclusive` result from the trials collected so far,
  and persist incrementally.
- **G2 — Device rotation is recorded but not enforced.** Orientation is captured in the export,
  but there is no orientation-lock or discard-on-rotation at the module level (PVANC §11.1
  expects this; it is a host/orchestrator concern). *Risk:* a rotation mid-test changes the
  effective viewing geometry without flagging. *Fix direction:* host emits orientation-change
  events; the runner discards affected trials and flags.
- **G3 — Screen resize uses a stale profile.** The device profile is resolved once at session
  start; a mid-session resize (e.g. desktop window resize, foldable, browser zoom) is never
  re-resolved, so geometry silently drifts. *Risk:* systematic size error after a resize.
  *Fix direction:* re-resolve on resize events and flag / restart.
- **G4 — Fallback device profiles are not penalised.** A generic per-class fallback profile is
  marked `isFallback` and the calibration `confidence` is `low`, but the **quality score** does
  not incorporate device-profile confidence (only the adequacy gate / device-limited path
  does), so a fallback session is accepted at moderate quality. *Risk:* over-confident result on
  an un-characterised device. *Fix direction:* feed device-profile confidence into the quality
  score (a "device characterisation" component or a cap).
- **G5 — No end-to-end trial-count integrity.** `trialCount === trials.length` holds trivially
  post-hoc; there is no expected-vs-actual count, sequence-number continuity check, or
  checksum, so trials lost between collection and export are undetected. *Risk:* silent partial
  data loss in transit/storage. *Fix direction:* stamp an expected trial count + per-trial
  sequence numbers at capture and verify them in the export/import path.

## Note for the independent audit

These gaps were found by self-directed stress testing. The next step is an **independent
adversarial audit** (`docs/validation/CODEX-AUDIT-BRIEF.md`) given only the code and asked to
attack the design — deliberately without this report or any internal reasoning, so its findings
are unbiased.
