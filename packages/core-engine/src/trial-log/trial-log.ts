/**
 * Trial log — append-only, ordered record of trials and quality events.
 *
 * This is the engine's source of truth: every derived value must be recomputable
 * from the logged trials (ARCHITECTURE §0.4, §4). The log therefore exposes NO
 * mutation or deletion API, and freezes each record on append so callers cannot
 * retroactively alter the scientific record. Persistence is a separate concern
 * (the data layer subscribes and writes through to a repository).
 */

import type { TrialRecord, QualityEvent } from '@vision-platform/core-contracts';

export type TrialListener = (record: Readonly<TrialRecord>) => void;
export type EventListener = (event: Readonly<QualityEvent>) => void;

export class TrialLog {
  private readonly trials: TrialRecord[] = [];
  private readonly events: QualityEvent[] = [];
  private readonly trialListeners = new Set<TrialListener>();
  private readonly eventListeners = new Set<EventListener>();

  /** Append a trial. The record is deep-frozen; appends are strictly ordered. */
  append(record: TrialRecord): void {
    const frozen = deepFreeze(record);
    this.trials.push(frozen);
    for (const fn of this.trialListeners) fn(frozen);
  }

  /** Append a quality event (e.g. an in-flight QC monitor firing). */
  appendEvent(event: QualityEvent): void {
    const frozen = deepFreeze(event);
    this.events.push(frozen);
    for (const fn of this.eventListeners) fn(frozen);
  }

  /** All trials in append order (read-only view). */
  all(): readonly Readonly<TrialRecord>[] {
    return this.trials;
  }

  /** Trials for a given session, in order. */
  bySession(sessionId: string): Readonly<TrialRecord>[] {
    return this.trials.filter((t) => t.sessionId === sessionId);
  }

  allEvents(): readonly Readonly<QualityEvent>[] {
    return this.events;
  }

  get size(): number {
    return this.trials.length;
  }

  /** Subscribe to appends (used by the data layer and QC hooks). Returns an unsubscribe fn. */
  onTrial(listener: TrialListener): () => void {
    this.trialListeners.add(listener);
    return () => this.trialListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
}

/** Recursively freeze a record so logged data is immutable. */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}
