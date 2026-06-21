# Module: crowding

| Field | Value |
|---|---|
| **Package** | `@vision-platform/module-crowding` |
| **Construct** | Crowding / critical spacing |
| **Scale** | deg |
| **Scientific spec** | TBD |
| **Validation status** | `research-only` |

## Boundary (what this package owns)

This plug-in supplies **construct knowledge only**: eligibility rules, stimulus
generation (in physical units), response scoring, result derivation, and a reference
virtual observer. It implements the `ModulePlugin` contract from
`@vision-platform/core-contracts`.

## Boundary (what this package must NOT do)

- No I/O, persistence, networking, or wall-clock reads (use the injected RNG/clock).
- No rendering or direct screen access (that is the host shell's job).
- **No imports from any other `@vision-platform/module-*` package.**
- No output whose claims exceed `research-only` (enforced by the engine's claim gate).

See `docs/architecture/ARCHITECTURE.md` §3 (module contract) and §10 (boundaries).

> Status: skeleton. `src/module.def.ts` is a placeholder; no measurement logic yet.
