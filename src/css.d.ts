// Ambient declaration for side-effect CSS imports (e.g. `import "./styles.css"`)
// in TS/TSX modules. Next.js / Turbopack handles the actual bundling at build
// time; this just satisfies the editor's TypeScript language server so the
// import doesn't report "Cannot find module or type declarations".
declare module "*.css";
