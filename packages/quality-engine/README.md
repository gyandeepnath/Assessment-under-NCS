# `@vision-platform/quality-engine` — Quality Control

**This is where QC lives.** The QC engine is the mechanism by which the platform never
trades scientific accuracy for convenience: it makes every degradation **visible and
quantified** rather than hidden, and it structurally gates what a result may claim.

> Skeleton status: placeholders only. No QC logic yet. See
> `docs/architecture/ARCHITECTURE.md` §6. Contract types live in
> `@vision-platform/core-contracts` (`quality.contract.ts`).

## `src/` layout

| Folder | Role |
|---|---|
| `checks/` | **Pre-flight** checks that block/flag before measuring (dark mode/colour filter → block; auto-brightness, low battery, illuminance out of range → flag) and **in-flight** monitors (orientation change → discard trial + lock; app backgrounding → pause; response timeout; anticipatory <200 ms or runaway responses; distance shift). Monitors emit `QualityEvent`s into the trial log. |
| `scoring/` | The composable, **module-configurable** quality-score model. The engine supplies the framework (weighted 0–100 components); each module supplies the weights and component definitions (e.g. PVANC: posterior precision, trial-count adequacy, response consistency, distance stability, environmental compliance). |
| `completeness/` | Data-completeness gates: minimum valid-trial count and "at least one correct + one error" before a result may be scored. Failing tests are marked **incomplete**, never silently scored. |

## Quality bands → behaviour (engine-enforced)

| Band | Score | Behaviour |
|---|---|---|
| high | ≥80 | result may be shared/categorised |
| moderate | 60–79 | usable for trending with caution; category shown with caveat |
| low | <60 | **no category assigned** → "test quality insufficient — please retake" |

## Claim gate (structural prevention of unsupported claims)

Permitted output = **minimum** of what the quality band allows and what the module's
`validationStatus` (`research-only → provisional → validated`) allows. The engine refuses
any output above the permitted level. This is how the architecture *structurally* avoids
unsupported clinical claims (`ClaimGate` in core-contracts; matrix in ARCHITECTURE §6.4).

## Dependencies

`@vision-platform/core-contracts` only.
