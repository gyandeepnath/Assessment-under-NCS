# Vision Assessment Platform — Software Architecture

| Attribute | Value |
|---|---|
| **Document** | Platform Architecture Specification |
| **Status** | Draft for review (design only — no implementation) |
| **Version** | 0.1.0 |
| **Date** | 2026-06-21 |
| **Scope** | Modular psychophysics-based vision assessment platform (smartphone, tablet, desktop, similar displays) |
| **Reference module** | PVANC-1.0-SPEC (Presenting Visual Acuity Under Non-Clinical Conditions) |

> **Reading note.** This is an architecture document, not an implementation. Interface
> contracts below are written as language-agnostic IDL (TypeScript-like syntax used only
> for type clarity) to pin down boundaries and data shapes. They are *contracts to be
> implemented later*, not code. Where the PVANC spec constrains a decision, it is cited
> as `PVANC §x`.

---

## 0. Design Principles (the rules everything else obeys)

These principles are load-bearing. Every later section is a consequence of them, and any
future change should be checked against them.

1. **Scientific accuracy is non-negotiable and never traded for convenience.** When a
   convenient design would blur a measurement boundary (e.g. silently substituting a
   nominal viewing distance for a measured one), the design must instead surface the
   degradation as data (a quality flag), not hide it.
2. **The core measures; modules define what is measured.** The shared engine knows about
   *trials, stimuli, responses, adaptive procedures, thresholds, quality, and storage*. It
   knows nothing about acuity, contrast, colour, or stereopsis. All construct-specific
   knowledge lives in a module plug-in.
3. **No monolith.** Each construct (acuity, contrast sensitivity, colour, stereo, …) is an
   independently versioned, independently validated plug-in. They never import each other.
4. **Raw before derived.** Trial-level raw data is the primary record. Every derived value
   (threshold, category, trend) must be recomputable from raw data + the module version +
   the calibration profile that produced it. Reproducibility is an architectural
   requirement, not a feature.
5. **Calibration and quality are first-class, not afterthoughts.** A measurement without a
   calibration context and a quality score is not a valid measurement and must not be
   stored as one.
6. **Versioned and deterministic.** Given the same seed, same module version, same
   calibration profile, and same response sequence, the engine reproduces the same stimulus
   sequence and the same result. This makes simulation, validation, and audit possible.
7. **Claims are bounded by evidence.** The platform must structurally prevent unsupported
   clinical claims (see §6.4 and §11). Outputs carry their own limitations.
8. **Simple enough to validate.** Favour a small number of well-specified seams over clever
   generality. If a component cannot be simulated and validated in isolation, it is too big.

---

## 1. High-Level Architecture (text diagram)

The platform is layered. Dependencies point **downward and inward only**: presentation
depends on the engine; the engine depends on nothing above it; modules depend on the
engine's published contracts but never on each other.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION / HOST LAYER                             │
│  (per-platform shells: iOS, Android, Web, Desktop — render + input only)       │
│  - Renders stimuli the engine describes (does NOT decide stimulus content)     │
│  - Captures raw input events, timestamps them, forwards to engine              │
│  - Surfaces device sensors (light, accelerometer, DPR, battery) to engine      │
└───────────────▲───────────────────────────────────────────────▲───────────────┘
                │  StimulusFrame / ResponseEvent (Platform Port)  │
                │                                                 │
┌───────────────┴─────────────────────────────────────────────────────────────┐
│                          MEASUREMENT CORE (shared engine)                     │
│                                                                               │
│   ┌────────────────┐   ┌────────────────┐   ┌──────────────────────────┐      │
│   │ Session        │   │ Trial Runner   │   │ Adaptive Procedure        │      │
│   │ Orchestrator   │──▶│ (present →     │──▶│ Library                   │      │
│   │ (lifecycle,    │   │  collect →     │   │ (staircase, QUEST+,       │      │
│   │  phases, FSM)  │   │  score trial)  │   │  method-of-constants…)    │      │
│   └──────┬─────────┘   └───────┬────────┘   └──────────────────────────┘      │
│          │                     │                                              │
│   ┌──────▼─────────┐   ┌───────▼────────┐   ┌──────────────────────────┐      │
│   │ Calibration    │   │ Quality-Control│   │ Trial Log / Event Bus     │      │
│   │ Engine         │   │ Engine         │   │ (append-only, ordered)    │      │
│   └──────┬─────────┘   └───────┬────────┘   └───────────┬──────────────┘      │
│          │                     │                        │                     │
│   ┌──────▼─────────────────────▼────────────────────────▼──────────────┐      │
│   │              Module Host / Plug-in Registry (sandbox)                │      │
│   │   loads, validates, version-pins, and isolates module plug-ins       │      │
│   └──────▲──────────────────────────────────────────────────────────────┘      │
└──────────┼──────────────────────────────────────────────────────────────────┘
           │  ModulePlugin contract (§3)          ▲ persistence / export
           │                                      │
