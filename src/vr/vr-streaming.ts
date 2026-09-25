import { useEffect } from "react";
import { setVrStreaming } from "@/streaming/config";

export function useVrStreaming() {
  setVrStreaming(true);
  useEffect(() => {
    setVrStreaming(true);
    return () => setVrStreaming(false);
  }, []);
}
