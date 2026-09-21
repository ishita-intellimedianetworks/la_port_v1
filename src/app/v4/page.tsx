import { Suspense } from "react";
import TerminalExperienceV4 from "@/terminal-v4";

export default function V4() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV4 site="v4" />
    </Suspense>
  );
}