┌──────────┴───────────────┐        ┌─────────────┴───────────────────────────┐
│      MODULE PLUG-INS      │        │              DATA LAYER                  │
│  (one per construct)      │        │  Repositories → Storage Adapters         │
│  ┌─────────────────────┐  │        │  - Trial store (append-only)             │
│  │ acuity-pvanc (1.0)  │  │        │  - Session store                         │
│  │ near-acuity         │  │        │  - Longitudinal/user store               │
│  │ contrast-sensitivity│  │        │  - Calibration store                     │
│  │ colour-vision       │  │        │  - Export service (raw + metadata)       │
│  │ stereoacuity        │  │        └──────────────────────────────────────────┘
│  │ suppression-rivalry │  │
│  │ fixation-stability  │  │        ┌──────────────────────────────────────────┐
│  │ crowding            │  │        │        OFF-DEVICE / DEV-ONLY              │
│  │ visual-field-screen │  │        │  Simulation Layer (virtual observers)    │
│  │ low-vision-tasks    │  │◀──────▶│  Validation Layer (agreement, QC, CI)    │
│  │ accommodation-verg. │  │        │  Normative / reference datasets          │
│  │ reaction-pupil       │  │        └──────────────────────────────────────────┘
│  └─────────────────────┘  │
└───────────────────────────┘
```

**Key seams (the only places components talk):**

- **Platform Port** — the engine ⇄ host shell boundary. The engine emits abstract
  `StimulusFrame`s in *physical units* (degrees, cd/m², logMAR); the host renders them; the
  host returns timestamped `ResponseEvent`s and `DeviceSignals`. Neither side knows the
  other's internals.
- **ModulePlugin contract** — the engine ⇄ module boundary (§3). Modules supply construct
  knowledge; the engine supplies measurement machinery.
- **Repository contract** — the engine ⇄ storage boundary (§7). Pluggable adapters
  (SQLite on-device, Postgres/Supabase server-side, in-memory for tests).
- **Simulation Port** — substitutes a virtual observer for the human + host so the entire
  measurement loop runs headless and deterministically (§8).

---

## 2. Repository / Folder Structure

A monorepo with strict package boundaries. Each package has its own version, tests, and
CHANGELOG. Build tooling enforces the dependency direction from §1 (a module package may
not depend on another module package; nothing may depend on a presentation package except
that platform's own host).

```
vision-platform/
├── README.md
├── ARCHITECTURE.md                      # this document (top-level pointer)
├── docs/
│   ├── architecture/                    # this document + ADRs
│   │   ├── ARCHITECTURE.md
│   │   └── adr/                          # Architecture Decision Records (0001-…)
│   ├── specs/                           # scientific module specs (e.g. PVANC-1.0-SPEC.md)
│   ├── validation/                      # validation protocols & reports per module
│   └── glossary.md
│
├── packages/
│   ├── core-contracts/                  # PURE types/interfaces. No logic. The lingua franca.
│   │   ├── module.contract.*            #   ModulePlugin, Stimulus, Trial, Response
│   │   ├── calibration.contract.*
│   │   ├── quality.contract.*
│   │   ├── storage.contract.*           #   Repository interfaces
│   │   ├── platform.contract.*          #   StimulusFrame, ResponseEvent, DeviceSignals
│   │   ├── units.*                      #   physical-unit value types (Degrees, Candela…)
│   │   └── errors.*                     #   error taxonomy (§11)
│   │
│   ├── core-engine/                     # the shared measurement core (§4)
│   │   ├── session-orchestrator/
│   │   ├── trial-runner/
│   │   ├── adaptive/                    #   staircase, QUEST+, method-of-constants
│   │   │   ├── staircase/
│   │   │   ├── questplus/
│   │   │   └── psychometric/            #   probit/logit fns, posterior math
│   │   ├── module-host/                 #   registry, loader, sandbox, version-pinning
│   │   ├── trial-log/                   #   append-only event bus + serializer
│   │   ├── rng/                         #   seeded deterministic RNG
│   │   └── clock/                       #   monotonic timing abstraction
│   │
│   ├── calibration-engine/              # (§5) device profiles, distance, luminance, ppd
│   │   ├── device-profile/
│   │   ├── distance/
│   │   ├── luminance-gamma/
│   │   └── adequacy-checks/             #   pixel-density / ppd gate (PVANC §10.3)
│   │
│   ├── quality-engine/                  # (§6) QC checks, scoring, environmental monitors
│   │   ├── checks/                      #   auto-brightness, dark-mode, timeout, distance…
│   │   ├── scoring/                     #   composable quality-score model
│   │   └── completeness/                #   data-completeness gates (PVANC §11.3)
│   │
│   ├── data-layer/                      # (§7) repositories + adapters + export
│   │   ├── repositories/
│   │   ├── adapters/
│   │   │   ├── sqlite/
│   │   │   ├── postgres-supabase/
│   │   │   └── in-memory/               #   for tests/sim
│   │   ├── migrations/
│   │   ├── schema/                      #   versioned data-model definitions (§7.1)
│   │   └── export/                      #   raw + metadata bundle exporter
│   │
│   ├── modules/                         # one package per construct (plug-ins, §3)
│   │   ├── acuity-pvanc/                #   FIRST module, implements PVANC-1.0-SPEC
│   │   │   ├── spec/ -> ../../docs/specs/PVANC-1.0-SPEC.md (linked)
│   │   │   ├── module.def.*             #   manifest + ModulePlugin implementation
│   │   │   ├── stimulus/                #   tumbling-E/Landolt-C/Sloan geometry + crowding
│   │   │   ├── scoring/                 #   logMAR mapping, notation conversions
│   │   │   ├── norms/                   #   age-stratified normative tables (Appendix B)
│   │   │   ├── observer-model/          #   reference virtual observer for sim (§8)
│   │   │   ├── validation/              #   module-specific validation harness
│   │   │   └── tests/
│   │   ├── near-acuity/
│   │   ├── reading/                     #   reading acuity / reading speed
│   │   ├── contrast-sensitivity/
│   │   ├── colour-vision/
│   │   ├── stereoacuity/
│   │   ├── suppression-rivalry/
│   │   ├── fixation-stability/
│   │   ├── crowding/
│   │   ├── visual-field-screen/
│   │   ├── low-vision-tasks/
│   │   ├── accommodation-vergence/
│   │   └── reaction-pupil/
│   │
│   ├── simulation/                      # (§8) virtual observers, harness, scenario runner
│   │   ├── observers/                   #   shared observer primitives (psychometric obs.)
│   │   ├── harness/                     #   headless session driver via Simulation Port
│   │   └── scenarios/                   #   recovery/parametric sweeps
│   │
│   └── validation/                      # (§9) cross-module validation tooling & reports
│       ├── agreement/                   #   Bland-Altman, ICC, LoA calculators
│       ├── reliability/                 #   test-retest, MDC
│       ├── recovery/                    #   ground-truth recovery from sim
│       └── reports/                     #   generated artefacts (CI-checked)
│
├── apps/                                # presentation/host shells (thin)
│   ├── web/
│   ├── mobile/                          #   shared RN/native or per-OS
│   └── desktop/
│
└── tooling/
    ├── ci/                              #   gates: lint, unit, sim-recovery, validation
    ├── module-scaffold/                 #   generator for a new conformant module
    └── schema-codegen/                  #   types from versioned schema
