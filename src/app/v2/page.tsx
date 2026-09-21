import { Suspense } from "react";
import TerminalExperience from "@/terminal";

export default function V2() {
  return (
    <Suspense fallback={null}>
      <TerminalExperience site="v2" />
    </Suspense>
  );
}
