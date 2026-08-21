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
  // Bar reads the SHARED smoothed reveal value from the progress store so the
  // HUD bar fills in lockstep with the in-scene glow → fade animation. If we
  // read drei's raw progress here, the bar would hit 100% before the effect
  // finished, recreating the "effect happens after 100%" complaint.
  // (The `progress` prop is still accepted for API compatibility but ignored.)
  const revealProgress = useProgressStore((s) => s.revealProgress);
  void _ignoredProgress;
  const percent = Math.round(revealProgress * 100);

  // Background veil over the canvas. The point cloud's density tracks the RAW
  // download progress (see ScenePreview), so the veil thins with the same raw
  // value: dark at 0%, mostly clear by ~35% downloaded — the silhouette is on
  // show for the whole download. A floor of 0.22 keeps the HUD text readable
  // against the bright sky until the whole HUD fades out at 100%.
  const rawProgress = useProgressStore((s) => s.progress); // 0..100
  const VEIL_THIN_END  = 35;    // raw % at which the veil reaches its floor
  const VEIL_MIN_ALPHA = 0.22;
  const thin = revealVeil ? Math.min(1, Math.max(0, rawProgress / VEIL_THIN_END)) : 0;
  const veilAlpha = 1 - thin * (1 - VEIL_MIN_ALPHA);

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
      // Dynamic veil — residentialTheme.background (#030b14) with the
      // progress-driven alpha computed above.
      backgroundColor: `rgba(3, 11, 20, ${veilAlpha})`,
    } as React.CSSProperties
  }
  role="status"
  aria-live="polite"
  aria-label="Loading digital twin"
>
  <div className="htl-bg-radial" />

  {/* Spacer to push hud to vertical center */}
  <div />

  <div className="htl-hud" style={{ marginTop: 0 }}>
    <div className="htl-title">Initializing</div>

    <div className="htl-tagline">
      {unitName}
    </div>
    <div className="htl-progress">
      <div className="htl-progress-track">
        <div className="htl-progress-fill" style={{ width: `${percent}%` }} />
      </div>
        <span className="htl-percent">{percent}%</span>
    </div>
  </div>

  <footer className="htl-footer">
    <div className="htl-brand">HOLOTWIN<sup>™</sup></div>
  </footer>

  {/* {error && <div className="htl-error" role="alert">{error}</div>} */}
</div>
  );
};

export default HoloTwinHud;
