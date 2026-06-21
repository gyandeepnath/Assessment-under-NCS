/**
 * Eligibility / preconditions (PVANC §4, §5.2).
 *
 * Pure decision function. Blocks the test when validity cannot be assured
 * (under-18, unsupported device class); other conditions are handled as quality
 * flags downstream, not here.
 */

import type { EligibilityContext, EligibilityResult, DeviceClass } from '@vision-platform/core-contracts';

const SUPPORTED_CLASSES: readonly DeviceClass[] = ['smartphone', 'tablet', 'desktop'];
const MIN_AGE = 18;

export function checkEligibility(ctx: EligibilityContext): EligibilityResult {
  if (typeof ctx.selfReportedAge === 'number' && ctx.selfReportedAge < MIN_AGE) {
    return { decision: 'block', reason: 'validation data is insufficient for ages under 18; seek pediatric eye care' };
  }
  if (!SUPPORTED_CLASSES.includes(ctx.deviceClass)) {
    return { decision: 'block', reason: `device class "${ctx.deviceClass}" is not supported` };
  }

  const flags: string[] = [];
  if (typeof ctx.selfReportedAge === 'number' && ctx.selfReportedAge < 22) {
    flags.push('age 18–21 is plausible but not formally validated');
  }
  return flags.length > 0 ? { decision: 'proceed-with-flags', flags } : { decision: 'allow' };
}
