"use client";

import { createContext, useContext, useMemo } from "react";
import { getSite, type Site, type SiteId } from "./index";

const Ctx = createContext<SiteId>("v1");

export function SiteProvider({ id, children }: { id: SiteId; children: React.ReactNode }) {
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

export function useSiteId(): SiteId {
  return useContext(Ctx);
}

export function useSite(): Site {
  const id = useContext(Ctx);
  return useMemo(() => getSite(id), [id]);
}
