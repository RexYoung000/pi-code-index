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
    // Go 允许方法先于类型声明；收集完同文件符号后再补全归属。
    for (const method of ctx.nodes) {
      if (method.kind !== "method" || !method.qualifiedName) continue;
      const receiverName = method.qualifiedName.slice(0, method.qualifiedName.lastIndexOf("."));
      method.parentId = ctx.nodes.find(n => n.kind === "class" && n.name === receiverName)?.id ?? null;
    }
    // 数据库立即检查 parent_id 外键，父类型必须先于方法写入。
    ctx.nodes.sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null));
  } finally {
    // gc
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractSourceFile(node: Node, ctx: ExtractionContext): void {
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

          if (receiver) {
            // 提取 receiver 类型名
            const typeNode = findTypeInReceiver(receiver, ctx);
            if (typeNode) {
              qName = `${typeNode}.${name}`;
            }
          }

          if (name) {
            const id = addNode(ctx, name, "method", child, null, qName);
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
              addNode(ctx, name, "class", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
            } else if (typeChild.type === "interface_type") {
              const id = addNode(ctx, name, "interface", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
            }
          }
          break;
        }

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
  const parameter = node.namedChildren.find(child => child?.type === "parameter_declaration");
  let type = parameter?.childForFieldName("type");
  if (type?.type === "pointer_type") type = type.namedChild(0);
  if (type?.type === "generic_type") type = type.childForFieldName("type");
  return type?.type === "type_identifier" ? ctx.source.slice(type.startIndex, type.endIndex) : null;
}
