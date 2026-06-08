/**
 * Go 代码提取器（tree-sitter 版本）
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import { createContext, addNode } from "./base";
import { extractCalls, getName } from "./helpers";
import type { SymbolNode, SymbolEdge } from "../../types";
import type { ExtractionContext } from "./base";

export async function extractGo(
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage("go");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  try {
    extractSourceFile(tree.rootNode, ctx);
  } finally {
    // gc
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractSourceFile(node: Node, ctx: ExtractionContext): void {
  let currentStructId: number | null = null;

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      switch (child.type) {
        case "function_declaration": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "function", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "go";

            const body = child.childForFieldName("body");
            if (body) extractCalls(body, ctx, id);
          }
          break;
        }

        case "method_declaration": {
          const name = getName(child, ctx);
          const receiver = child.childForFieldName("receiver");
          let qName = name ?? "";
          let parentId: number | null = null;

          if (receiver) {
            // 提取 receiver 类型名
            const typeNode = findTypeInReceiver(receiver, ctx);
            if (typeNode) {
              qName = `${typeNode}.${name}`;
              // 尝试找父 struct
              for (const n of ctx.nodes) {
                if (n.name === typeNode && n.kind === "class") {
                  parentId = n.id;
                  break;
                }
              }
            }
          }

          if (name) {
            const id = addNode(ctx, name, "method", child, parentId, qName);
            ctx.nodes[ctx.nodes.length - 1].language = "go";

            const body = child.childForFieldName("body");
            if (body) extractCalls(body, ctx, id);
          }
          break;
        }

        case "type_declaration": {
          for (let j = 0; j < child.childCount; j++) {
            const spec = child.child(j);
            if (!spec || spec.type !== "type_spec") continue;

            const typeChild = spec.childForFieldName("type");
            if (!typeChild) continue;

            const nameNode = spec.childForFieldName("name");
            const name = nameNode ? ctx.source.slice(nameNode.startIndex, nameNode.endIndex) : null;
            if (!name) continue;

            if (typeChild.type === "struct_type") {
              const id = addNode(ctx, name, "class", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
              currentStructId = id;
            } else if (typeChild.type === "interface_type") {
              const id = addNode(ctx, name, "interface", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
            }
          }
          break;
        }

        case "method_declaration":
          // 已经在上面处理了
          break;

        default:
          extractSourceFile(child, ctx);
          break;
      }
    } catch {
      extractSourceFile(child, ctx);
    }
  }
}

function findTypeInReceiver(node: Node, ctx: ExtractionContext): string | null {
  // receiver 结构: (name *Type) 或 (name Type) 或 (Type)
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "type_identifier") {
      return ctx.source.slice(child.startIndex, child.endIndex);
    }
    if (child.type === "pointer_type") {
      const inner = child.child(0);
      if (inner && inner.type === "type_identifier") {
        return ctx.source.slice(inner.startIndex, inner.endIndex);
      }
    }
  }
  return null;
}
