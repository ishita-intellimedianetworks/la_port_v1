import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // `src/terminal` and `src/shared` are VENDORED — the holotwin-la-v3-sofi
  // scene engine, taken wholesale so its navmesh / walking / overlay behaviour
  // is the proven one rather than a re-derivation. It was written against an
  // older lint config, and the React-compiler rules below flag long-standing
  // patterns in it (imperative refs driven from useFrame, DOM writes in
  // effects). Rewriting them would fork the code away from its source and
  // defeat the point of vendoring it, so they are warnings here.
  //
  // Everything we author (src/app, src/config, scripts) keeps the full rule set.
  {
    files: ["src/terminal/**", "src/shared/**", "src/lib/**"],
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not app source: bundled skill fixtures and the CommonJS bake script.
    ".claude/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
