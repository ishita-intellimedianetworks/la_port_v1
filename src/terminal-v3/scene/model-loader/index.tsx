"use client";

import { Suspense } from "react";
import { SingleModelContent, SingleModelProps } from "./model-content";

export function SingleModel(props: SingleModelProps) {
  return (
    <Suspense fallback={null}>
      <SingleModelContent {...props} />
    </Suspense>
  );
}