```

**Why this shape:** `core-contracts` is the single dependency every other package shares,
and it contains *no logic* — so modules and the engine can evolve independently as long as
the contract holds. Modules are siblings that never see each other, enforcing §0.3.
Simulation and validation are top-level packages (not buried in test folders) because they
are deliverables in their own right (Output requirements: simulation and validation
support).

---

## 3. Module Interface Definition (the plug-in contract)

A module is a **declarative specification of a construct plus the pure functions the engine
needs to measure it.** The engine drives the loop; the module supplies knowledge. Modules
are intentionally *passive*: they do not own the session, the clock, storage, or rendering.

### 3.1 Module manifest

Every module ships a manifest that the Module Host validates at load time.

```ts
interface ModuleManifest {
  moduleId: string;            // e.g. "acuity-pvanc"
  construct: string;           // human-readable, e.g. "Presenting visual acuity (NCS)"
  scale: string;               // measurement scale, e.g. "logMAR"
  specVersion: string;         // the scientific spec it implements, e.g. "PVANC-1.0"
  moduleVersion: SemVer;       // the code version of this plug-in
  engineApiRange: SemVerRange; // engine contract versions it is compatible with
  scientificRisk: "LOW" | "MODERATE" | "HIGH";
  referenceStandard?: string;  // e.g. "ETDRS"
  supportedDeviceClasses: DeviceClass[];
  requiredCalibration: CalibrationRequirement[]; // see §5
  requiredSignals: DeviceSignalKind[];           // light, accel, dpr, battery…
  validationStatus: ValidationStatus;            // see §9.4 — drives claim gating
  defaultProcedure: ProcedureId;                 // which adaptive procedure to use
}
```

### 3.2 The `ModulePlugin` contract

```ts
interface ModulePlugin {
  readonly manifest: ModuleManifest;

  // --- Preconditions & eligibility (PVANC §5) ---
  // Pure: given device + environment + self-reported context, may the test run?
  checkEligibility(ctx: EligibilityContext): EligibilityResult; // allow | block | proceed-with-flags

  // --- Procedure configuration ---
  // The module configures an engine-provided adaptive procedure; it does not implement one.
  configureProcedure(cal: CalibrationProfile): ProcedureConfig;

  // --- Stimulus generation (pure, deterministic given seed + size request) ---
  // The procedure asks "give me a trial at intensity X"; the module returns an abstract,
  // physically-specified stimulus. It must NOT render — that is the host's job.
  nextStimulus(req: StimulusRequest, rng: SeededRng): StimulusSpec;

  // --- Response interpretation ---
  // Map a raw ResponseEvent to a correctness/category outcome for this stimulus.
  scoreResponse(stimulus: StimulusSpec, response: ResponseEvent): TrialOutcome;

  // --- Result derivation (pure) ---
  // Given the procedure's terminal estimate + all trials, produce the module's result,
  // its uncertainty, category, and the limitations text that MUST travel with it (§6.4).
  deriveResult(input: ResultInput): ModuleResult;

  // --- Longitudinal hooks (PVANC §12) ---
  minimumDetectableChange(useCase: UseCase): ScaleDelta; // e.g. 0.10/0.18/0.20 logMAR
  compareToBaseline(current: ModuleResult, baseline: Baseline): ChangeAssessment;

  // --- Simulation support (§8) ---
  // A reference virtual observer the validation layer drives to recover known ground truth.
  referenceObserver(params: ObserverParams): VirtualObserver;
}
```

### 3.3 Stimulus & response value types (physical, not pixel)

The contract speaks in *physical/perceptual units*. The calibration engine and host
translate to pixels. This keeps modules device-agnostic and scientifically auditable.

```ts
interface StimulusSpec {
  kind: string;                       // module-defined, e.g. "tumbling_e"
  intensity: ScaleValue;              // on the module's scale, e.g. 0.20 logMAR
  geometry: GeometrySpec;             // sizes/positions in DEGREES of visual angle
  photometry: PhotometrySpec;         // luminance (cd/m²), contrast (Weber), colour (CIE)
  identity: string;                   // ground-truth answer, e.g. "E_down" (never sent to UI as hint)
  flankers?: FlankerSpec;             // e.g. crowding bars (PVANC §6.4)
  responseModel: ResponseModelSpec;   // #alternatives, allowed gestures, chance rate
  timing: TimingSpec;                 // onset/ISI/response-window (PVANC §6.5)
}

interface ResponseEvent {
  stimulusId: string;
  onsetTimestamp: Millis;             // host-stamped, monotonic clock
  responseTimestamp: Millis;
  latencyMs: number;
  rawValue: string;                   // user's selection
  inputModality: "swipe"|"tap"|"key"|"mouse"|"voice"|"facilitator";
}

