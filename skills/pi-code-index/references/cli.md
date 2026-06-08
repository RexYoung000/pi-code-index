# CLI Reference

The generic CLI is exposed through:

```bash
node bin/pi-code-index.js <action> <project> [args...] [options]
```

The skill wrapper is usually easier for agents:

```bash
node skills/pi-code-index/scripts/codeindex.mjs <action> <project> [args...] [options]
```

## Actions

- `init <project>`: initialize or rebuild `.codeindex/codeindex.db`
- `status <project>`: show index status and statistics
- `files <project> [--filter text]`: list indexed files
- `search <project> <query>`: search symbols by name/text
- `context <project> <task>`: build relevant context for a task
- `callers <project> <id|symbol>`: list callers
- `callees <project> <id|symbol>`: list callees
- `impact <project> <id|symbol>`: analyze impact radius
- `explore <project> <id,id,...>`: explore related symbols

## Options

- `--json`: machine-readable output
- `--limit <n>`: limit result count
- `--depth <n>`: graph traversal depth
- `--filter <text>`: filter file list
