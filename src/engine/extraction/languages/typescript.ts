/**
 * TypeScript / JavaScript 提取器
 * 提取函数、类、方法、接口、类型别名和它们的调用/导入/继承关系
 */

import type { Node } from "web-tree-sitter";
import { loadLanguage, parseSource } from "../tree-sitter";
import {
  createContext,
  addNode,
  addEdge,
  extractCallName,
  getNodeText,
  type ExtractionContext,
} from "./base";
import type { SymbolNode, SymbolEdge, EdgeKind } from "../../types";

export async function extractTypeScript(
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = await loadLanguage("typescript");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);

  // 标记语言
  const setLang = (n: SymbolNode) => {
    n.language = file.endsWith(".ts") || file.endsWith(".tsx") ? "typescript" : "javascript";
  };

  try {
    extractFromNode(tree.rootNode, ctx, null, setLang);
  } finally {
    // tree-sitter 不需要手动释放 tree，gc 会处理
  }

  // 解析调用关系
  resolveCalls(ctx);

  return { nodes: ctx.nodes, edges: ctx.edges };
}

function extractFromNode(
  node: Node,
  ctx: ExtractionContext,
  parentId: number | null,
  setLang: (n: SymbolNode) => void
): void {
  // 遍历所有子节点
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;

    const type = child.type;

    try {
      switch (type) {
        // ── 函数声明 ──
        case "function_declaration": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const name = getNodeText(nameNode, ctx.source);
            const id = addNode(ctx, name, "function", child, parentId);
            setLang(ctx.nodes[ctx.nodes.length - 1]);

            // 提取函数体内的调用
            const body = child.childForFieldName("body");
            if (body) extractCallsFromNode(body, id, ctx);

            // 递归处理嵌套函数
            extractFromNode(child, ctx, id, setLang);
          }
          break;
        }

        // ── 箭头函数 / 函数表达式（含变量声明） ──
        case "variable_declaration": {
          extractVariableDecl(child, ctx, parentId, setLang);
          break;
        }

        // ── 类声明 ──
        case "class_declaration": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const name = getNodeText(nameNode, ctx.source);
            const id = addNode(ctx, name, "class", child, parentId);
            setLang(ctx.nodes[ctx.nodes.length - 1]);

            // extends
            const extendsClause = child.childForFieldName("extends");
            if (extendsClause) {
              const extendsName = getNodeText(extendsClause, ctx.source);
              // 记录继承关系（后续解析时连接）
              recordUnresolvedEdge(ctx, id, extendsName, "extends", extendsClause);
            }

            // 处理类成员
            const body = child.childForFieldName("body");
            if (body) {
              for (let j = 0; j < body.childCount; j++) {
                const member = body.child(j);
                if (!member) continue;

                switch (member.type) {
                  case "method_definition": {
                    const mName = member.childForFieldName("name");
                    if (mName) {
                      const mId = addNode(
                        ctx,
                        getNodeText(mName, ctx.source),
                        "method",
                        member,
                        id,
                        `${name}.${getNodeText(mName, ctx.source)}`
                      );
                      setLang(ctx.nodes[ctx.nodes.length - 1]);

                      const mBody = member.childForFieldName("body");
                      if (mBody) extractCallsFromNode(mBody, mId, ctx);
                    }
                    break;
                  }
                  case "public_field_definition": {
                    // 类属性（箭头函数赋值）
                    const fieldName = member.childForFieldName("name");
                    const value = member.childForFieldName("value");
                    if (fieldName && value && value.type === "arrow_function") {
                      const fId = addNode(
                        ctx,
                        getNodeText(fieldName, ctx.source),
                        "method",
                        member,
                        id,
                        `${name}.${getNodeText(fieldName, ctx.source)}`
                      );
                      setLang(ctx.nodes[ctx.nodes.length - 1]);

                      const fBody = value.childForFieldName("body");
                      if (fBody) extractCallsFromNode(fBody, fId, ctx);
                    }
                    break;
                  }
                }
              }
            }
          }
          break;
        }

        // ── 接口声明 ──
        case "interface_declaration": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const id = addNode(ctx, getNodeText(nameNode, ctx.source), "interface", child, parentId);
            setLang(ctx.nodes[ctx.nodes.length - 1]);
          }
          break;
        }

        // ── 类型别名 ──
        case "type_alias_declaration": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const id = addNode(ctx, getNodeText(nameNode, ctx.source), "type_alias", child, parentId);
            setLang(ctx.nodes[ctx.nodes.length - 1]);
          }
          break;
        }

        // ── 枚举声明 ──
        case "enum_declaration": {
          const nameNode = child.childForFieldName("name");
          if (nameNode) {
            const id = addNode(ctx, getNodeText(nameNode, ctx.source), "enum", child, parentId);
            setLang(ctx.nodes[ctx.nodes.length - 1]);
          }
          break;
        }

        // ── 递归处理其他可能包含声明的节点 ──
        default:
          extractFromNode(child, ctx, parentId, setLang);
          break;
      }
    } catch {
      // 解析失败时不中断整个提取
      extractFromNode(child, ctx, parentId, setLang);
    }
  }
}

