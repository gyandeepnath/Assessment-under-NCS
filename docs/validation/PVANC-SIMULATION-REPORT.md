# PVANC v1 — Simulation Report

Framework: `@vision-platform/simulation` (`observers/pvanc-observers.ts`, `harness/pvanc-harness.ts`).
Each observer drives a **real `PvancSession`** (full hybrid staircase → QUEST+, calibration,
QC, logging); environmental observers also vary the device/distance config. Subject responses
follow the psychometric function in logMAR; environmental error reaches the measurement as an
**effective size** that differs from the nominal size the module believes it presents.

Numbers below are over 40 seeds/scenario. Reproduce with the tests in
`observers/pvanc-observers.test.ts` (11 tests, all passing). **The scientific spec was not
modified**; where a spec choice causes a bias, it is reported, not patched.

## Results

| # | Observer | status (of 40) | mean est. | bias | rmse | mean Q | key signal |
|---|---|---|---|---|---|---|---|
| 1 | Ideal (true 0.0, slope 4) | 38 completed | −0.13 | **−0.13** | 0.15 | 71 | within-expected |
| 2 | Noisy-attentive (0.3, slope 2) | 39 completed | 0.32 | +0.02 | 0.15 | 70 | unbiased control |
| 3 | Random guesser | 38 inconclusive | — | — | — | 59 | **retake** (band low) |
| 4 | Fatigued (0.3 → lapsing) | 19 completed / 21 inconc. | 0.52 | +0.22 | 0.27 | 67 | timeout flags |
| 5 | Learning (0.4 → 0.2) | 38 completed | 0.25 | −0.05* | 0.14 | 70 | in-bracket |
| 6 | Low-vision (true 0.8) | 32 completed | 0.74 | −0.06 | 0.11 | 68 | below-expected |
| 7 | Device-constraint (coarse @0.4 m) | 40 inconclusive | 0.55 (raw) | n/a | — | ≤70 | **device-limited → category suppressed, retake** |
| 8 | Distance-error (1.5 m vs 2 m, corroborated) | 39 completed | 0.14 | **−0.16** | 0.21 | 55 | **distance Q → 0, retake, flagged** |
| 9 | Brightness-variation (auto-bright) | 38 completed | 0.36 | +0.06 | 0.14 | 70 | auto-brightness flag |
| 10 | Calibration-drift (silent) | 39 completed | 0.32 | +0.02 | 0.13 | 70 | no signal |

\*bias of mean estimate vs the 0.3 mid-point reference; the true threshold moves 0.4→0.2 within the session.

## Per-observer assessment (expected behaviour / module output / failure / verdict)

