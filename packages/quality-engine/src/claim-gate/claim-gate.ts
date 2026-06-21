/**
 * Claim gate — structural prevention of unsupported claims.
 *
 * The permitted output is the MINIMUM of what the quality band allows and what
 * the module's validation status allows (ARCHITECTURE §6.4). This is enforced in
 * code, not merely documented, so a low-quality or unvalidated result can never
 * present a clinical-grade claim.
 */

import type { QualityBand, ValidationStatus, PermittedOutput, ClaimGate } from '@vision-platform/core-contracts';

// Ordered from most to least permissive.
const OUTPUT_RANK: Record<PermittedOutput, number> = {
  'full-category-share-trend': 3,
  'trend-with-caveat': 2,
  'numeric-research-only': 1,
  retake: 0,
};

/** Ceiling imposed by the quality band alone. */
function bandCeiling(band: QualityBand): PermittedOutput {
  switch (band) {
    case 'high':
      return 'full-category-share-trend';
    case 'moderate':
      return 'trend-with-caveat';
    case 'low':
      return 'retake';
  }
}

/** Ceiling imposed by the module's validation status alone. */
function statusCeiling(status: ValidationStatus): PermittedOutput {
  switch (status) {
    case 'validated':
      return 'full-category-share-trend';
    case 'provisional':
      return 'trend-with-caveat';
    case 'research-only':
      return 'numeric-research-only';
  }
}

function minOutput(a: PermittedOutput, b: PermittedOutput): PermittedOutput {
  return OUTPUT_RANK[a] <= OUTPUT_RANK[b] ? a : b;
}

export const claimGate: ClaimGate = {
  permit(band: QualityBand, status: ValidationStatus): PermittedOutput {
    return minOutput(bandCeiling(band), statusCeiling(status));
  },
};
