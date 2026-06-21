/**
 * PVANC module manifest (PVANC-1.0-SPEC, §title block).
 *
 * `validationStatus: 'provisional'` is deliberate: the module is built to the
 * spec but has NOT completed the ETDRS agreement study (§13), so the claim gate
 * caps outputs below clinical-grade until that evidence exists.
 */

import type { ModuleManifest } from '@vision-platform/core-contracts';

export const PVANC_MANIFEST: ModuleManifest = {
  moduleId: 'acuity-pvanc',
  construct: 'Presenting visual acuity under non-clinical conditions',
  scale: 'logMAR',
  specVersion: 'PVANC-1.0',
  moduleVersion: '1.0.0',
  engineApiRange: '>=0.0.0',
  scientificRisk: 'MODERATE',
  referenceStandard: 'ETDRS',
  supportedDeviceClasses: ['smartphone', 'tablet', 'desktop'],
  requiredCalibration: ['device-profile', 'viewing-distance'],
  requiredSignals: ['device-pixel-ratio'],
  validationStatus: 'provisional',
  defaultProcedure: 'pvanc-hybrid',
};