1. **Ideal** — *Expected:* precise, near-unbiased. *Output:* converges, within-expected, but a **−0.13 logMAR negative bias**. *Failure:* gross bias / non-convergence — not seen. **Verdict: PASS with a documented caveat** (see W1).
2. **Noisy but attentive** — *Expected:* unbiased at moderate quality. *Output:* bias +0.02, RMSE 0.15, Q 70. *Failure:* systematic bias / quality misreport — not seen. **Verdict: PASS** (positive control).
3. **Random guesser** — *Expected:* no false reassurance. *Output:* **95% inconclusive → retake**, the rest poor estimates at low quality; **no run** reported within-expected at usable quality. *Failure:* confident normal acuity — not seen. **Verdict: PASS** (caught by the floor + completeness gates).
4. **Fatigued** — *Expected:* worse, not better; signs of degradation. *Output:* bias **+0.22** (worse), 52% inconclusive, timeout flags fire, quality not high. *Failure:* better-than-true or full quality — not seen. **Verdict: PASS**.
5. **Learning-effect** — *Expected:* estimate between the early/late thresholds. *Output:* mean 0.25 ∈ [0.2, 0.4]. *Failure:* outside the bracket / instability — not seen. **Verdict: PASS** (and the spec's practice-trial / 2nd-session-baseline guidance applies).
6. **Low-vision** — *Expected:* reduced acuity, below-expected. *Output:* mean 0.74, **every** completed run below-expected. *Failure:* a within-expected false negative — **never occurred**. **Verdict: PASS** (the safety-critical case).
7. **Device-constraint** — *Expected:* device-limited result, flagged, not read as eye acuity. *Output:* **adequacy fails; the category is suppressed to `inconclusive`, a `device-limited-result` flag fires, and the run goes to retake** (the raw estimate ~0.55 is still recorded). *Failure:* a vision category presented as if it were the eye — **no longer occurs**. **Verdict: WEAKNESS FIXED (W4).**
8. **Distance-error** — *Expected:* a bias, signalled. *Output:* the −0.16 bias remains (a wrong-distance render cannot be un-biased), **but it is no longer confident**: with a corroborating reading the disagreement is detected — distance-stability quality collapses to 0, a `distance-corroboration-disagreement` flag fires, and the result drops to **retake**. *Failure:* confident unflagged bias — **no longer occurs**. **Verdict: WEAKNESS FIXED (W2 — see below).**
9. **Brightness-variation** — *Expected:* small worse bias + a flag. *Output:* bias +0.06 **and** an `auto-brightness` flag on every run. *Failure:* no flag / large bias — not seen. **Verdict: PASS**.
10. **Calibration-drift** — *Expected:* small bias, undetectable in one session. *Output:* bias +0.02, no in-session signal. *Failure:* large bias or over-claiming detection — not seen. **Verdict: PASS as a documented limitation (W3).**

## Does the module behave as expected?

**Largely yes.** The four behaviours that matter most for safety and integrity all hold:

- **Realistic observers are unbiased.** Every slope-2 observer (2, 5, 6, 8-env-aside, 9, 10) recovers to within ≤0.06 logMAR — matching the core's verified unbiasedness and the spec's ±0.15 repeatability target.
- **Non-compliance is caught, not rewarded.** The random guesser is sent to *retake* 95% of the time and never produces a confident normal result; the fatigued observer degrades and self-limits via timeouts + inconclusive.
- **Genuine low vision is never a false negative.** All low-vision runs report below-expected.
- **QC fires where it can:** auto-brightness and response-timeout flags appear; the adequacy gate caps inadequate devices.

## Weaknesses uncovered

- **W1 — Steep-slope negative bias (spec-driven).** For atypically steep observers (slope ≥ 4) the posterior-mean threshold is biased low (~0.10–0.15 logMAR). Isolated to the core: slope 2 @ threshold 0.0 → bias −0.007; slope 4 @ 0.0 → −0.146. Cause: the spec's slope prior (mean 2.0, SD 0.5; §6.2) plus the slope grid cap (4) resist steep slopes, shifting the threshold. Real human acuity slopes are ~1.5–3, where the module is unbiased, so impact in practice is small. **Not patched** (would require changing the spec). Future option: report the posterior **mode** alongside the mean, or widen the slope grid — to be evaluated against the spec.
- **W2 — A wrong-but-confident viewing distance — FIXED.** *Original:* a wrong distance produced a confident −0.16 logMAR bias while distance-stability quality stayed at 100, because the method was declared `cord-measured`. *Fix (spec-compliant — the spec already anticipates camera distance corroboration in §10.2/§11.1 and defines the distance component as "confirmed stable" in §9.3):*
  1. **Distance corroboration** in the calibration engine: an optional independent second reading is compared to the primary; disagreement beyond tolerance **widens the uncertainty to the disagreement** and records it, so it can no longer be silently trusted.
  2. The PVANC **distance-stability quality component is now driven by distance *confidence*** (which incorporates the widened uncertainty), not the raw declared method — so a disagreeing distance collapses the component to 0, dropping the result to *retake*.
  3. A **`distance-corroboration-disagreement`** QC flag fires on disagreement, and an **`distance-uncorroborated`** info flag is attached whenever no second reading exists (the trust is now explicit, with a sensitivity note: ~10% distance error ≈ 0.04 logMAR).

  *Result:* the simulation's distance-error observer now collapses distance quality to 0 and is sent to retake (was: confident, Q 100). **Residual limitation:** without a second reading the bias is still fundamentally unmeasurable — but it is no longer *unflagged* (the uncorroborated info flag makes the latent risk visible). Covered by tests in `pvanc-observers.test.ts` (#8) and `calibration.test.ts`.
- **W3 — Single-session calibration drift is invisible.** By design (PVANC §10.4 puts drift detection in cross-session tracking, which v1 does not implement), a silently aged display produces a small undetected bias. Correctly **not** over-claimed; flagged here as a known gap until longitudinal tracking lands.
- **W4 — Device-limited results read like reduced eye acuity — FIXED.** *Original:* on an inadequate device the point estimate (~0.55) looked like below-expected vision; only the passive adequacy cap and `maxMeasurable` metadata disambiguated it. *Fix (spec-compliant — extends §10.3's "warn + cap" and serves §16's misuse-prevention):* when the device cannot render detail as fine as the measured threshold (estimate ≤ `maxMeasurable` + one optotype step, and adequacy failed), the module marks the result **device-limited** — the screening **category is suppressed to `inconclusive`**, a **`device-limited-result`** flag fires, a plain-language limitation is attached, and the result goes to **retake**. The raw estimate is still recorded (not hidden). A guard prevents over-triggering: a genuine low-vision result on an *adequate* device keeps its `below_expected` category (verified by test). Covered in `pvanc-observers.test.ts` (#7) and `pvanc-session.test.ts`.
- **W5 — No explicit non-compliance/guessing detector.** Guessing and fatigue are caught **indirectly** via the floor and completeness gates (which works well here), but there is no first-class "below-chance" or "response-pattern" validity flag (PVANC §11 anticipates one). A dedicated detector would catch borderline non-compliance that still scrapes past the gates.

## Bottom line

The module is **scientifically sound for realistic observers** and **fails safe** on the
dangerous cases (low vision flagged, guessing rejected, inadequate devices now marked
device-limited rather than mislabelled). **W2 (distance error)** and **W4 (device-limited
results)** are now fixed — both spec-compliant, both with the raw data preserved and the
limitation made explicit rather than hidden. **W1** remains a minor, spec-attributable artefact
at the edge of plausibility (a deliberate decision: fixing it would require changing the spec's
slope prior). **W3** (single-session drift) needs cross-session tracking and **W5** (a
first-class non-compliance detector) remain open; both are documented, and W5's risk is already
mitigated indirectly by the floor/completeness gates.
