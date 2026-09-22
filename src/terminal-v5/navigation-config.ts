export const navConfig = {
  color: {
    routeCore: "#2684ff",
    routeCasing: "#0d4fb5",
    pillBg: "#0d4fb5",
    pillText: "#ffffff",
    destRed: "#e8453c",
  },

  scene3d: {
    lineWidthM: 0.18,
    liftM: 0.04,
    pinHeadM: 0.09,
    pinFloatM: 0.16,
    pinBobM: 0.04,
    ringOuterM: 0.2,
  },

  minimap: {
    coreWidthPx: 3.5,
    casingWidthPx: 6,
    destPinHeadPx: 6.5,
    pillFontPx: 11,
  },

  hud: {
    tileColor: "#1a73e8",
  },

  seatView: {
    eyeY: 0.1,
  },

  logic: {
    siteSpanMeters: 990,
    walkMps: 6000 / 3600,
    defaultSpeedMult: 10,

    siteSpanUnits: 990,
    get displayMetersPerUnit(): number {
      return this.siteSpanMeters / this.siteSpanUnits;
    },

    realEyeHeightM: 1.6,
    turnMinDeg: 18,
    rightIsPositiveCross: false,
  },
};
