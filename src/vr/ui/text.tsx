"use client";

import type { ComponentProps } from "react";
import { Text } from "@react-three/uikit";

void import("@pmndrs/msdfonts/inter").catch(() => {});

const FOLD: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  "…": "...",
  "•": "-",
  "·": "-",
  "×": "x",
  "→": "->",
  "←": "<-",
};

const KEEP = new Set(["°", "§"]);

export function fontSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || ch === "\n" || KEEP.has(ch)) out += ch;
    else if (ch in FOLD) out += FOLD[ch];
    else out += "?";
  }
  return out;
}

export function VrText({ children, ...props }: ComponentProps<typeof Text>) {
  const safe =
    typeof children === "string"
      ? fontSafe(children)
      : Array.isArray(children)
        ? children.map((c) => (typeof c === "string" ? fontSafe(c) : c))
        : children;
  return <Text {...props}>{safe}</Text>;
}
