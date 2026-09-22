import { navConfig } from "../../navigation-config";

export function etaSeconds(worldDist: number, metersPerUnit: number): number {
  return (worldDist * metersPerUnit) / navConfig.logic.walkMps;
}

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

export function fmtMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
  return `${Math.max(0, Math.round(m))} m`;
}
