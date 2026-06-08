# pi-code-index

AI-powered local code index for Pi. It builds a local code knowledge graph so Pi can understand projects with fewer broad searches and fewer unnecessary file reads.

[中文说明](./README.zh-CN.md)

## Why

Vibecoding often starts with a natural-language request like:

> Add user authentication and make sure existing flows are not broken.

Without a code index, the AI usually has to explore the project by repeatedly using grep/read/find. `pi-code-index` gives Pi a local code map first, so the AI can:

- find relevant symbols faster
- inspect callers/callees before editing
- understand change impact with fewer exploratory tool calls
- keep the index updated while you work

All data stays local in `.codeindex/codeindex.db`.

## Supported languages

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++

## Quick start

Install or load this Pi package, then initialize the index in your project:

```text
/codeindex-init
```

After initialization, the extension starts a file watcher and keeps the index fresh while you edit.

## AI tool

The extension exposes a single compact tool to reduce tool-schema token overhead:

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

1. Open a project in Pi.
2. Run `/codeindex-init` once.
3. Ask Pi to implement or explain something.
4. Pi receives a lightweight code map before it starts, then can query the index during the task.
5. When files are edited, the watcher keeps the index up to date.

## Local files

The index is stored at:

```text
.codeindex/codeindex.db
```

To rebuild it:

```text
/codeindex-init
```

## Notes

This is an MVP focused on:

- multi-language symbol extraction
- full-text search with CamelCase fallback
- cross-file call resolution
- Pi extension integration
- file-watch incremental sync

