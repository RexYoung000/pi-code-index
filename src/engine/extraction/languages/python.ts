/**
 * Python 代码提取器（tree-sitter 版本）
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import { createContext, addNode, getNodeText } from "./base";
import { findNodes, extractCalls, getName } from "./helpers";
import type { SymbolNode, SymbolEdge } from "../../types";
import type { ExtractionContext } from "./base";

export async function extractPython(
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage("python");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  try {
    extractModule(tree.rootNode, ctx, null);
  } finally {
    // gc
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractModule(
  node: Node,
  ctx: ExtractionContext,
  parentId: number | null
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      switch (child.type) {
        case "function_definition": {
          const name = getName(child, ctx);
          if (name && !name.startsWith("__")) {
            const id = addNode(ctx, name, parentId ? "method" : "function", child, parentId);
            ctx.nodes[ctx.nodes.length - 1].language = "python";

            const body = child.childForFieldName("body");
            if (body) extractCalls(body, ctx, id);
          }
          // 不递归进函数内部（函数内的嵌套函数单独处理）
          break;
        }

        case "class_definition": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "class", child, null);
            ctx.nodes[ctx.nodes.length - 1].language = "python";

            // 处理父类
            const superclasses = child.childForFieldName("superclasses");
            if (superclasses) {
              for (let j = 0; j < superclasses.childCount; j++) {
                const sup = superclasses.child(j);
                if (sup && sup.type === "identifier") {
                  ctx.edges.push({
                    id: ctx.nextEdgeId++,
                    fromId: id,
                    toId: -1,
                    kind: "extends",
                    file: ctx.file,
                    line: sup.startPosition.row + 1,
                  });
                }
              }
            }

            // 递归处理类的成员
            const body = child.childForFieldName("body");
            if (body) extractModule(body, ctx, id);
          }
          break;
        }

        case "decorated_definition": {
          // 展开装饰器，提取内部的函数/类
          extractModule(child, ctx, parentId);
          break;
        }

        default:
          // 递归到下一层
          extractModule(child, ctx, parentId);
          break;
      }
    } catch {
      extractModule(child, ctx, parentId);
    }
  }
}
