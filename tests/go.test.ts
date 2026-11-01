import assert from "node:assert/strict";
import test from "node:test";
import { extractGo } from "../src/engine/extraction/languages/go";

for (const receiver of ["g Greeter", "g *Greeter", "Greeter", "*Greeter", "g Greeter[T]", "g *Greeter[T]"]) {
  for (const typeFirst of [true, false]) {
    test(`Go receiver (${receiver}), type ${typeFirst ? "before" : "after"} method`, async () => {
      const declaration = receiver.includes("[T]")
        ? "type Greeter[T any] struct { name string }"
        : "type Greeter struct { name string }";
      const method = `func (${receiver}) Speak() string { return helper() }`;
      const source = `package sample\n${typeFirst ? declaration + "\n" + method : method + "\n" + declaration}\nfunc helper() string { return "hello" }`;
      const { nodes, edges } = await extractGo("sample.go", source, 10, 20);
      const owner = nodes.find(n => n.kind === "class" && n.name === "Greeter")!;
      const speak = nodes.find(n => n.kind === "method" && n.name === "Speak")!;
      assert.ok(owner);
      assert.ok(speak);
      assert.equal(speak.qualifiedName, "Greeter.Speak");
      assert.equal(speak.parentId, owner.id);
      assert.equal(speak.language, "go");
      assert.equal(nodes.filter(n => n.name === "Speak").length, 1);
      assert.ok(edges.some(e => e.fromId === speak.id && e.kind === "calls" && e.label === "helper"));
    });
  }
}

test("Go retains interfaces, functions and qualified methods without a local struct", async () => {
  const { nodes } = await extractGo("sample.go", `package sample
type Speaker interface { Speak() string }
func Standalone() {}
func (g Elsewhere) Speak() string { return "hello" }
`, 1, 1);
  assert.ok(nodes.some(n => n.name === "Speaker" && n.kind === "interface"));
  assert.ok(nodes.some(n => n.name === "Standalone" && n.kind === "function"));
  const method = nodes.find(n => n.kind === "method")!;
  assert.equal(method.qualifiedName, "Elsewhere.Speak");
  assert.equal(method.parentId, null);
});
