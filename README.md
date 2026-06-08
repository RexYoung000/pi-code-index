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

First install dependencies in this package root:

```bash
npm install
```

Then run:

```bash
node skills/pi-code-index/scripts/codeindex.mjs status /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs search /path/to/project "CodeIndexEngine" --json
node skills/pi-code-index/scripts/codeindex.mjs context /path/to/project "add a reusable skill version" --json
node skills/pi-code-index/scripts/codeindex.mjs impact /path/to/project 12 --depth 2 --json
```

Semantic wrappers are also available:

```bash
node skills/pi-code-index/scripts/index-project.mjs /path/to/project
node skills/pi-code-index/scripts/search-code.mjs /path/to/project "CodeIndexEngine"
node skills/pi-code-index/scripts/build-context.mjs /path/to/project "add a reusable skill version"
node skills/pi-code-index/scripts/analyze-impact.mjs /path/to/project 12
```

## CLI

The package exposes a quick MVP CLI launcher:

```bash
node bin/pi-code-index.js <action> <project> [args...] [options]
```

If installed as a package, it can also be invoked as:

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
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project
```

## Notes

This is an MVP focused on:

- multi-language symbol extraction
- full-text search with CamelCase fallback
- cross-file call resolution
- Pi extension integration
- file-watch incremental sync in Pi
- generic Agent Skill scripts for Codex / Claude Code style workflows
