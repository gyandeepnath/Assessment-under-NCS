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
| 7 | Device-constraint (coarse @0.4 m) | 40 completed | 0.55 | n/a | — | 70 | **adequacy fail, cap 70** |
| 8 | Distance-error (1.5 m vs 2 m) | 39 completed | 0.14 | **−0.16** | 0.21 | 70 | distance Q = 100 |
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
7. **Device-constraint** — *Expected:* device-limited result, flagged. *Output:* **adequacy fails, quality capped at 70**, estimate pinned near the device floor (~0.55). *Failure:* adequacy passes / impossibly-good acuity — not seen. **Verdict: PASS, but see W4** (the point estimate alone looks like reduced *eye* acuity; the cap + `maxMeasurable` metadata are what disambiguate it).
8. **Distance-error** — *Expected:* a bias, ideally signalled. *Output:* **confident −0.16 bias** with distance-stability quality still at **100**. *Failure (as defined): confident, unflagged bias — THIS OCCURRED.** **Verdict: WEAKNESS confirmed (W2).**
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
- **W2 — A wrong-but-confident viewing distance is undetectable.** The distance-error observer yields a confident −0.16 logMAR bias while the distance-stability quality component stays at 100, because the method was declared `cord-measured`. The platform trusts the declared distance and method absolutely. **Mitigations:** corroborate distance (e.g. camera cross-check), cap confidence for any single uncorroborated measurement, or surface a sensitivity note ("a 25% distance error ≈ 0.12 logMAR"). This is the single most consequential weakness for unsupervised use.
- **W3 — Single-session calibration drift is invisible.** By design (PVANC §10.4 puts drift detection in cross-session tracking, which v1 does not implement), a silently aged display produces a small undetected bias. Correctly **not** over-claimed; flagged here as a known gap until longitudinal tracking lands.
- **W4 — Device-limited results can read like reduced eye acuity.** On an inadequate device the point estimate (~0.55) looks like below-expected vision; only the adequacy **cap (70)** and the `maxMeasurable` calibration metadata reveal it is the *device*, not the eye. Consumers/clinicians must read the calibration/QC metadata, not the estimate alone — the structured export (W: ensure it surfaces) makes this possible.
- **W5 — No explicit non-compliance/guessing detector.** Guessing and fatigue are caught **indirectly** via the floor and completeness gates (which works well here), but there is no first-class "below-chance" or "response-pattern" validity flag (PVANC §11 anticipates one). A dedicated detector would catch borderline non-compliance that still scrapes past the gates.

## Bottom line

The module is **scientifically sound for realistic observers** and **fails safe** on the
dangerous cases (low vision flagged, guessing rejected, inadequate devices capped). The most
important real-world gap is **W2 (undetected distance error)**; **W1** is a minor,
spec-attributable artefact at the edge of plausibility. None of these were hidden or patched
around — they are surfaced here with the negative cases that produced them.
