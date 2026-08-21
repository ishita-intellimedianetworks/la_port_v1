// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────


// Cache the mobile-detect once so we don't re-check per material.
let _isLowPower: boolean | null = null;
function isLowPower(): boolean {
  if (_isLowPower !== null) return _isLowPower;
  if (typeof window === "undefined") return (_isLowPower = false);
  if (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return (_isLowPower = true);
  if (typeof window !== "undefined" && window.innerWidth < 768) return (_isLowPower = true);
  if (typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 8) <= 4) return (_isLowPower = true);
  return (_isLowPower = false);
}


export default isLowPower;

export { disposeGLTFScene, acquireGLTF, releaseGLTF } from "./dispose-gltf";
export { prefetchUrls } from "./prefetch";