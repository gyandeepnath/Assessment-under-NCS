/**
 * Platform Port — engine ⇄ host shell boundary (contract only).
 *
 * The engine emits abstract StimulusFrames in physical units; the host renders
 * them and returns timestamped ResponseEvents and DeviceSignals. Neither side
 * knows the other's internals. The same port is mirrored by the Simulation Port
 * so a virtual observer can replace the human + host (see simulation.contract).
 *
 * See docs/architecture/ARCHITECTURE.md §1, §10.1.
 */

import type { Millis, Pixels, Candela, ISO8601 } from './units';

export type DeviceClass = 'smartphone' | 'tablet' | 'desktop' | 'other';

export type DeviceSignalKind =
  | 'ambient-light'
  | 'accelerometer'
  | 'device-pixel-ratio'
  | 'battery'
  | 'screen-dimensions'
  | 'brightness';

/** Raw sensor + environment snapshot supplied by the host. */
export interface DeviceSignals {
  deviceModel?: string;
  deviceClass: DeviceClass;
  devicePixelRatio?: number;
  ambientLux?: number;
  brightnessSetting?: number; // 0..100
  autoBrightness?: 'on' | 'off' | 'unknown';
  darkMode?: 'on' | 'off' | 'unknown';
  colourFilter?: 'on' | 'off' | 'unknown';
  batteryLevel?: number; // 0..1
  orientation?: 'portrait' | 'landscape';
  capturedAt: ISO8601;
}

/** A fully-resolved, device-specific frame the host renders verbatim. */
export interface StimulusFrame {
  stimulusId: string;
  /** Pixel geometry resolved by the calibration engine from physical units. */
  renderPixels: Record<string, Pixels>;
  backgroundLuminance: Candela;
  foregroundLuminance: Candela;
  /** Allowed response affordances the host should present. */
  responseAffordances: string[];
}

export interface ResponseEvent {
  stimulusId: string;
  onsetTimestamp: Millis;
  responseTimestamp: Millis;
  latencyMs: number;
  rawValue: string;
  inputModality:
    | 'swipe'
    | 'tap'
    | 'key'
    | 'mouse'
    | 'voice'
    | 'facilitator';
}

/**
 * The host shell implements this port. The engine calls present() and is
 * notified of responses; the host owns rendering and input only.
 */
export interface PlatformPort {
  present(frame: StimulusFrame): Promise<void>;
  onResponse(handler: (e: ResponseEvent) => void): void;
  readSignals(): Promise<DeviceSignals>;
}
