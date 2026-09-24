"use client";

import { createContext, useContext, type ReactNode } from "react";

const VrModeContext = createContext(false);

export function VrModeProvider({ children }: { children: ReactNode }) {
  return <VrModeContext.Provider value>{children}</VrModeContext.Provider>;
}

export function useIsVr() {
  return useContext(VrModeContext);
}
