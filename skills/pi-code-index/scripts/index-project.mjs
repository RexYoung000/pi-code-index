#!/usr/bin/env node
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [join(scriptDir, "codeindex.mjs"), "init", ...process.argv.slice(2)], { stdio: "inherit", cwd: process.cwd() });
process.exit(result.status ?? 0);
