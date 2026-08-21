/**
 * Shared navigation formatting — used by the turn HUD and the minimap route
 * label so both read the same as a maps app.
 *
 * ETA is computed from REAL distance ÷ a real walking pace, NOT the in-app
 * camera speed (which flies far faster than a person walks). That's why the
 * displayed minutes are realistic and don't "pass like seconds".
 */

import { navConfig } from "../../navigation-config";

/** World-unit path length → real ETA seconds, given metres-per-world-unit. */
export function etaSeconds(worldDist: number, metersPerUnit: number): number {
  return (worldDist * metersPerUnit) / navConfig.logic.walkMps;
}

/** Real minutes + seconds, e.g. "3 min", "1 min 20 sec", "45 sec". */
export function fmtEta(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${Math.max(1, s)} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m} min ${r} sec` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} hr ${rm} min` : `${h} hr`;
}

/** Real distance label, e.g. "180 m", "1.2 km". */
export function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.max(0, Math.round(m))} m`;
}
