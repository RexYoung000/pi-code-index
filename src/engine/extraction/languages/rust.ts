/**
 * Rust 代码提取器（tree-sitter 版本）
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import { createContext, addNode, getNodeText } from "./base";
import { extractCalls, getName } from "./helpers";
import type { SymbolNode, SymbolEdge } from "../../types";
import type { ExtractionContext } from "./base";

export async function extractRust(
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage("rust");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  try {
    extractModule(tree.rootNode, ctx, null);
  } finally {
    // gc
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractModule(node: Node, ctx: ExtractionContext, currentImpl: { type: string } | null): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      switch (child.type) {
        case "function_item": {
          const name = getName(child, ctx);
          if (name) {
            const kind = currentImpl ? "method" : "function";
            const parentId = currentImpl
              ? findStructId(ctx, currentImpl.type)
              : null;
            const qName = currentImpl
              ? `${currentImpl.type}::${name}`
              : name;

            const id = addNode(ctx, name, kind, child, parentId, qName);
            ctx.nodes[ctx.nodes.length - 1].language = "rust";

            const body = child.childForFieldName("body");
            if (body) extractCalls(body, ctx, id);
          }
          break;
        }

        case "struct_item": {
          const name = getName(child, ctx);
          if (name) {
            addNode(ctx, name, "class", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "rust";
          }
          break;
        }

        case "enum_item": {
          const name = getName(child, ctx);
          if (name) {
            addNode(ctx, name, "enum", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "rust";
          }
          break;
        }

        case "trait_item": {
          const name = getName(child, ctx);
          if (name) {
            addNode(ctx, name, "interface", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "rust";
          }
          break;
        }

        case "impl_item": {
          const typeNode = child.childForFieldName("type");
          let traitNode = child.childForFieldName("trait");

          const typeName = typeNode ? getNodeText(typeNode, ctx.source) : null;
          if (typeName) {
            const traitName = traitNode ? getNodeText(traitNode, ctx.source) : null;
            const implType = traitName || typeName;

            // 处理 trait 的继承关系
            if (traitName) {
              const structNode = findStructId(ctx, typeName);
              const traitNode = findTraitId(ctx, traitName);
              if (structNode) {
                ctx.edges.push({
                  id: ctx.nextEdgeId++,
                  fromId: structNode,
                  toId: traitNode ?? -1,
                  kind: "implements",
                  file: ctx.file,
                  line: child.startPosition.row + 1,
                });
              }
            }

            // 递归处理 impl 内的函数
            extractModule(child, ctx, { type: typeName });
          }
          break;
        }

        default:
          extractModule(child, ctx, currentImpl);
          break;
      }
    } catch {
      extractModule(child, ctx, currentImpl);
    }
  }
}

function findStructId(ctx: ExtractionContext, name: string): number | null {
  for (const n of ctx.nodes) {
    if (n.name === name && n.kind === "class") return n.id;
  }
  return null;
}

function findTraitId(ctx: ExtractionContext, name: string): number | null {
  for (const n of ctx.nodes) {
    if (n.name === name && n.kind === "interface") return n.id;
  }
  return null;
}
