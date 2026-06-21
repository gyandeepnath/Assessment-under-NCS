# Validation Protocols & Reports

Per-module validation **protocols** (acceptance criteria as data) and generated reports.

- Protocol files: `docs/validation/<module>.protocol.yaml` — declare targets (bias, LoA,
  ICC, MDC, etc.). The `@vision-platform/validation` package reads these; no module-specific
  logic is baked into the tooling.
- A module's `validationStatus` advances only when its Tier-B report meets the protocol.

See ARCHITECTURE §9.
