/**
 * Java 代码提取器（tree-sitter 版本）
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import { createContext, addNode, getNodeText } from "./base";
import { extractCalls, getName } from "./helpers";
import type { SymbolNode, SymbolEdge } from "../../types";
import type { ExtractionContext } from "./base";

export async function extractJava(
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage("java");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  try {
    extractProgram(tree.rootNode, ctx, null);
  } finally {
    // gc
  }

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractProgram(node: Node, ctx: ExtractionContext, parentId: number | null): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      switch (child.type) {
        case "class_declaration": {
          const name = getName(child, ctx);
          if (!name) break;

          const id = addNode(ctx, name, "class", child, null, name);
          ctx.nodes[ctx.nodes.length - 1].language = "java";

          // extends
          const superclass = child.childForFieldName("superclass");
          if (superclass) {
            for (let j = 0; j < superclass.childCount; j++) {
              const sup = superclass.child(j);
              if (sup && sup.type === "type_identifier") {
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

          // implements
          const interfaces = child.childForFieldName("interfaces");
          if (interfaces) {
            for (let j = 0; j < interfaces.childCount; j++) {
              const iface = interfaces.child(j);
              if (iface && iface.type === "type_identifier") {
                ctx.edges.push({
                  id: ctx.nextEdgeId++,
                  fromId: id,
                  toId: -1,
                  kind: "implements",
                  file: ctx.file,
                  line: iface.startPosition.row + 1,
                });
              }
            }
          }

          // 递归处理类的 body
          const body = child.childForFieldName("body");
          if (body) {
            // 先收集内部类
            extractInnerDeclarations(body, ctx, id);
            // 再处理方法
            extractMethods(body, ctx, id, name);
          }
          break;
        }

        case "interface_declaration": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "interface", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "java";

            // 处理父接口
            const extendsClause = child.childForFieldName("superinterfaces");
            if (extendsClause) {
              for (let j = 0; j < extendsClause.childCount; j++) {
                const sup = extendsClause.child(j);
                if (sup && sup.type === "type_identifier") {
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

            const body = child.childForFieldName("body");
            if (body) extractMethods(body, ctx, id, name);
          }
          break;
        }

        case "enum_declaration": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "enum", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "java";

            const body = child.childForFieldName("body");
            if (body) extractMethods(body, ctx, id, name);
          }
          break;
        }

        default:
          extractProgram(child, ctx, parentId);
          break;
      }
    } catch {
      extractProgram(child, ctx, parentId);
    }
  }
}

/** 处理内部类声明 */
function extractInnerDeclarations(
  node: Node,
  ctx: ExtractionContext,
  parentId: number
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    if (
      child.type === "class_declaration" ||
      child.type === "interface_declaration" ||
      child.type === "enum_declaration"
    ) {
      extractProgram(child, ctx, parentId);
    }
  }
}

/** 处理方法声明 */
function extractMethods(
  node: Node,
  ctx: ExtractionContext,
  parentId: number,
  parentName: string
): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      if (child.type === "method_declaration") {
        const name = getName(child, ctx);
        if (name) {
          const qName = `${parentName}.${name}`;
          const id = addNode(ctx, name, "method", child, parentId, qName);
          ctx.nodes[ctx.nodes.length - 1].language = "java";

          const body = child.childForFieldName("body");
          if (body) extractCalls(body, ctx, id);
        }
      } else if (child.type === "constructor_declaration") {
        const nameNode = child.childForFieldName("name");
        const name = nameNode ? getNodeText(nameNode, ctx.source) : null;
        // 跳过构造函数（与类同名）
        if (name && name !== parentName) {
          const id = addNode(ctx, name, "method", child, parentId, `${parentName}.${name}`);
          ctx.nodes[ctx.nodes.length - 1].language = "java";
        }
      }
    } catch {
      // skip
    }
  }
}
