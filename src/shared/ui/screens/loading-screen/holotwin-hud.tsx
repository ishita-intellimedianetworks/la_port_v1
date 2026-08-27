"use client";

import React, { useEffect } from 'react';
import { useProgressStore } from '@/shared/stores/progress-store';

export interface HoloTwinHudProps {
  progress: number;
  visible: boolean;
  /** Called once the fade-out animation completes (~350 ms). */
  onFadeComplete?: () => void;
  /** Dynamic unit/space name (e.g., "unit 25") */
  unitName?: string;
  /** A point-cloud preview is loading behind this HUD — thin the background
   *  veil during the reveal so the silhouette shows through. Leave false in
   *  the preview-less path: there the scene behind is NOT progress-synced and
   *  thinning would flash it through while the bar is still filling. */
  revealVeil?: boolean;
}

/**
 * The background veil, as its own subscriber.
 *
 * It used to be `backgroundColor: rgba(3,11,20,a)` written straight onto
 * `.htl-root`, recomputed every frame from the smoothed progress. That is a
 * full-screen REPAINT per frame — and it also invalidated the `mix-blend-mode`
 * radial sitting on top of it, so the compositor re-blended the whole screen
 * too, all while the main thread was busy decoding chunks. Same pixels, but as
 * an `opacity` on a dedicated layer, which the compositor can change without
 * repainting anything.
 *
 * Separate component so the rest of the HUD stops re-rendering 60×/s with it.
 */
const HtlVeil: React.FC<{ revealVeil: boolean }> = ({ revealVeil }) => {
  // The point cloud's density tracks the RAW download progress (see
  // ScenePreview), so the veil thins with the same raw value: dark at 0%,
  // mostly clear by ~35% downloaded — the silhouette is on show for the whole
  // download. A floor of 0.22 keeps the HUD text readable against the bright
  // sky until the whole HUD fades out at 100%.
  const rawProgress = useProgressStore((s) => s.progress); // 0..100
  const VEIL_THIN_END = 35; // raw % at which the veil reaches its floor
  const VEIL_MIN_ALPHA = 0.22;
  const thin = revealVeil ? Math.min(1, Math.max(0, rawProgress / VEIL_THIN_END)) : 0;
  return <div className="htl-veil" style={{ opacity: 1 - thin * (1 - VEIL_MIN_ALPHA) }} />;
};

/**
 * The bar and its readout, as their own subscriber.
 *
 * Reads the SHARED smoothed reveal value from the progress store so the HUD bar
 * fills in lockstep with the in-scene glow → fade animation. Reading drei's raw
 * progress here would make the bar hit 100% before the effect finished,
 * recreating the "effect happens after 100%" complaint.
 *
 * Driven by `transform: scaleX()`, not `width`. Width put a 120 ms LAYOUT
 * animation on the main thread after every one of the hundred-odd steps — so,
 * in practice, continuously for the whole load, next to the mesh decoding.
 * scaleX runs on the compositor. The gradient is unchanged by the swap: it is
 * sized to the element's own box either way, so the same span of it is on
 * screen at any given percentage.
 */
const HtlProgress: React.FC = () => {
  const revealProgress = useProgressStore((s) => s.revealProgress);
  const percent = Math.round(revealProgress * 100);
  return (
    <div className="htl-progress">
      <div className="htl-progress-track">
        <div className="htl-progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <span className="htl-percent">{percent}%</span>
    </div>
  );
};

/**
 * HoloTwinHud — pure-DOM branded loader overlay.
 *
 * The HUD is *only* HTML — no 3D inside it. The point cloud and the GLB
 * live in your main Three.js scene (using HoloTwinPreview + patchMeshForReveal
 * from the core package). This way the loader visual is in the same camera
 * space as the textured model, so the crossfade reads as the model
 * "growing out of" the silhouette rather than a separate overlay.
 */
export const HoloTwinHud: React.FC<HoloTwinHudProps> = ({
  progress: _ignoredProgress,
  visible,
  onFadeComplete,
  unitName,
  revealVeil = false,
}) => {
  // NOTHING here subscribes to progress any more — the two values that change
  // every frame live in HtlVeil and HtlProgress above, so this shell renders
  // once instead of sixty times a second.
  // (The `progress` prop is still accepted for API compatibility but ignored.)
  void _ignoredProgress;

  // Residential color theme (hardcoded)
  const residentialTheme = {
    color: '#0fb7ff',
    accentColor: '#00FFCC',
    background: '#030b14',
  };

  useEffect(() => {
    if (visible || !onFadeComplete) return;
    // Matches the 0.35s opacity transition in .htl-hidden (globals.css) plus a
    // small safety margin so the unmount happens after pointer-events releases.
    const t = window.setTimeout(onFadeComplete, 400);
    return () => window.clearTimeout(t);
  }, [visible, onFadeComplete]);

  return (
 <div
  className={`htl-root ${visible ? 'htl-visible' : 'htl-hidden'}`}
  style={
    {
      '--htl-color':  residentialTheme.color,
      '--htl-accent': residentialTheme.accentColor,
      '--htl-bg':     residentialTheme.background,
    } as React.CSSProperties
  }
  role="status"
  aria-live="polite"
  aria-label="Loading digital twin"
>
  {/* Behind everything else in the root (z-index -1), exactly where the root's
      own background-color used to sit — so the stacking is unchanged. */}
  <HtlVeil revealVeil={revealVeil} />

  <div className="htl-bg-radial" />

  {/* Spacer to push hud to vertical center */}
  <div />

  <div className="htl-hud" style={{ marginTop: 0 }}>
    <div className="htl-title">Initializing</div>

    <div className="htl-tagline">
      {unitName}
    </div>
    <HtlProgress />
  </div>

  <footer className="htl-footer">
    <div className="htl-brand">HOLOTWIN<sup>™</sup></div>
  </footer>

  {/* {error && <div className="htl-error" role="alert">{error}</div>} */}
</div>
  );
};

export default HoloTwinHud;
