import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// Use a different working directory and a package path with spaces, as in agent installations.
test("skill wrapper indexes Go from another working directory through a spaced package path", () => {
  const scratch = mkdtempSync(join(tmpdir(), "codeindex-cli-"));
  try {
    const project = join(scratch, "Go project");
    const packageLink = join(scratch, "package with spaces");
    mkdirSync(project);
    symlinkSync(resolve("."), packageLink, "dir");
    writeFileSync(join(project, "sample.go"), `package sample
func (g *Greeter) Speak() string { return "hello" }
type Greeter struct { name string }
`);
    const wrapper = join(packageLink, "skills/pi-code-index/scripts/codeindex.mjs");
    const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [wrapper, ...args, "--json"], { cwd: scratch, encoding: "utf8" }));
    assert.equal(run("status", project).initialized, false);
    assert.equal(run("init", project).ok, true);
    const results = run("search", project, "Speak").results;
    const method = results.find((r: any) => r.node.kind === "method")?.node;
    assert.ok(method);
    assert.equal(method.qualifiedName, "Greeter.Speak");
    const owner = run("search", project, "Greeter").results.find((r: any) => r.node.kind === "class")?.node;
    assert.ok(owner);
    assert.equal(method.parentId, owner.id);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
