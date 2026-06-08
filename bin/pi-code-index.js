#!/usr/bin/env node
/**
 * Stable launcher: prefer the built CLI in dist/cli.mjs.
 * Falls back to TypeScript source via tsx only for local development.
 */
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const root = dirname(__dirname);
const builtCli = join(root, "dist", "cli.mjs");
const tsxBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "tsx.cmd")
  : join(root, "node_modules", ".bin", "tsx");

let command;
let args;

if (existsSync(builtCli)) {
  command = process.execPath;
  args = [builtCli, ...process.argv.slice(2)];
} else if (existsSync(tsxBin)) {
  command = tsxBin;
  args = [join(root, "src", "cli.ts"), ...process.argv.slice(2)];
  if (!process.env.PI_CODE_INDEX_SILENCE_FALLBACK_WARNING) {
    console.warn("[pi-code-index] dist/cli.mjs not found; using tsx source fallback. Run `npm run build` for the stable CLI.");
  }
} else {
  console.error("[pi-code-index] Cannot find dist/cli.mjs or local tsx fallback. Run `npm install && npm run build` in the package root.");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  cwd: process.cwd(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
