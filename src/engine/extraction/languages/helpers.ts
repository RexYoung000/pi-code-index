/**
 * tree-sitter 通用提取辅助
 * 提供 AST 遍历、节点匹配、调用提取等通用逻辑
 */

import type { Node } from "web-tree-sitter";
import { getNodeText } from "./base";
import type { SymbolNode, SymbolEdge, EdgeKind } from "../../types";
import type { ExtractionContext } from "./base";
import { addNode } from "./base";

/**
 * 遍历 AST 中所有匹配类型的子节点（浅层，不递归到同名节点内）
 */
export function* findNodes(
  node: Node,
  targetTypes: string[],
  skipTypes: string[] = []
): Generator<Node> {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (targetTypes.includes(child.type)) {
      yield child;
    } else if (!skipTypes.includes(child.type)) {
      // 递归但跳过某些类型（避免重复进入函数/类内部）
      yield* findNodes(child, targetTypes, skipTypes);
    }
  }
}

/**
 * 从 AST 中提取所有函数调用
 */
export function extractCalls(
  node: Node,
  ctx: ExtractionContext,
  callerId: number
): void {
  const stack: Node[] = [node];
  const builtins = new Set([
    "print", "len", "range", "type", "int", "str", "float", "bool", "list",
    "dict", "set", "tuple", "enumerate", "zip", "map", "filter", "sorted",
    "open", "isinstance", "hasattr", "getattr", "setattr",
    "super", "self", "cls",
    "fmt", "log", "os", "io", "http", "json", "context",
    "Printf", "Println", "Sprintf", "Errorf", "Fprintf",
    "println", "panic", "recover", "make", "new", "append", "copy", "delete", "close",
    "System", "out", "println", "print", "printf",
    "console", "log", "error", "warn", "info",
    "require", "import",
    "true", "false", "nil", "null", "None",
  ]);

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === "call_expression" || current.type === "call") {
      const funcNode = current.childForFieldName("function");
      if (funcNode) {
        let callName = "";
        // 处理 attribute 调用 (obj.method)
        if (funcNode.type === "attribute" || funcNode.type === "field_expression") {
          const obj = funcNode.childForFieldName("object");
          const attr = funcNode.childForFieldName("attribute") || funcNode.childForFieldName("field");
          if (attr) {
            callName = getNodeText(attr, ctx.source);
          }
        } else {
          callName = getNodeText(funcNode, ctx.source);
        }

        // 清理调用名
        callName = callName.replace(/[^a-zA-Z0-9_]/g, "");
        
        if (callName && !builtins.has(callName) && callName.length > 0) {
          ctx.edges.push({
            id: ctx.nextEdgeId++,
            fromId: callerId,
            toId: -1,
            kind: "calls",
            file: ctx.file,
            line: current.startPosition.row + 1,
            label: callName,
          });
        }
      }
    }
    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i);
      if (child) stack.push(child);
    }
  }
}

/**
 * 获取节点的名字段
 */
export function getName(node: Node, ctx: ExtractionContext): string | null {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return getNodeText(nameNode, ctx.source);
  return null;
}
