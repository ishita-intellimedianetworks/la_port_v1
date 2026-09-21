import { Suspense } from "react";
import TerminalExperienceV5 from "@/terminal-v5";

export default function V5() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV5 site="v5" />
    </Suspense>
  );
}