type TrialOutcome = { correct: boolean; category?: string; usableForThreshold: boolean };
```

### 3.4 What a module MUST NOT do (enforced by the host sandbox)

- Must not perform I/O, persistence, networking, or wall-clock reads (use injected
  `SeededRng` and `Clock`). This guarantees determinism and testability (§0.6).
- Must not render or read the screen directly.
- Must not import another module package.
- Must not emit a `ModuleResult` whose claims exceed its `validationStatus` (§6.4/§9.4).

> **Conformance:** A package is only a valid module if it passes the *Module Conformance
> Suite* (`tooling/module-scaffold` ships its test template): manifest validity, purity of
> `nextStimulus`/`scoreResponse`/`deriveResult`, deterministic replay, and a passing
> ground-truth recovery run in the Simulation Layer.

---

## 4. Shared Engine (Measurement Core) Responsibilities

The core owns the *measurement machinery* common to all psychophysics, and nothing
construct-specific.

| Component | Responsibility | Explicitly NOT responsible for |
|---|---|---|
| **Session Orchestrator** | Owns the session lifecycle as an explicit finite-state machine: `created → calibrating → eligibility → practice → measuring(phaseN) → scoring → complete / aborted / paused`. Coordinates calibration, eligibility, QC, and storage at each transition. Handles pause/resume (PVANC §11.1 app-backgrounding). | Deciding stimulus content or thresholds. |
| **Trial Runner** | The atomic `present → collect → score` loop. Asks the module for a stimulus, hands a `StimulusFrame` to the host, awaits a `ResponseEvent`, asks the module to score it, emits a `TrialRecord` to the trial log, and feeds the outcome to the adaptive procedure. | Construct semantics; rendering. |
| **Adaptive Procedure Library** | Reusable, validated implementations of staircases (n-down/m-up), **QUEST+ Bayesian** posterior updating, and method-of-constants. Selects next intensity to maximise information / follow staircase rules; reports terminal estimate + posterior/credible interval. Modules *select and parameterise* these; they do not reimplement them. | Knowing what "intensity" physically means (that's the module's geometry/photometry). |
| **Module Host / Registry** | Loads modules, validates manifests, pins engine-API compatibility, sandboxes module calls (purity/no-I/O), and routes engine↔module calls. | Module internals. |
| **Trial Log / Event Bus** | Append-only, ordered, timestamped record of every engine event and trial. The single source of truth from which all results are recomputable (§0.4). Serialises to the data layer. | Aggregation/interpretation (that's results/longitudinal). |
| **Seeded RNG & Clock** | Deterministic randomness (stimulus order, optotype identity) and monotonic timing, injected everywhere. Enables replay and simulation. | — |

**Engine invariants:**

1. The engine never stores a result without an attached `CalibrationProfile` reference and a
   `QualityScore`.
2. Every `TrialRecord` carries enough to replay it: seed, module version, intensity,
   stimulus identity, calibration ref, raw response, timestamps.
3. The engine is **platform-agnostic and deterministic**: same inputs ⇒ same outputs,
   whether driven by a human via a host or a virtual observer via the Simulation Port.

---

## 5. Calibration Engine Responsibilities

Calibration converts the module's physical-unit stimulus requests into something a specific
device can faithfully present, and records the *context* under which a measurement was made
so it can be reproduced and compared longitudinally (PVANC §10).

### 5.1 Responsibilities

| Concern | Responsibility |
|---|---|
| **Device profile** | Resolve a `DeviceProfile` (pixel pitch mm/px, screen dimensions, max luminance, gamma/LUT, DPR) from a versioned device database keyed by model, with a *generic fallback* profile flagged as lower-confidence (PVANC §10.1). |
| **Geometry mapping** | Convert degrees-of-visual-angle ⇄ pixels given the *current viewing distance* and device pixel pitch. Single authoritative implementation so no module re-derives it. |
| **Distance acquisition** | Acquire viewing distance via the available method (cord/tether-measured, camera-estimated, or user-reported) and record the *method* and an uncertainty estimate (PVANC §10.2). Camera estimation is marked `[UNCERTAIN]` and always degrades quality, never silently trusted. |
| **Luminance / gamma** | Set/verify screen brightness against a calibrated target; apply gamma correction so requested contrast (Weber) and luminance (cd/m²) are met as closely as the device allows; report residual error. |
| **Adequacy gate (ppd check)** | Compute pixels-per-degree and `max_measurable` on the module's scale (PVANC §10.3). If the device cannot resolve the required range, emit a hard warning and a quality cap — the measurement proceeds but its ceiling and confidence are bounded. |
| **Drift tracking** | Flag when the same calibrated settings yield detectably different behaviour over time (PVANC §10.4), prompting recalibration. |

### 5.2 Contract

```ts
interface CalibrationEngine {
  resolveDevice(signals: DeviceSignals): DeviceProfile;                 // model DB or fallback
  acquireDistance(method: DistanceMethod, signals: DeviceSignals): DistanceEstimate;
  buildProfile(req: CalibrationRequirement[], ctx: CalibrationContext): CalibrationProfile;
  degToPx(angle: Degrees, profile: CalibrationProfile): Pixels;         // authoritative mapping
  adequacy(profile: CalibrationProfile, requiredRange: ScaleRange): AdequacyReport;
}

