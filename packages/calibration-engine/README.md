# `@vision-platform/calibration-engine` — Calibration

Converts a module's physical-unit stimulus requests into something a specific device can
faithfully present, and records the **context** of every measurement so it can be
reproduced and compared longitudinally. A `CalibrationProfile` is a required input to
start measuring; low-confidence inputs propagate into the quality score — the platform
never pretends a low-confidence context is a high-confidence one.

> Skeleton status: placeholders only. No calibration logic yet. See
> `docs/architecture/ARCHITECTURE.md` §5. Contract types live in core-contracts
> (`calibration.contract.ts`).

## `src/` layout

| Folder | Role |
|---|---|
| `device-profile/` | Resolve a `DeviceProfile` (pixel pitch, dimensions, max luminance, gamma, DPR) from a versioned device DB keyed by model, with a generic fallback flagged as lower confidence. |
| `distance/` | Acquire viewing distance (cord-measured / camera-estimated `[UNCERTAIN]` / user-reported) and record method + uncertainty. Camera estimation always degrades quality, never trusted silently. |
| `luminance-gamma/` | Set/verify brightness against a calibrated target; apply gamma correction so requested contrast & luminance are met as closely as the device allows; report residual error. |
| `adequacy-checks/` | The pixel-density (ppd) adequacy gate: compute pixels-per-degree and max-measurable on the module's scale; emit a hard warning + quality cap when the device cannot resolve the required range. |

The single authoritative `degToPx()` mapping lives here so no module re-derives geometry.

## Dependencies

`@vision-platform/core-contracts` only.
