# Module: acuity-pvanc

| Field | Value |
|---|---|
| **Package** | `@vision-platform/module-acuity-pvanc` |
| **Construct** | Presenting visual acuity (non-clinical conditions) |
| **Scale** | logMAR |
| **Scientific spec** | PVANC-1.0 |
| **Validation status** | `provisional` |

## Boundary (what this package owns)

This plug-in supplies **construct knowledge only**: eligibility rules, stimulus
generation (in physical units), response scoring, result derivation, and a reference
virtual observer. It implements the `ModulePlugin` contract from
`@vision-platform/core-contracts`.

## Boundary (what this package must NOT do)

- No I/O, persistence, networking, or wall-clock reads (use the injected RNG/clock).
- No rendering or direct screen access (that is the host shell's job).
- **No imports from any other `@vision-platform/module-*` package.**
- No output whose claims exceed `provisional` (enforced by the engine's claim gate).

See `docs/architecture/ARCHITECTURE.md` §3 (module contract) and §10 (boundaries).

> Status: **v1 implemented** — hybrid staircase → QUEST+, §9 scoring, calibration + QC hooks,
> trial logging, and measurement + reliability outputs. See `IMPLEMENTATION.md`; entry point
> is `src/module.def.ts`. 36 module tests passing.
