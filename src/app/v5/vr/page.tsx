import { Suspense } from "react";
import TerminalExperienceV5Vr from "@/terminal-v5/vr";

export default function V5Vr() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV5Vr site="v5" />
    </Suspense>
  );
}
