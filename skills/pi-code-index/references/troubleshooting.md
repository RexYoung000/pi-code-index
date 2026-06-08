# Troubleshooting

## Stable CLI missing

For stable cross-agent usage, build the CLI once in the package root:

```bash
npm install
npm run build
```

The launcher prefers:

```text
dist/cli.mjs
```

If `dist/cli.mjs` is missing but local `tsx` exists, it falls back to TypeScript source for development and prints a warning.

## `tsx` not found during fallback

This only matters when `dist/cli.mjs` has not been built. Run:

```bash
npm install
npm run build
```

## Index missing

Run:

```bash
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project
```

## Empty results

Possible causes:

- unsupported language or file extension
- index is stale; rebuild with `init`
- query is too broad or too specific
- symbol is generated dynamically and not visible to static extraction
