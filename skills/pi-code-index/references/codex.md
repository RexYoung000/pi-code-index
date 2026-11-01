# Codex Usage

Use this skill directory as a generic Agent Skill. Before relying on it, make sure dependencies are installed and the stable CLI is built in the package root:

```bash
npm install
npm run build
```

Then run commands from any directory, using the absolute path of this skill folder:

```bash
node "<skill-dir>/scripts/codeindex.mjs" status /path/to/project --json
node "<skill-dir>/scripts/codeindex.mjs" init /path/to/project --json
node "<skill-dir>/scripts/codeindex.mjs" context /path/to/project "task description" --json
```

`<skill-dir>` is the folder containing `SKILL.md`, one level above this `references/` directory. Using a path relative to the target project fails with `Cannot find module`.

For editing tasks, recommended Codex workflow:

1. Run `status`.
2. Run `init` if missing.
3. Run `context` with the user request.
4. Read returned files directly.
5. Run `impact` before changing central symbols.
