---
name: pi-code-index
description: Indexes and searches local codebases for agent workflows. Use when an agent needs to understand project structure, locate symbols, trace callers/callees, build implementation context, or analyze change impact before editing code.
license: MIT
compatibility: Requires Node.js 20+. npm packages include the built CLI. Source checkouts require npm install and npm run build in the package root.
---

# Pi Code Index

Use this skill before broad code exploration or risky edits. It gives agents a local code knowledge graph stored in `.codeindex/codeindex.db`.

This skill is intentionally cross-agent: Pi can load it as a package skill, while Codex, Claude Code, and other agents can run the scripts directly from this directory. The scripts call the stable built CLI at `dist/cli.mjs` when available, with a development fallback to TypeScript source.

## Locate the CLI first

Every CLI example below uses `<skill-dir>`. Replace it with the **absolute path of the folder containing this file** — the agent always knows it, because it just read this file from disk. The scripts locate the package root from their own location, so `<skill-dir>` is the only part that must be absolute.

Do not run these commands with a path relative to the project being analyzed. `skills/pi-code-index/scripts/codeindex.mjs` only resolves when the working directory happens to be the package root, and fails with `Cannot find module` everywhere else.

```bash
node "<skill-dir>/scripts/codeindex.mjs" status /path/to/project --json
```

In Pi, when the extension is loaded, prefer its native tool: run `/codeindex-init` once per project, then use the `codeindex` tool with `action` for every subsequent query. The CLI is the fallback for other agents and for scripted use.

## When to use

Use this skill when the user asks you to:

- understand a codebase or feature implementation
- find relevant files, symbols, functions, classes, methods, or routes
- trace callers/callees before making a change
- estimate change impact before editing core logic
- gather code context without repeatedly doing broad grep/read/find exploration

## Recommended workflow

1. Identify the target project root.
2. Check index status:
   ```bash
   node "<skill-dir>/scripts/codeindex.mjs" status /path/to/project --json
   ```
3. If the index is missing or stale, initialize it:
   ```bash
   node "<skill-dir>/scripts/codeindex.mjs" init /path/to/project --json
   ```
4. Build task context before editing:
   ```bash
   node "<skill-dir>/scripts/codeindex.mjs" context /path/to/project "user task" --json
   ```
5. Search or explore returned symbols as needed.
6. Read the important source files before drawing conclusions or making edits. The index is a map, not a replacement for source reading.
7. Before changing a central symbol, run impact analysis.

## Common commands

`<skill-dir>` is the absolute path of this skill folder. It is the same on every command below.

```bash
node "<skill-dir>/scripts/codeindex.mjs" status /path/to/project --json
node "<skill-dir>/scripts/codeindex.mjs" init /path/to/project --json
node "<skill-dir>/scripts/codeindex.mjs" search /path/to/project "CodeIndexEngine" --json
node "<skill-dir>/scripts/codeindex.mjs" context /path/to/project "add a reusable skill version" --json
node "<skill-dir>/scripts/codeindex.mjs" impact /path/to/project 12 --depth 2 --json
```

Semantic wrappers are also available:

```bash
node "<skill-dir>/scripts/index-project.mjs" /path/to/project
node "<skill-dir>/scripts/search-code.mjs" /path/to/project "CodeIndexEngine"
node "<skill-dir>/scripts/build-context.mjs" /path/to/project "add a reusable skill version"
node "<skill-dir>/scripts/analyze-impact.mjs" /path/to/project 12
```

## Output guidance

When responding to the user after using this skill, include:

- relevant files and symbols
- why each file matters
- any callers/callees or impact findings when relevant
- which files you still read directly to verify the index result
- confidence level and suggested next step

Prefer `--json` when another agent needs to consume the output programmatically.

## References

- CLI details: `references/cli.md`
- JSON/output format: `references/output-format.md`
- Codex usage: `references/codex.md`
- Pi usage: `references/pi.md`
