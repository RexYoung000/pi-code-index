#!/usr/bin/env node
/**
 * 通用 CLI 入口。
 * 目标：让 Pi 之外的 Agent（Codex / Claude Code 等）也能通过 shell 调用代码索引能力。
 */

import { resolve } from "node:path";
import { CodeIndexEngine, isInitialized, loadEngine } from "./engine/index";

interface CliOptions {
  json: boolean;
  limit?: number;
  depth?: number;
  filter?: string;
}

type OutputPayload = Record<string, unknown>;

function printHelp() {
  console.log(`pi-code-index — local code knowledge graph for agent workflows

Usage:
  pi-code-index <action> <project> [args...] [options]

Actions:
  init <project>                         Initialize or rebuild the index
  status <project>                       Show index health and statistics
  files <project> [--filter text]        List indexed files
  search <project> <query>               Search symbols by name or text
  context <project> <task>               Build relevant code context for a task
  callers <project> <id|symbol>          Find callers of a symbol
  callees <project> <id|symbol>          Find callees of a symbol
  impact <project> <id|symbol>           Analyze change impact radius
  explore <project> <id,id,...>          Explore related symbols and files

Options:
  --json                                 Print machine-readable JSON
  --limit <n>                            Limit result count
  --depth <n>                            Graph traversal depth
  --filter <text>                        Filter files
  -h, --help                             Show this help

Examples:
  pi-code-index init .
  pi-code-index search . "CodeIndexEngine" --json
  pi-code-index context . "make this project usable as a skill"
  pi-code-index impact . 12 --depth 2 --json
`);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: CliOptions = { json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--limit") {
      options.limit = Number(argv[++i]);
    } else if (arg === "--depth") {
      options.depth = Number(argv[++i]);
    } else if (arg === "--filter") {
      options.filter = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      positional.push("help");
    } else {
      positional.push(arg);
    }
  }

  return { positional, options };
}

function isNumeric(value: string) {
  return /^\d+$/.test(value);
}

function output(options: CliOptions, text: string, payload: OutputPayload = {}) {
  if (options.json) {
    console.log(JSON.stringify({ ok: true, message: text, ...payload }, null, 2));
  } else {
    console.log(text);
  }
}

function fail(options: CliOptions, message: string, exitCode = 1): never {
  if (options.json) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(exitCode);
}

async function openRequiredEngine(projectRoot: string, options: CliOptions) {
  const engine = await loadEngine(projectRoot);
  if (!engine) {
    fail(options, `Index not initialized at ${projectRoot}. Run: pi-code-index init ${projectRoot}`);
  }
  return engine;
}

async function rebuild(projectRoot: string, options: CliOptions) {
  const engine = new CodeIndexEngine(projectRoot);
  await engine.init();
  await engine.indexAll({
    onProgress: (progress) => {
      if (!options.json) {
        process.stderr.write(`\r${progress.phase}: ${progress.current}/${progress.total}`);
      }
    },
  });
  if (!options.json) process.stderr.write("\n");
  const stats = engine.getStats();
  engine.close();
  output(options, `Index ready: ${stats.totalFiles} files, ${stats.totalNodes} symbols, ${stats.totalEdges} relations.`, { stats });
}

function resolveFirstNode(engine: CodeIndexEngine, symbolOrId: string, options: CliOptions) {
  if (isNumeric(symbolOrId)) {
    const node = engine.getNode(Number(symbolOrId));
    if (!node) fail(options, `Symbol id not found: ${symbolOrId}`);
    return node;
  }

  const matches = engine.getNodeByName(symbolOrId);
  if (matches.length === 0) fail(options, `Symbol not found: ${symbolOrId}. Try search first.`);
  return matches[0];
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [action, projectArg, ...rest] = positional;

  if (!action || action === "help") {
    printHelp();
    return;
  }
  if (!projectArg) fail(options, "Missing <project>. Run pi-code-index --help for usage.");

  const projectRoot = resolve(projectArg);

  if (action === "init") {
    await rebuild(projectRoot, options);
    return;
  }

  if (action === "status" && !isInitialized(projectRoot)) {
    output(options, `Index not initialized at ${projectRoot}.`, { initialized: false, projectRoot });
    return;
  }

  const engine = await openRequiredEngine(projectRoot, options);

  try {
    if (action === "status") {
      const stats = engine.getStats();
      output(options, `Index status: ${stats.totalFiles} files, ${stats.totalNodes} symbols, ${stats.totalEdges} relations.`, {
        initialized: true,
        projectRoot,
        stats,
      });
      return;
    }

    if (action === "files") {
      const fileFilter = options.filter ?? (rest.join(" ") || undefined);
      const files = engine.getFiles({ filter: fileFilter });
      output(options, files.map((f) => `- ${f.path} (${f.language}, ${f.nodes} symbols)`).join("\n") || "No files.", { files });
      return;
    }

    if (action === "search") {
      const query = rest.join(" ").trim();
      if (!query) fail(options, "Missing search query.");
      const results = engine.search(query, { limit: options.limit ?? 20 });
      output(options, results.map((r) => `[${r.node.id}] ${r.node.name} (${r.node.kind}) — ${r.node.file}:${r.node.line}`).join("\n") || "No results.", {
        query,
        results,
      });
      return;
    }

    if (action === "context") {
      const task = rest.join(" ").trim();
      if (!task) fail(options, "Missing task text.");
      const result = engine.buildContext(task, { maxNodes: options.limit ?? 10, maxFiles: 5 });
      output(
        options,
        [
          `Relevant symbols: ${result.symbols.length}`,
          ...result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) — ${s.file}:${s.startLine}`),
          "",
          `Files: ${result.files.length}`,
          ...result.files.map((f) => `- ${f}`),
        ].join("\n"),
        { task, result }
      );
      return;
    }

    if (action === "callers" || action === "callees" || action === "impact") {
      const target = rest.join(" ").trim();
      if (!target) fail(options, `Missing symbol id or name for ${action}.`);
      const node = resolveFirstNode(engine, target, options);

      if (action === "callers") {
        const callers = engine.getCallers(node.id, options.limit ?? 20);
        output(options, callers.map((c) => `[${c.id}] ${c.name} — ${c.file}:${c.line}`).join("\n") || "No callers.", { symbol: node, callers });
        return;
      }

      if (action === "callees") {
        const callees = engine.getCallees(node.id, options.limit ?? 20);
        output(options, callees.map((c) => `[${c.id}] ${c.name} — ${c.file}:${c.line}`).join("\n") || "No callees.", { symbol: node, callees });
        return;
      }

      const impact = engine.getImpactRadius(node.id, options.depth ?? 2);
      output(
        options,
        [`${impact.symbol.name} impact`, `Callers: ${impact.callers.length}`, `Callees: ${impact.callees.length}`, `Affected: ${impact.affected.length}`].join("\n"),
        { impact }
      );
      return;
    }

    if (action === "explore") {
      const ids = rest.join(" ").split(",").map((id) => Number(id.trim())).filter((id) => Number.isFinite(id));
      if (ids.length === 0) fail(options, "Missing ids. Example: pi-code-index explore . 1,2,3");
      const result = engine.explore(ids, { maxDepth: options.depth ?? 2, maxNodes: options.limit ?? 20 });
      output(options, result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) — ${s.file}:${s.startLine}-${s.endLine}`).join("\n") || "No results.", { ids, result });
      return;
    }

    fail(options, `Unknown action: ${action}`);
  } finally {
    engine.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
