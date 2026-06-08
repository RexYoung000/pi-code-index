#!/usr/bin/env node
/** Cross-agent wrapper around the package CLI. */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = dirname(scriptDir);
const packageRoot = resolve(skillDir, "..", "..");
const bin = join(packageRoot, "bin", "pi-code-index.js");

if (!existsSync(bin)) {
  console.error(`Cannot find CLI launcher at ${bin}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
