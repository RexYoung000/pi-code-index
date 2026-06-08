/**
 * C/C++ 代码提取器（tree-sitter 版本）
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import { createContext, addNode, getNodeText } from "./base";
import { extractCalls, getName } from "./helpers";
import type { SymbolNode, SymbolEdge } from "../../types";
import type { ExtractionContext } from "./base";

export async function extractC(source: string, file: string, startNodeId: number, startEdgeId: number, langName: "c" | "cpp"): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage(langName === "cpp" ? "cpp" : "c");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  extractTranslationUnit(tree.rootNode, ctx);

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractTranslationUnit(node: Node, ctx: ExtractionContext): void {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    try {
      switch (child.type) {
        case "function_definition": {
          const declarator = child.childForFieldName("declarator");
          if (declarator) {
            const name = extractFunctionName(declarator, ctx);
            if (name) {
              const id = addNode(ctx, name, "function", child, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = ctx.file.endsWith(".cpp") || ctx.file.endsWith(".hpp") || ctx.file.endsWith(".cc") ? "cpp" : "c";
              const body = child.childForFieldName("body");
              if (body) extractCalls(body, ctx, id);
            }
          }
          break;
        }

        case "declaration": {
          // 可能是函数声明或结构体声明
          const declarator = child.childForFieldName("declarator");
          const type = child.childForFieldName("type");
          if (declarator && type && type.type === "struct_specifier") {
            // struct { ... } name;
            const name = extractFunctionName(declarator, ctx);
            if (name) {
              addNode(ctx, name, "class", child, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = ctx.file.includes(".cpp") || ctx.file.includes(".hpp") || ctx.file.includes(".cc") ? "cpp" : "c";
            }
          } else if (declarator) {
            // 函数声明（前向声明，不提取 body）
            const name = extractFunctionName(declarator, ctx);
            if (name) {
              addNode(ctx, name, "function", child, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = ctx.file.includes(".cpp") || ctx.file.includes(".hpp") || ctx.file.includes(".cc") ? "cpp" : "c";
            }
          }
          break;
        }

        case "struct_specifier": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            addNode(ctx, getNodeText(nameNode, ctx.source), "class", child, null, getNodeText(nameNode, ctx.source));
            ctx.nodes[ctx.nodes.length - 1].language = ctx.file.includes(".cpp") || ctx.file.includes(".hpp") || ctx.file.includes(".cc") ? "cpp" : "c";
          }
          break;
        }

        case "preproc_include":
          // 暂不处理
          break;

        default:
          extractTranslationUnit(child, ctx);
          break;
      }
    } catch {
      extractTranslationUnit(child, ctx);
    }
  }
}

function extractFunctionName(declarator: Node, ctx: ExtractionContext): string | null {
  if (declarator.type === "function_declarator") {
    const inner = declarator.childForFieldName("declarator");
    if (inner) return extractFunctionName(inner, ctx);
  }
  if (declarator.type === "pointer_declarator") {
    const inner = declarator.childForFieldName("declarator");
    if (inner) return extractFunctionName(inner, ctx);
  }
  if (declarator.type === "identifier" || declarator.type === "field_identifier") {
    return getNodeText(declarator, ctx.source);
  }
  const nameNode = declarator.childForFieldName("name");
  if (nameNode) {
    return getNodeText(nameNode, ctx.source);
  }
  return null;
}
