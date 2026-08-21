import { Suspense } from "react";
import TerminalExperience from "@/terminal";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <TerminalExperience />
    </Suspense>
  );
}
