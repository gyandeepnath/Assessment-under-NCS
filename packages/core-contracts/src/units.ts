/**
 * Physical & perceptual unit value types.
 *
 * The platform speaks in physical/perceptual units at the module boundary
 * (degrees of visual angle, cd/m², Weber contrast, CIE coordinates). The
 * calibration engine and host shells translate these to device pixels.
 * Branded primitives keep units from being mixed up at compile time.
 *
 * Contract only — see docs/architecture/ARCHITECTURE.md §3.3 and §5.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type Degrees = Brand<number, 'Degrees'>; // degrees of visual angle
export type ArcMin = Brand<number, 'ArcMin'>;
export type Pixels = Brand<number, 'Pixels'>;
export type Millimetres = Brand<number, 'Millimetres'>;
export type Metres = Brand<number, 'Metres'>;
export type Candela = Brand<number, 'Candela'>; // luminance, cd/m²
export type WeberContrast = Brand<number, 'WeberContrast'>; // 0..1
export type Millis = Brand<number, 'Millis'>; // monotonic-clock milliseconds
export type LogMAR = Brand<number, 'LogMAR'>;

/** CIE 1931 xyY chromaticity + luminance. */
export interface CieColour {
  x: number;
  y: number;
  Y: Candela;
}

/** A value on a module's measurement scale (units described by the manifest). */
export type ScaleValue = Brand<number, 'ScaleValue'>;
export type ScaleDelta = Brand<number, 'ScaleDelta'>;
export interface ScaleRange {
  min: ScaleValue;
  max: ScaleValue;
}

export type UUID = string;
export type ISO8601 = string;
export type SemVer = string; // e.g. "1.0.0"
export type SemVerRange = string; // e.g. ">=1.0.0 <2.0.0"
