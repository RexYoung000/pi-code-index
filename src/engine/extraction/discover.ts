/**
 * 项目文件发现
 * 遍历项目目录，排除 .gitignore 中的文件和目录
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ignore from "ignore";
import { getLanguage } from "../types";

/** 默认排除的目录 */
const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  ".nuxt",
  "coverage",
  ".codeindex",
  ".codegraph",
];

/** 获取 .gitignore 规则 */
function loadGitignore(projectRoot: string): ReturnType<typeof ignore> {
  const ig = ignore();
  ig.add(DEFAULT_EXCLUDES.map((d) => `/${d}/`));
  ig.add(DEFAULT_EXCLUDES.map((d) => `/${d}`));

  try {
    const content = readFileSync(join(projectRoot, ".gitignore"), "utf-8");
    ig.add(content);
  } catch {
    // 无 .gitignore，使用默认规则
  }

  return ig;
}

/** 发现项目中所有可索引的源代码文件 */
export function discoverFiles(projectRoot: string): string[] {
  const ig = loadGitignore(projectRoot);
  const files: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(projectRoot, fullPath);

      if (ig.ignores(relativePath)) continue;

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && stat.size < 1_000_000) {
        if (getLanguage(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(projectRoot);
  return files;
}
