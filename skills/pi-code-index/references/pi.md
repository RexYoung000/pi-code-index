# Pi Usage

This package supports two Pi integration styles.

## Pi Extension

The existing Pi extension registers:

```text
/codeindex-init
codeindex
```

Use `/codeindex-init` once per project. The extension then keeps the index fresh with a file watcher and exposes the `codeindex` tool to the agent.

## Pi Skill

The package also declares this generic skill through `package.json`:

```json
{
  "pi": {
    "extensions": ["./src/index.ts"],
    "skills": ["./skills"]
  }
}
```

The skill is useful when the agent should follow a cross-agent workflow or when the extension is not loaded.
