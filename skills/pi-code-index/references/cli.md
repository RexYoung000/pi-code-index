# CLI Reference

`<skill-dir>` below is the absolute path of the folder containing `SKILL.md` (the parent of `references/`). The scripts resolve the package root from their own location, so only the skill directory needs to be absolute. A path relative to the analyzed project will not resolve.

The generic CLI is exposed through:

```bash
node "<skill-dir>/scripts/codeindex.mjs" <action> <project> [args...] [options]
```

The package launcher is the same CLI, addressed from the package root:

```bash
node "<package-root>/bin/pi-code-index.js" <action> <project> [args...] [options]
```

A global npm install exposes `pi-code-index` on `PATH`; a local npm install exposes it under `node_modules/.bin`. Pi-managed installations do not guarantee either command is on your shell’s `PATH`; use the absolute skill script path.

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
