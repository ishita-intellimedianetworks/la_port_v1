import { useEffect } from "react";
import { setVrStreaming } from "./engine/stream";

export function useVrStreaming() {
  setVrStreaming(true);
  useEffect(() => {
    setVrStreaming(true);
    return () => setVrStreaming(false);
  }, []);
}
