# Codex Usage

Use this skill directory as a generic Agent Skill. Before relying on it, make sure dependencies are installed in the package root:

```bash
npm install
```

Then run commands from the package root or adjust paths accordingly:

```bash
node skills/pi-code-index/scripts/codeindex.mjs status /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs context /path/to/project "task description" --json
```

For editing tasks, recommended Codex workflow:

1. Run `status`.
2. Run `init` if missing.
3. Run `context` with the user request.
4. Read returned files directly.
5. Run `impact` before changing central symbols.
