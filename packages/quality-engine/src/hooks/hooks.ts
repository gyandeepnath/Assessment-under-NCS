/**
 * Quality-control hook framework.
 *
 * The engine provides the mechanism; modules (and the engine's own generic
 * checks) provide the policy. Checks are registered and run at two phases:
 * pre-flight (before measuring — may BLOCK) and in-flight (per trial — may FLAG).
 * The framework makes degradations visible and quantified rather than hidden
 * (ARCHITECTURE §6). Checks are pure functions of their context, so they are
 * trivially testable and deterministic.
 */

import type { QualityFlag, QualityVerdict } from '@vision-platform/core-contracts';

export type CheckResult =
  | { kind: 'pass' }
  | { kind: 'flag'; flag: QualityFlag }
  | { kind: 'block'; reason: string };

export interface QualityCheck<Ctx> {
  code: string;
  phase: 'preflight' | 'inflight';
  run(ctx: Ctx): CheckResult;
}

export interface AggregatedResult {
  blocked: boolean;
  blockReasons: string[];
  flags: QualityFlag[];
}

export class QualityHookRegistry<Ctx> {
  private readonly checks: QualityCheck<Ctx>[] = [];

  register(check: QualityCheck<Ctx>): this {
    this.checks.push(check);
    return this;
  }

  get size(): number {
    return this.checks.length;
  }

  /** Run all checks of a phase and aggregate their results. */
  run(phase: 'preflight' | 'inflight', ctx: Ctx): AggregatedResult {
    const flags: QualityFlag[] = [];
    const blockReasons: string[] = [];
    for (const check of this.checks) {
      if (check.phase !== phase) continue;
      const r = check.run(ctx);
      if (r.kind === 'flag') flags.push(r.flag);
      else if (r.kind === 'block') blockReasons.push(`${check.code}: ${r.reason}`);
    }
    return { blocked: blockReasons.length > 0, blockReasons, flags };
  }
}

/** Map an aggregated pre-flight result to the contract's QualityVerdict. */
export function toVerdict(result: AggregatedResult): QualityVerdict {
  if (result.blocked) return { decision: 'block', reason: result.blockReasons.join('; ') };
  if (result.flags.length > 0) return { decision: 'flag', flags: result.flags };
  return { decision: 'allow' };
}