/** 提取变量声明中的函数 */
function extractVariableDecl(
  node: Node,
  ctx: ExtractionContext,
  parentId: number | null,
  setLang: (n: SymbolNode) => void
): void {
  for (let i = 0; i < node.childCount; i++) {
    const declarator = node.child(i);
    if (declarator?.type !== "variable_declarator") continue;

    const nameNode = declarator.childForFieldName("name");
    const valueNode = declarator.childForFieldName("value");
    if (!nameNode || !valueNode) continue;

    const name = getNodeText(nameNode, ctx.source);

    // 箭头函数 / 函数表达式
    if (valueNode.type === "arrow_function" || valueNode.type === "function_expression") {
      const id = addNode(ctx, name, "function", declarator, parentId);
      setLang(ctx.nodes[ctx.nodes.length - 1]);

      // 提取调用
      const body = valueNode.childForFieldName("body");
      if (body) extractCallsFromNode(body, id, ctx);
    }
  }
}

// ═══════════════════════════════════════════
//  调用提取
// ═══════════════════════════════════════════

/** 未解析的边 */
interface UnresolvedEdge {
  fromId: number;
  toName: string;
  kind: EdgeKind;
  line: number;
}

const unresolvedEdges: Map<string, UnresolvedEdge[]> = new Map();

function recordUnresolvedEdge(
  ctx: ExtractionContext,
  fromId: number,
  toName: string,
  kind: EdgeKind,
  node: Node
): void {
  const edges = unresolvedEdges.get(ctx.file) || [];
  edges.push({
    fromId,
    toName,
    kind,
    line: node.startPosition.row + 1,
  });
  unresolvedEdges.set(ctx.file, edges);
}

/** 从 AST 节点中提取所有函数调用 */
function extractCallsFromNode(
  node: Node,
  callerId: number,
  ctx: ExtractionContext
): void {
  // 遍历子树查找 call_expression
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.type === "call_expression") {
      const funcNode = current.childForFieldName("function");
      if (funcNode) {
        const callText = getNodeText(funcNode, ctx.source);
        const callName = extractCallName(callText);
        if (callName && !isBuiltin(callName)) {
          recordUnresolvedEdge(ctx, callerId, callName, "calls", current);
        }
      }
    }
    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i);
      if (child) stack.push(child);
    }
  }
}

/** 解析调用关系：将未解析的调用名称匹配到提取的符号 */
function resolveCalls(ctx: ExtractionContext): void {
  const edges = unresolvedEdges.get(ctx.file);
  if (!edges) return;

  // 构建名称→符号的映射
  const nameMap = new Map<string, number[]>();
  for (const node of ctx.nodes) {
    const ids = nameMap.get(node.name) || [];
    ids.push(node.id);
    nameMap.set(node.name, ids);
  }

  for (const edge of edges) {
    const targets = nameMap.get(edge.toName);
    if (targets) {
      // 优先匹配同父级的符号
      const caller = ctx.nodes.find((n) => n.id === edge.fromId);
      const callerParent = caller?.parentId;

      let bestTarget = targets[0];
      if (callerParent) {
        const sibling = targets.find((tid) => {
          const t = ctx.nodes.find((n) => n.id === tid);
          return t?.parentId === callerParent;
        });
        if (sibling) bestTarget = sibling;
      }

      ctx.edges.push({
        id: ctx.nextEdgeId++,
        fromId: edge.fromId,
        toId: bestTarget,
        kind: "calls",
        file: ctx.file,
        line: edge.line,
      });
    }
  }

  unresolvedEdges.delete(ctx.file);
}

/** 判断是否为内置函数 */
function isBuiltin(name: string): boolean {
  const builtins = new Set([
    "console", "log", "error", "warn", "info", "debug",
    "require", "import", "export",
    "JSON", "parse", "stringify",
    "Math", "Date", "Array", "Object", "String", "Number", "Boolean",
    "Promise", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "parseInt", "parseFloat", "isNaN", "isFinite",
    "undefined", "null", "true", "false",
    "if", "else", "for", "while", "do", "switch", "case",
    "return", "throw", "try", "catch", "finally",
    "new", "this", "super", "typeof", "instanceof",
    "map", "filter", "reduce", "forEach", "find",
    "push", "pop", "shift", "unshift", "splice", "slice",
    "toString", "valueOf", "hasOwnProperty",
    // React hooks
    "useState", "useEffect", "useCallback", "useMemo", "useRef",
    "useContext", "useReducer", "useLayoutEffect",
  ]);
  return builtins.has(name);
}
