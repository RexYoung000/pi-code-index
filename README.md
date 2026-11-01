# pi-code-index

AI-powered local code index for Pi and generic agent workflows. It builds a local code knowledge graph so AI coding assistants can understand projects with fewer broad searches and fewer unnecessary file reads.

[中文说明](./README.zh-CN.md)

## Why

Vibecoding often starts with a natural-language request like:

> Add user authentication and make sure existing flows are not broken.

Without a code index, the AI usually has to explore the project by repeatedly using grep/read/find. `pi-code-index` gives the agent a local code map first, so the AI can:

- find relevant symbols faster
- inspect callers/callees before editing
- understand change impact with fewer exploratory tool calls
- keep the index updated while you work in Pi

All data stays local in `.codeindex/codeindex.db`.

## Supported languages

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++

## Pi extension quick start

Install or load this Pi package, then initialize the index in your project:

```text
/codeindex-init
```

After initialization, the extension starts a file watcher and keeps the index fresh while you edit.

## Generic Agent Skill quick start

This project also ships a cross-agent skill at:

```text
skills/pi-code-index/
```

Agents such as Codex, Claude Code, or other tools that understand Agent Skills can load that directory and run the included scripts.

First install dependencies and build the stable CLI in this package root:

```bash
npm install
npm run build
```

Then run the commands below. Replace `<skill-dir>` with the absolute path of `skills/pi-code-index` in this repository — the scripts locate the package root from their own location, so use an absolute path to run these commands from any working directory:

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

## CLI

The package exposes a stable CLI launcher. Replace `<package-root>` with the absolute path of the package installation:

```bash
node "<package-root>/bin/pi-code-index.js" <action> <project> [args...] [options]
```

The launcher uses the built CLI at `dist/cli.mjs`. For local development only, it can fall back to `tsx src/cli.ts` if `dist/cli.mjs` is missing.

A global npm install exposes the command below on `PATH`; local installs expose it under `node_modules/.bin`. For Pi-managed installations, use the absolute skill script path above:

```bash
pi-code-index <action> <project> [args...] [options]
```

Actions:

| Action | Purpose |
|---|---|
| `init` | Initialize or rebuild the index |
| `status` | Show index health and statistics |
| `files` | List indexed files |
| `search` | Search symbols by name/text |
| `context` | Build relevant code context for a task |
| `callers` | Find what calls a symbol |
| `callees` | Find what a symbol calls |
| `impact` | Analyze the impact radius of a symbol change |
| `explore` | Explore related symbols and files |

Use `--json` for machine-readable output.

## Pi AI tool

The Pi extension exposes a single compact tool to reduce tool-schema token overhead:

```text
codeindex
```

Use the `action` parameter:

| Action | Purpose |
|---|---|
| `init` | Initialize or rebuild the index |
| `search` | Search symbols by name |
| `context` | Build relevant code context for a task |
| `callers` | Find what calls a symbol |
| `callees` | Find what a symbol calls |
| `impact` | Analyze the impact radius of a symbol change |
| `explore` | Explore related symbols and files |
| `status` | Show index health and statistics |
| `files` | List indexed files |

Example intent for the AI:

```text
Use codeindex with action=context before broadly grepping the repository.
Use action=impact before modifying core symbols.
```

## User workflow

1. Open a project in Pi or point a generic agent at a project path.
2. Initialize the index once.
3. Ask the agent to implement or explain something.
4. The agent uses the code map to find relevant files and symbols.
5. The agent still reads important files directly before editing.
6. In Pi, the watcher keeps the index up to date after file edits.

## Local files

The index is stored at:

```text
.codeindex/codeindex.db
```

To rebuild it in Pi:

```text
/codeindex-init
```

To rebuild it from a generic agent script:

```bash
node "<skill-dir>/scripts/codeindex.mjs" init /path/to/project
```

## Notes

This is focused on:

- multi-language symbol extraction
- full-text search with CamelCase fallback
- cross-file call resolution
- Pi extension integration
- file-watch incremental sync in Pi
- generic Agent Skill scripts for Codex / Claude Code style workflows
- stable built CLI for cross-agent usage
