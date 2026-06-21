/**
 * Error taxonomy (contract only).
 *
 * Errors are classified by WHO must act and WHAT happens to the data.
 * Overriding rule: never fabricate or silently coerce a measurement —
 * degrade explicitly (a quality flag) or abort cleanly.
 *
 * See docs/architecture/ARCHITECTURE.md §11.
 */

export type ErrorClass =
  | 'precondition' // eligibility/pre-flight block before measuring
  | 'recoverable' // in-flight, session continues (trial discarded/paused)
  | 'quality-degrading' // session continues; quality score reduced
  | 'completeness' // not enough valid data to score; abort scoring
  | 'module-violation' // module threw / returned invalid contract value
  | 'storage' // persistence/transport failure; raw data must be buffered
  | 'invariant'; // impossible state; fail fast, emit no partial result

/** Stable, machine-readable error code. Strings are illustrative placeholders. */
export type ErrorCode = string;

export interface PlatformError {
  errorClass: ErrorClass;
  code: ErrorCode;
  /** Whether the end user can act on this (vs. internal/operator concern). */
  userActionable: boolean;
  /** Human-readable summary (no PII). */
  message: string;
  /** Optional structured context for logs/audit. */
  context?: Record<string, unknown>;
}
