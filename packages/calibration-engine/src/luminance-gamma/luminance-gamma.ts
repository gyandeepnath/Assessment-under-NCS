/**
 * Luminance / gamma calibration (deferred).
 *
 * Setting/verifying screen brightness against a calibrated target and applying
 * gamma correction so requested contrast (Weber) and luminance (cd/m²) are met
 * is out of scope for this shared-measurement-core pass (it needs a per-device
 * photometric database, a versioned data asset). See ARCHITECTURE §5.
 */
export {};
