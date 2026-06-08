# Troubleshooting

## `tsx` not found

Run dependencies installation in the package root:

```bash
npm install
```

This MVP launcher runs TypeScript source through the local `tsx` dev dependency.

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