interface CalibrationProfile {
  profileId: UUID;
  deviceProfile: DeviceProfile;
  viewingDistance: DistanceEstimate;     // value + method + uncertainty
  luminance: LuminanceState;             // target, achieved, residual error
  adequacy: AdequacyReport;              // pass | capped(maxMeasurable, qualityCap)
  capturedAt: ISO8601;
  confidence: "high" | "moderate" | "low";
}
```

**Principle in action (§0.5):** a `CalibrationProfile` is a required input to start
measuring. If distance is only user-reported, the profile's `confidence` is `low` and that
propagates into the quality score — the platform never pretends a low-confidence context is
a high-confidence one.

---

## 6. Quality-Control Engine Responsibilities

The QC engine is the platform's mechanism for §0.1 (never trade accuracy for convenience):
it makes degradations *visible and quantified* rather than hidden.

### 6.1 Responsibilities

| Concern | Responsibility |
|---|---|
| **Pre-flight checks** | Block or flag conditions that invalidate measurement before it starts: dark mode / colour filter (block), auto-brightness, low battery, illuminance out of range (PVANC §5.2, §11.1). |
| **In-flight monitors** | Watch during the session: orientation change (discard trial + lock), app backgrounding (pause), response timeouts, anticipatory (<200 ms) or runaway responses, distance shifts (PVANC §11.1). Monitors emit `QualityEvent`s into the trial log. |
| **Environmental monitoring** | Continuously record ambient illuminance, brightness, viewing angle; flag out-of-range epochs (PVANC §11.2). |
| **Completeness gates** | Enforce minimum valid-trial counts and "at least one correct + one error" before a result may be scored (PVANC §11.3). Failing tests are marked incomplete, not silently scored. |
| **Quality scoring** | Compute a composable, **module-configurable** quality score from weighted components (precision, trial-count adequacy, response consistency, distance stability, environmental compliance — PVANC §9.3). The *engine* provides the scoring framework; the *module* provides weights and component definitions. |
| **Claim gating** | Map quality + validation status to *what may be claimed* (§6.4). |

### 6.2 Contract

```ts
interface QualityEngine {
  preflight(ctx: PreflightContext): QualityVerdict;          // allow | block(reason) | flag[]
  registerMonitors(session: SessionHandle): MonitorHandle[]; // in-flight
  completeness(trials: TrialRecord[], rule: CompletenessRule): CompletenessVerdict;
  score(model: QualityModel, evidence: QualityEvidence): QualityScore; // 0..100 + components
}

interface QualityScore {
  value: number;                  // 0..100
  band: "high" | "moderate" | "low";
  components: Record<string, { weight: number; value: number }>;
  flags: QualityFlag[];           // every degradation, itemised
}
```

### 6.3 Quality bands → behaviour (PVANC §9.3, §16.2)

- **≥80 high:** result may be shared/categorised.
- **60–79 moderate:** usable for trending with caution; category shown with caveat.
- **<60 low:** **no category assigned**; output is "test quality insufficient — please
  retake." This is an engine-enforced gate, not a module choice.

### 6.4 Claim-gating matrix (structural prevention of unsupported claims, §0.7)

A result's *permitted output* is the **minimum** of what quality allows and what the
module's `validationStatus` allows.

| validationStatus | quality high | quality moderate | quality low |
|---|---|---|---|
| `validated` (clinical-grade study passed) | full category + share + trend | trend w/ caveat | retake |
| `provisional` (internal testing only) | category + "not clinically validated" banner | trend w/ caveat + banner | retake |
| `research-only` | numeric value + research-use banner; **no category** | research-use banner | retake |

The engine refuses to emit any output above the permitted cell. This is how the
architecture *structurally* avoids unsupported clinical claims.

---

## 7. Data Model & Storage Layers

### 7.1 Three logical stores (matching PVANC §14)

Storage is layered: **append-only raw → session summaries → longitudinal aggregates**.
Higher layers are *derived* and must be recomputable from the raw layer + versions.

1. **Trial store (append-only, immutable).** One `TrialRecord` per trial — the primary
   scientific record (PVANC §14.1). Never updated or deleted except by retention policy.
2. **Session store.** One `SessionRecord` per administration: device, calibration profile
   ref, environment, procedure config, result, quality, change-vs-baseline (PVANC §14.2).
3. **Longitudinal/user store.** Per-pseudonym baseline, trend, alert history (PVANC §14.3).

Plus two supporting stores: **Calibration store** (profiles, device DB) and **Export
bundles**.

```ts
interface TrialRecord {              // immutable; cf. PVANC §14.1
  trialId: UUID; sessionId: UUID; trialNumber: number;
  moduleId: string; moduleVersion: SemVer;     // provenance for replay
  calibrationProfileId: UUID;                   // the context that produced it
  rngSeed: string; phase: string;
  stimulus: StimulusSpec;                       // incl. ground-truth identity + geometry/photometry
  response: ResponseEvent; outcome: TrialOutcome;
  procedureStateAfter: Json;                    // e.g. posterior mean/SD after trial
  qualityEvents: QualityEvent[];
}

interface SessionRecord {            // cf. PVANC §14.2
  sessionId: UUID; userPseudonymId: string; moduleVersion: SemVer;
  startedAt: ISO8601; calibrationProfile: CalibrationProfile;
  environment: EnvironmentSnapshot; procedureConfig: ProcedureConfig;
  result: ModuleResult;                          // threshold + CIs + category + limitations
  quality: QualityScore;
  baselineRef?: UUID; changeAssessment?: ChangeAssessment;
}
```

### 7.2 Storage layer (ports & adapters)

The engine depends only on **repository interfaces**; concrete adapters are swappable.

```ts
interface TrialRepository  { append(t: TrialRecord): Promise<void>; bySession(id: UUID): Promise<TrialRecord[]>; }
interface SessionRepository{ put(s: SessionRecord): Promise<void>; get(id: UUID): Promise<SessionRecord>; }
interface UserRepository   { baseline(uid: string): Promise<Baseline|null>; updateTrend(...): Promise<void>; }
interface CalibrationRepository { put(p: CalibrationProfile): Promise<void>; get(id: UUID): Promise<CalibrationProfile>; }
```

| Adapter | Use |
|---|---|
| `in-memory` | tests, simulation, CI (no persistence side-effects) |
| `sqlite` | on-device local-first storage; offline capable |
| `postgres-supabase` | server-side longitudinal store, clinician access, research aggregates |

**Privacy/security (PVANC §14.5):** pseudonymised IDs at the trial level; re-identification
key stored separately; encryption at rest and in transit handled at the adapter boundary;
deletion/retention (§14.4: raw 2y, sessions 5y, anon-aggregate indefinite) is a repository
policy, not engine logic — keeping the engine free of compliance concerns.

### 7.3 Exportable raw data

The **Export service** produces a self-describing bundle: every `TrialRecord` + the
`SessionRecord` + the `CalibrationProfile` + the `ModuleManifest` versions + the quality
report + a machine-readable limitations block. Formats: JSON (canonical) and CSV
(flattened trial table) for analysis. The bundle is sufficient to *independently recompute
the result off-device* — the operational test of §0.4.

---

## 8. Simulation Layer Design

The simulation layer lets the **entire measurement loop run headless and deterministically**
by replacing the human + host with a *virtual observer* behind the Simulation Port. It is
the backbone of validation and regression testing (Output requirement: simulation support).

### 8.1 Mechanism

- **Simulation Port** mirrors the Platform Port: instead of rendering a `StimulusFrame` and
  awaiting a human `ResponseEvent`, the harness asks a `VirtualObserver` to respond. The
  engine, modules, calibration, and QC are *unchanged* — only the edge is substituted.
- A `VirtualObserver` implements a psychometric model with **known ground-truth parameters**
  (true threshold, slope, lapse, guess rate). Modules ship a `referenceObserver` (§3.2).

```ts
interface VirtualObserver {
  respond(stimulus: StimulusSpec, rng: SeededRng): ResponseEvent; // probabilistic per psychometric fn
  readonly groundTruth: ObserverParams;                            // what the engine should recover
}

