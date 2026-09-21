import { Suspense } from "react";
import TerminalExperienceV3 from "@/terminal-v3";

export default function V3() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV3 site="v3" />
    </Suspense>
  );
}
