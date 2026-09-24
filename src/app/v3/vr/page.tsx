import { Suspense } from "react";
import TerminalExperienceV3Vr from "@/terminal-v3/vr";

export default function V3Vr() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV3Vr site="v3" />
    </Suspense>
  );
}