interface SimulationHarness {
  run(module: ModulePlugin, observer: VirtualObserver,
      cal: CalibrationProfile, seed: string): SimulationResult;    // full session, no UI
  sweep(grid: ParameterGrid): SimulationResult[];                  // many observers × conditions
}
```

### 8.2 What it enables

- **Ground-truth recovery:** drive an observer with known threshold, check the engine
  recovers it within tolerance (bias & variance) — validates the adaptive procedure +
  module scoring together.
- **Procedure characterisation:** trials-to-convergence, posterior-width vs trial-count,
  floor/ceiling behaviour, robustness to lapses and guessing.
- **Stress/edge scenarios:** simulated distance drift, illuminance excursions, timeouts,
  device-class differences — confirming QC flags fire and quality degrades correctly.
- **Deterministic regression:** because everything is seeded, a simulation run is a
  reproducible fixture; any change in engine/module output is caught in CI.

> Simulation is *dev/off-device only* and never ships in a clinical build. It exists to make
> the platform validatable (§0.8).

---

## 9. Validation Layer Design

Validation is a **first-class package** producing the evidence that gates claims (§6.4).
Two tiers: (A) automated, simulation-driven checks that run in CI on every change, and (B)
human-subject study tooling that ingests real data per a module's validation protocol.

### 9.1 Tier A — automated (CI gate)

| Check | Method | Pass criterion (per module's protocol) |
|---|---|---|
| **Ground-truth recovery** | Simulation sweep across the scale range | mean bias & variance within module-declared tolerance |
| **Determinism/replay** | Re-run from seed + trial log | bit-identical stimulus sequence & result |
| **Procedure convergence** | Trials-to-criterion distribution | within declared bounds; no non-termination |
| **QC behaviour** | Inject degradations | flags fire; quality bands correct |
| **Conformance** | Module Conformance Suite (§3.4) | all pass |

### 9.2 Tier B — human-subjects (study tooling, run per protocol)

Implements the statistical machinery the specs call for (PVANC §13): **Bland-Altman**
(mean bias + 95% LoA), **ICC**, **test-retest reliability & MDC**, diagnostic-accuracy
(sensitivity/specificity/AUC), learning-curve, and device-comparability analyses. It
*consumes exported raw bundles* (§7.3) and reference-standard data; it does not touch the
engine, preserving separation between the system under test and its evaluator.

### 9.3 Acceptance criteria are data, not code

Each module's `docs/validation/<module>.protocol.yaml` declares its targets (e.g. PVANC
§13.2: bias <0.05/<0.10 logMAR, LoA ±0.15/±0.20, ICC >0.85/>0.75). The validation package
reads these; it has no module-specific logic baked in. Reports are generated artefacts,
version-stamped and stored under `packages/validation/reports/`.

### 9.4 Validation status feeds claim gating

A module's `validationStatus` (`research-only → provisional → validated`) is only advanced
when the corresponding tier-B study report meets the protocol's acceptance criteria. Until
then, §6.4 caps what the module may claim. This closes the loop between evidence and output.

---

## 10. API Boundaries Between Core and Modules

The contract surface is deliberately **narrow and one-directional**: the engine *calls into*
modules through pure functions; modules *receive* capabilities (RNG, clock) by injection and
otherwise have no ambient authority.

### 10.1 The four boundaries

| Boundary | Direction | Carried types | Guarantee |
|---|---|---|---|
| **Platform Port** | engine ⇄ host | `StimulusFrame` (physical units), `ResponseEvent`, `DeviceSignals` | host renders & captures only; no measurement logic crosses |
| **Module contract** | engine → module | `StimulusRequest→StimulusSpec`, `ResponseEvent→TrialOutcome`, `ResultInput→ModuleResult` | module functions are pure & deterministic; no I/O |
| **Repository contract** | engine → storage | `TrialRecord`, `SessionRecord`, `CalibrationProfile` | persistence is swappable; engine holds no DB knowledge |
| **Simulation/Validation Port** | harness ⇄ engine | `VirtualObserver`, `SimulationResult` | substitutes the human edge without touching the core |

### 10.2 Call flow for one trial (who is allowed to call whom)

```
Orchestrator → Calibration.buildProfile()                    (once per session)
Orchestrator → Quality.preflight()                            (gate)
loop:
  TrialRunner → AdaptiveProcedure.nextIntensity()
  TrialRunner → Module.nextStimulus(req, rng)        → StimulusSpec
  TrialRunner → Calibration.degToPx() → StimulusFrame
  TrialRunner → Host.present(frame)                  (Platform Port, async)
  Host        → TrialRunner.onResponse(ResponseEvent)
  TrialRunner → Module.scoreResponse()               → TrialOutcome
  TrialRunner → AdaptiveProcedure.update(outcome)
  TrialRunner → TrialLog.append(TrialRecord)
  TrialRunner → Quality.monitors (in-flight)
