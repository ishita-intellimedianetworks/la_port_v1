import { Suspense } from "react";
import TerminalExperienceV4Vr from "@/terminal-v4/vr";

export default function V4Vr() {
  return (
    <Suspense fallback={null}>
      <TerminalExperienceV4Vr site="v4" />
    </Suspense>
  );
}
