# Output Format

Use `--json` when the result will be consumed by another agent.

Successful JSON output starts with:

```json
{
  "ok": true,
  "message": "..."
}
```

Errors use:

```json
{
  "ok": false,
  "error": "..."
}
```

Action-specific payloads:

- `status`: `{ initialized, projectRoot, stats }`
- `search`: `{ query, results }`
- `context`: `{ task, result }`
- `callers`: `{ symbol, callers }`
- `callees`: `{ symbol, callees }`
- `impact`: `{ impact }`
- `explore`: `{ ids, result }`

Important: the index result should guide exploration. Agents should still read important source files before editing or making final claims.
