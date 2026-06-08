---
name: pi-code-index
description: Indexes and searches local codebases for agent workflows. Use when an agent needs to understand project structure, locate symbols, trace callers/callees, build implementation context, or analyze change impact before editing code.
license: MIT
compatibility: Requires Node.js 20+. For stable usage, run npm install and npm run build in the package root once.
---

# Pi Code Index

Use this skill before broad code exploration or risky edits. It gives agents a local code knowledge graph stored in `.codeindex/codeindex.db`.

This skill is intentionally cross-agent: Pi can load it as a package skill, while Codex, Claude Code, and other agents can run the scripts directly from this directory. The scripts call the stable built CLI at `dist/cli.mjs` when available, with a development fallback to TypeScript source.

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
   node skills/pi-code-index/scripts/codeindex.mjs status /path/to/project --json
   ```
3. If the index is missing or stale, initialize it:
   ```bash
   node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project --json
   ```
4. Build task context before editing:
   ```bash
   node skills/pi-code-index/scripts/codeindex.mjs context /path/to/project "user task" --json
   ```
5. Search or explore returned symbols as needed.
6. Read the important source files before drawing conclusions or making edits. The index is a map, not a replacement for source reading.
7. Before changing a central symbol, run impact analysis.

## Common commands

From the package root:

```bash
node skills/pi-code-index/scripts/codeindex.mjs status .
node skills/pi-code-index/scripts/codeindex.mjs init .
node skills/pi-code-index/scripts/codeindex.mjs search . "CodeIndexEngine" --json
node skills/pi-code-index/scripts/codeindex.mjs context . "add a reusable skill version" --json
node skills/pi-code-index/scripts/codeindex.mjs impact . 12 --depth 2 --json
```

Semantic wrappers are also available:

```bash
node skills/pi-code-index/scripts/index-project.mjs .
node skills/pi-code-index/scripts/search-code.mjs . "CodeIndexEngine"
node skills/pi-code-index/scripts/build-context.mjs . "add a reusable skill version"
node skills/pi-code-index/scripts/analyze-impact.mjs . 12
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
