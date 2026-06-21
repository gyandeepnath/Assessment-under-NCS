# `@vision-platform/data-layer` — Storage & Raw Data

**This is where raw data lives.** Trial-level raw data is the platform's primary
scientific record; every derived value (threshold, category, trend) must be recomputable
from raw data + the module/spec version + the calibration profile that produced it.

> Skeleton status: placeholders only. No persistence logic yet. See
> `docs/architecture/ARCHITECTURE.md` §7. Record shapes are defined in
> `@vision-platform/core-contracts` (`storage.contract.ts`).

## Three logical stores

| Layer | Record | Mutability | Lives in |
|---|---|---|---|
| **Trial store (RAW)** | `TrialRecord` — one per trial, the primary record | **Append-only, immutable** | `src/repositories/` over an adapter |
| **Session store** | `SessionRecord` — one per administration (device, calibration ref, result, quality) | Write-once summary | `src/repositories/` |
| **Longitudinal/user store** | `Baseline` + trend + alert history per pseudonym | Updated over time, derived | `src/repositories/` |

Supporting stores: **calibration profiles** (`CalibrationRepository`) and **export bundles**.

## `src/` layout

| Folder | Role |
|---|---|
| `repositories/` | Implementations of the repository ports (`TrialRepository`, `SessionRepository`, `UserRepository`, `CalibrationRepository`) from core-contracts. The only storage surface the engine sees. |
| `adapters/in-memory/` | No-persistence adapter for tests, simulation, and CI. |
| `adapters/sqlite/` | On-device, local-first, offline-capable storage. |
| `adapters/postgres-supabase/` | Server-side longitudinal store, clinician access, research aggregates. |
| `schema/` | Versioned data-model definitions (the source of `schemaVersion`). |
| `migrations/` | Forward-only migrations. Never rewrite raw trials' scientific content — structural/storage concerns only. |
| `export/` | The **exportable raw data** service. Two layers: (1) `export-bundle` — a minimal generic bundle (trials + session + calibration); (2) `export-document` — the **structured, versioned session export** (`SessionExport`, schema `EXPORT_SCHEMA_VERSION`) that keeps the seven facets as distinct top-level sections (raw trials, session summary, reliability/confidence, calibration, QC, device, version metadata). Serialisers: `exportToJson` (canonical, key-sorted, lossless), `exportTrialsToCsv` (raw one-row-per-trial with provenance + posterior state), `exportSessionRowCsv` (one-row-per-session for validation tables). |

### Structured session export — invariants

- **Raw data is never hidden:** every `TrialRecord` is included in full; `trialCount` must equal `trials.length`.
- **Metadata is never silently overwritten:** `buildSessionExport` validates that every trial's `moduleId`/`moduleVersion`/`specVersion`/`schemaVersion` agrees with the export's version metadata and **throws** on conflict rather than papering over it.
- **Deterministic & lossless:** JSON serialisation is key-sorted and stable for reproducible diffs and re-derivation off-device.
- Sections: `versions`, `session`, `reliability`, `device`, `calibration`, `environment`, `qc`, `trials` (types in `core-contracts/storage.contract`).

## Privacy & retention (policy at the adapter boundary, not in the engine)

- Pseudonymised IDs at the trial level; re-identification key stored separately.
- Encryption at rest and in transit handled by the adapter.
- Retention: raw trials ≥2 years, session summaries ≥5 years, anonymised aggregates indefinite.
- Deletion/erasure requests handled as repository policy (keeps compliance out of the engine).

## Dependencies

`@vision-platform/core-contracts` only. Concrete DB drivers belong to individual adapter
subfolders and are added there when implemented — not at the package root.
