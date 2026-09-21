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
  revealVeil?: boolean;
}

const HtlVeil: React.FC<{ revealVeil: boolean }> = ({ revealVeil }) => {
  const rawProgress = useProgressStore((s) => s.progress);
  const VEIL_THIN_END = 35;
  const VEIL_MIN_ALPHA = 0.22;
  const thin = revealVeil ? Math.min(1, Math.max(0, rawProgress / VEIL_THIN_END)) : 0;
  return <div className="htl-veil" style={{ opacity: 1 - thin * (1 - VEIL_MIN_ALPHA) }} />;
};

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

export const HoloTwinHud: React.FC<HoloTwinHudProps> = ({
  progress: _ignoredProgress,
  visible,
  onFadeComplete,
  unitName,
  revealVeil = false,
}) => {
  void _ignoredProgress;

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
