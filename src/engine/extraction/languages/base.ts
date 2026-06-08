/**
 * 代码提取器的公共接口和类型
 */

import type { Node } from "web-tree-sitter";
import type { SymbolNode, SymbolEdge, SymbolKind, EdgeKind } from "../../types";

/** 提取上下文 — 累积提取结果 */
export interface ExtractionContext {
  file: string;
  source: string;
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  nextNodeId: number;
  nextEdgeId: number;
}

export function createContext(file: string, source: string, startNodeId: number, startEdgeId: number): ExtractionContext {
  return {
    file,
    source,
    nodes: [],
    edges: [],
    nextNodeId: startNodeId,
    nextEdgeId: startEdgeId,
  };
}

/** 添加一个符号节点 */
export function addNode(
  ctx: ExtractionContext,
  name: string,
  kind: SymbolKind,
  node: Node,
  parentId: number | null = null,
  qualifiedName: string | null = null
): number {
  const id = ctx.nextNodeId++;
  ctx.nodes.push({
    id,
    name,
    kind,
    file: ctx.file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column + 1,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    language: "unknown",
    parentId,
    qualifiedName,
  });
  return id;
}

/** 添加一条边 */
export function addEdge(
  ctx: ExtractionContext,
  fromId: number,
  toId: number,
  kind: EdgeKind,
  node: Node
): void {
  ctx.edges.push({
    id: ctx.nextEdgeId++,
    fromId,
    toId,
    kind,
    file: ctx.file,
    line: node.startPosition.row + 1,
  });
}

/** 从文本中提取调用目标名称 */
export function extractCallName(callText: string): string {
  const cleaned = callText.split("(")[0].trim();
  const parts = cleaned.split(".");
  return parts[parts.length - 1] || cleaned;
}

/** 获取节点的文本内容 */
export function getNodeText(node: Node, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}
