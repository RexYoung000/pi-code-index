#!/usr/bin/env node
/**
 * Fast MVP launcher: run the TypeScript CLI through tsx.
 * This keeps the package usable from source for generic Agent Skills.
 */
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const root = dirname(__dirname);
const tsxBin = process.platform === "win32"
  ? join(root, "node_modules", ".bin", "tsx.cmd")
  : join(root, "node_modules", ".bin", "tsx");

const result = spawnSync(tsxBin, [join(root, "src", "cli.ts"), ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