until procedure.terminated()
Orchestrator → Module.deriveResult()                 → ModuleResult (+limitations)
Orchestrator → Quality.score()                       → QualityScore
Orchestrator → applyClaimGate(result, quality, validationStatus)   (§6.4)
Orchestrator → Repositories.persist()
```

**Rules:** modules never call the engine, storage, host, or each other — they only return
values. The orchestrator is the single conductor. This keeps the dependency graph acyclic
and every module independently testable against a mock engine.

---

## 11. Error Handling Policy

Errors are classified by *who must act* and *what happens to the data*. The overriding rule:
**never fabricate or silently coerce a measurement** — degrade explicitly or abort cleanly.

### 11.1 Error taxonomy

| Class | Examples | Engine behaviour | Data outcome |
|---|---|---|---|
| **Precondition / eligibility** | age <18, dark mode on, unsupported device | Block before measuring; clear user message | No session scored; eligibility event logged |
| **Recoverable in-flight** | app backgrounded, orientation change, single timeout | Pause/resume, discard affected trial, continue; emit `QualityEvent` | Session continues; affected trials flagged, not deleted |
| **Quality-degrading** | illuminance drift, low-confidence distance, capped ppd | Continue; record flag; lower quality score | Session scored but band/claim reduced (§6.3/§6.4) |
| **Completeness failure** | too few valid trials, no error-or-correct pair | Abort scoring | Marked "incomplete"; raw trials retained for audit |
| **Module/contract violation** | module throws, returns invalid `StimulusSpec`, non-deterministic | Sandbox catches; abort session; flag module | Session aborted; defect report; module quarantined |
| **Storage/transport** | adapter write fails, offline | Retry w/ backoff; buffer locally; never lose raw trials | Raw data buffered append-only until flushed |
| **Programming invariant** | impossible state in FSM | Fail fast, abort session, no partial result emitted | Crash report; no result persisted |

### 11.2 Principles

1. **Fail closed on claims.** Any uncertainty about validity reduces the claim, never
   inflates it. When in doubt, output "retake," not a number.
2. **Raw data is sacred.** No error path deletes or mutates `TrialRecord`s; even aborted
   sessions keep their raw trials for audit and debugging.
3. **Errors are typed, not stringly.** A single error taxonomy in `core-contracts/errors`;
   every error carries a class, a stable code, and whether it is user-actionable.
4. **Module faults are contained.** The Module Host sandbox treats a misbehaving module as
   a contained failure (abort + quarantine), never a platform crash — protecting other
   modules and the session record.

---

## 12. Versioning Policy

Everything that can affect a measurement is versioned, and provenance travels with the data
(§0.6). Three independent version axes:

| Axis | What it versions | Scheme | Compatibility rule |
|---|---|---|---|
| **Engine contract API** | `core-contracts` (the seams) | SemVer | modules declare `engineApiRange`; host refuses incompatible loads |
| **Module code** | each module package | SemVer | breaking change to stimulus/scoring/result ⇒ **major** bump |
| **Scientific spec** | e.g. `PVANC-1.0` | spec version (separate) | a module names the spec it implements; spec change drives module major |
| **Data schema** | storage record shapes | schema version + migrations | forward-only migrations; old records remain readable |

### 12.1 Rules

1. **Every `TrialRecord`/`SessionRecord` stamps `moduleVersion`, `specVersion`, contract
   API version, and `schemaVersion`.** A result is meaningless without knowing how it was
   produced.
2. **Measurement-affecting changes are major bumps.** Anything that could shift a threshold
   (optotype geometry, crowding spacing, procedure parameters, scoring) is a breaking
   change requiring re-validation before `validationStatus` can be `validated` again.
3. **Longitudinal comparisons respect versions.** Comparing across a major module version
   boundary is flagged ("methodology changed — establish new baseline"), mirroring the
   device-change rule (PVANC §16.1). The engine will not silently trend across incomparable
   versions.
4. **Specs are immutable once released; new science = new spec version.** `PVANC-1.0` never
   changes meaning; a refinement is `PVANC-1.1` with its own validation.
5. **Migrations never rewrite raw trials' scientific content** — only structural/storage
   concerns. Re-derivation uses the original version to interpret old raw data.

This is exactly the roadmap the PVANC spec assumes (§18: 1.0 Staircase → 1.1 Bayesian →
1.2 Calibrated → …): each step is a versioned, separately validated increment, not a
mutation of the prior one.

---

## 13. Assumptions and Constraints

### 13.1 Assumptions

1. **Physical-unit stimulus model is sufficient.** Specifying stimuli in degrees, cd/m², and
   CIE coordinates — then mapping to pixels via calibration — adequately captures the
   constructs across device classes. (Holds for acuity/contrast; colour and stereo will
   stress this and may need richer photometry — see risks.)
2. **Hosts can supply timestamped input and basic sensors** (light, accelerometer, DPR,
   battery). Modules requiring a signal a host lacks are simply ineligible on that device.
3. **Determinism is achievable** given seeded RNG + injected clock + pure module functions —
   the precondition for simulation, replay, and validation.
4. **Local-first with optional sync.** Devices may be offline during measurement; raw data is
   captured locally and synced later. The engine assumes no live network.
5. **One construct per module.** The constructs in the brief decompose cleanly into
   independent plug-ins sharing the measurement core. Cross-module analysis (PVANC §18 v3.0)
   is a *consumer of stored results*, not a coupling between modules.
6. **The PVANC spec is the canonical first module** and a representative template for the
   contract surface; other modules conform to the same seams.

### 13.2 Constraints (binding)

- **No implementation in this phase** — design and contracts only.
- **Accuracy over convenience** — codified as the claim-gating matrix (§6.4) and the
  "explicit degradation" error policy (§11).
- **No monolith** — enforced by package boundaries and the "modules never import modules"
  rule.
- **Validatable simplicity** — every component must be drivable in isolation by the
  Simulation Layer; if it can't be, it's too coupled.
- **No unsupported clinical claims** — structurally enforced, not merely documented.
- **Cross-platform feasibility** — all platform-specific code confined to host shells behind
  the Platform Port; the core is portable.

---

## 14. Risks and Tradeoffs

| # | Risk / Tradeoff | Impact | Mitigation / Stance |
|---|---|---|---|
| R1 | **Physical-unit abstraction leaks for colour & stereo.** Colour vision and stereoacuity need accurate per-device colour and binocular separation, which cheap displays/calibration can't guarantee. | Some modules unvalidatable on some devices | Allow modules to declare richer `PhotometrySpec`/binocular requirements and to gate eligibility hard on device class; mark such modules `research-only` until device-specific validation exists (§9.4). |
| R2 | **Viewing-distance accuracy is the dominant error source** (PVANC §15.1). Geometry mapping is only as good as distance. | Threshold bias/variance | Make distance method + uncertainty first-class in the calibration profile and propagate to quality; never trust camera estimation silently; prefer ≥2 m fixed-distance protocols where modules allow. |
| R3 | **Contract rigidity vs module diversity.** A single `ModulePlugin` shape may not fit very different paradigms (e.g. fixation stability via camera, reaction-time tasks, visual-field screening). | Either contract bloat or awkward modules | Keep the *core* contract minimal; add *optional capability interfaces* (e.g. `ContinuousSamplingModule`, `BinocularModule`) that modules opt into, rather than widening the base contract. Revisit after 3–4 modules implemented. |
| R4 | **Determinism vs realism.** Strict purity/seeding eases validation but real human timing/sensor noise is messy. | Sim may be over-optimistic | Simulation models lapse/guess/noise explicitly; tier-B human studies remain mandatory before any `validated` claim — sim never substitutes for clinical validation. |
| R5 | **Engine generality vs per-construct optimality.** A shared QUEST+/staircase library may not be optimal for every construct. | Slightly longer tests or less precision in edge modules | Treat the adaptive library as a *family* with per-module configuration; allow a module to ship a specialised procedure *if* it passes the same recovery/validation gates. |
| R6 | **Over-abstraction slows delivery.** Four ports + sandbox + claim gating is a lot before the first measurement runs. | Slower MVP | Build the vertical slice first (PVANC MVP per §17 — staircase, tumbling-E, fixed 2 m, session-level storage) through the real seams, so the architecture is *exercised*, not theoretical, by v1.0. |
| R7 | **Cross-platform host divergence.** Each shell may subtly differ in timing/rendering, biasing results between platforms. | Device/platform LoA inflation (PVANC §13.3) | A *host conformance test* (timing accuracy, luminance, geometry) every shell must pass; device-comparability is an explicit validation metric. |
| R8 | **Privacy/regulatory scope creep.** Longitudinal health data invites HIPAA/GDPR/MDR obligations. | Compliance burden, liability | Keep compliance at the repository/adapter boundary and in policy, not in the engine; pseudonymise at source; claim-gating prevents regulated claims until cleared (PVANC §18.3). |
| R9 | **Module proliferation without validation.** Easy plug-in model could ship many `provisional` modules that look clinical. | Unsupported-claim risk | Validation status is *evidence-driven* and gates output; the Module Conformance Suite + tier-A CI are required just to load; tier-B required to advance status. |

### 14.1 Key tradeoffs, stated plainly

- **We chose strict separation (more seams, more upfront design) over a faster monolith**,
  because independent validation and "no unsupported claims" are the brief's hard
  requirements and a monolith cannot satisfy them.
- **We chose physical-unit stimulus contracts over pixel-level convenience**, accepting more
  calibration work, because it is the only device-agnostic, scientifically auditable basis
  for cross-device comparison and longitudinal follow-up.
- **We chose determinism + simulation as a foundation, not an add-on**, accepting some
  realism gap, because a platform that cannot be replayed and simulated cannot be validated —
  and validation is the whole point.

---

## Appendix A — Mapping of brief requirements to this design

| Brief requirement | Where addressed |
|---|---|
| Modular architecture / no monolith | §1, §2, §0.3 |
| Shared measurement core | §4 |
| Separate module plug-ins | §3, §2 (`packages/modules/*`) |
| Testability | §0.6, §3.4, §8, §9.1 |
| Versioning | §12 |
| Calibration support | §5 |
| Quality-control support | §6 |
| Trial-level logging | §4 (Trial Log), §7.1 |
| Exportable raw data | §7.3 |
| Longitudinal follow-up | §3.2 (baseline/change), §6.4, §7.1 (user store), §12.3 |
| Device profile awareness | §5.1 |
| Cross-platform feasibility | §1 (Platform Port), §10.1, §13.2, R7 |
| Scientific grounding / no unsupported claims | §0.1, §0.7, §6.4, §9.4 |

## Appendix B — Glossary (architecture terms)

| Term | Meaning |
|---|---|
| **Construct** | The thing a module measures (acuity, contrast, colour…). |
| **Module / plug-in** | An independently versioned, validated implementation of one construct against the engine contract. |
| **Measurement core / engine** | Shared, construct-agnostic machinery: sessions, trials, adaptive procedures, logging. |
| **Platform Port** | Engine ⇄ host shell boundary; carries physical-unit stimulus frames and raw responses. |
| **Calibration profile** | The recorded device + distance + luminance context of a measurement; required to score. |
| **Quality score** | 0–100 composable confidence metric; gates claims. |
| **Claim gating** | Structural limiting of output to what quality + validation status permit. |
| **Virtual observer** | A simulated subject with known ground truth used to validate the engine + module. |
| **Validation status** | `research-only / provisional / validated`; evidence-driven; controls permitted claims. |
