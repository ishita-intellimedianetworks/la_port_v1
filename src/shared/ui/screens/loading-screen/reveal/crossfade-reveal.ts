import type { SharedUniforms } from './point-cloud-preview';

export interface CrossfadeOptions {
  /** Total duration in ms. Default: 3500. */
  durationMs?: number;
  /** Easing function 0..1 → 0..1. Default: smootherstep. */
  easing?: (k: number) => number;
}

/**
 * Animate sharedUniforms.uGlobalAlpha from 0 → 1, driving:
 *   - The patched mesh materials to dither-fill in (more pixels pass the
 *     per-pixel discard test)
 *   - The HoloTwinPreview point cloud to fade out
 *
 * Both happen in lockstep because they read the SAME uniform. Resolves
 * once the animation completes.
 */
export function crossfadeReveal(
  sharedUniforms: SharedUniforms,
  options: CrossfadeOptions = {}
): Promise<void> {
  const dur = options.durationMs ?? 3500;
  const ease = options.easing ?? smootherstep;
  return new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      sharedUniforms.uGlobalAlpha.value = ease(k);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    step();
  });
}

export function smoothstep(k: number): number {
  return k * k * (3 - 2 * k);
}

export function smootherstep(k: number): number {
  return k * k * k * (k * (k * 6 - 15) + 10);
}
