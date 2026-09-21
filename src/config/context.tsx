"use client";

import { createContext, useContext, useMemo } from "react";
import { getSite, type Site, type SiteId } from "./index";

const Ctx = createContext<SiteId>("v1");

export function SiteProvider({ id, children }: { id: SiteId; children: React.ReactNode }) {
  return <Ctx.Provider value={id}>{children}</Ctx.Provider>;
}

/** The id alone — for the handful of places that only need to branch. */
export function useSiteId(): SiteId {
  return useContext(Ctx);
}

/** The resolved site: `scene`, `ui`, the two tables, the id lookups and the
 *  pose helpers. Referentially stable per id, so it is safe in a dep array. */
export function useSite(): Site {
  const id = useContext(Ctx);
  return useMemo(() => getSite(id), [id]);
}
