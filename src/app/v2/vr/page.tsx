import { Suspense } from "react";
import TerminalExperienceVr from "@/terminal/vr";

export default function V2Vr() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceVr site="v2" />
    </Suspense>
  );
}
