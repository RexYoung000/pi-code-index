/**
 * 数据库查询层
 * 搜索、调用分析、影响分析等只读操作
 */

import { type Database } from "./adapter";
import type { SymbolNode, SymbolEdge, IndexStats, SymbolKind } from "../types";

// ── 数据库行类型（snake_case，和 SQLite 列名一致） ──

interface NodeRow {
  id: number;
  name: string;
  kind: string;
  file: string;
  line: number;
  column: number;
  start_line: number;
  end_line: number;
  language: string;
  parent_id: number | null;
  qualified_name: string | null;
}

interface EdgeRow {
  id: number;
  from_id: number;
  to_id: number;
  kind: string;
  file: string;
  line: number;
}

/** snake_case 行 → camelCase SymbolNode */
function toSymbolNode(row: NodeRow): SymbolNode {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as SymbolKind,
    file: row.file,
    line: row.line,
    column: row.column,
    startLine: row.start_line,
    endLine: row.end_line,
    language: row.language,
    parentId: row.parent_id,
    qualifiedName: row.qualified_name,
  };
}

/** snake_case 行 → camelCase SymbolEdge */
function toSymbolEdge(row: EdgeRow): SymbolEdge {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    kind: row.kind as SymbolEdge["kind"],
    file: row.file,
    line: row.line,
  };
}

/** 搜索结果 */
export interface SearchResult {
  node: SymbolNode;
  rank: number;
  snippet: string;
}

/** 探索结果 — 一组相关符号和关系 */
export interface ExploreResult {
  symbols: SymbolNode[];
  edges: SymbolEdge[];
  files: string[];
  sourceRanges: Array<{
    file: string;
    startLine: number;
    endLine: number;
  }>;
}

/** 影响分析结果 */
export interface ImpactResult {
  symbol: SymbolNode;
  callees: SymbolNode[];
  callers: SymbolNode[];
  references: SymbolNode[];
  affected: SymbolNode[];
  depth: number;
}

// ═══════════════════════════════════════════
//  基础查询
// ═══════════════════════════════════════════

/** 全文搜索符号 */
export function searchNodes(
  db: Database,
  query: string,
  options?: {
    kind?: SymbolKind;
    language?: string;
    file?: string;
    limit?: number;
  }
): SearchResult[] {
  const limit = options?.limit ?? 20;
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options?.kind) {
    conditions.push("kind = @kind");
    params.kind = options.kind;
  }
  if (options?.language) {
    conditions.push("language = @language");
    params.language = options.language;
  }
  if (options?.file) {
    conditions.push("file = @file");
    params.file = options.file;
  }

  const filterWhere = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const trimmed = query.trim();

  // 空 query 用于“按文件/类型列出符号”，不能走 FTS MATCH
  if (!trimmed) {
    const rows = db
      .prepare(
        `SELECT * FROM nodes ${filterWhere} ORDER BY file, line LIMIT @limit`
      )
      .all({ ...params, limit }) as NodeRow[];

    return rows.map((row) => ({
      node: toSymbolNode(row),
      rank: 0,
      snippet: `${row.name} (${row.kind}) — ${row.file}:${row.line}`,
    }));
  }

  const ftsConditions = conditions.map((c) => c.replace(/\b(kind|language|file)\b/g, "n.$1"));
  const ftsWhere = ftsConditions.length > 0 ? "AND " + ftsConditions.join(" AND ") : "";
  const likeWhere = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";

  const results = new Map<number, SearchResult>();

  // 1) FTS 精确/前缀搜索
  try {
    const ftsRows = db
      .prepare(
        `
      SELECT n.*, nodes_fts.rank
      FROM nodes_fts
      JOIN nodes n ON nodes_fts.rowid = n.id
      WHERE nodes_fts MATCH @ftsQuery
      ${ftsWhere}
      ORDER BY rank
      LIMIT @limit
    `
      )
      .all({ ...params, ftsQuery: `${trimmed}*`, limit }) as Array<NodeRow & { rank: number }>;

    for (const row of ftsRows) {
      results.set(row.id, {
        node: toSymbolNode(row),
        rank: row.rank,
        snippet: `${row.name} (${row.kind}) — ${row.file}:${row.line}`,
      });
    }
  } catch {
    // FTS 对特殊字符敏感，失败时继续走 LIKE fallback
  }

  // 2) LIKE fallback：支持 CamelCase 子串，例如 user -> UserService
  if (results.size < limit) {
    const likeRows = db
      .prepare(
        `
      SELECT * FROM nodes
      WHERE (lower(name) LIKE @like OR lower(coalesce(qualified_name, '')) LIKE @like)
      ${likeWhere}
      ORDER BY file, line
      LIMIT @limit
    `
      )
      .all({ ...params, like: `%${trimmed.toLowerCase()}%`, limit }) as NodeRow[];

    for (const row of likeRows) {
      if (results.size >= limit) break;
      if (!results.has(row.id)) {
        results.set(row.id, {
          node: toSymbolNode(row),
          rank: 1,
          snippet: `${row.name} (${row.kind}) — ${row.file}:${row.line}`,
        });
      }
    }
  }

  return Array.from(results.values()).slice(0, limit);
}

/** 获取节点的调用者 */
export function getCallers(
  db: Database,
  nodeId: number,
  limit: number = 50
): SymbolNode[] {
  const rows = db
    .prepare(
      `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.from_id = n.id
    WHERE e.to_id = ? AND e.kind = 'calls'
    LIMIT ?
  `
    )
    .all(nodeId, limit) as NodeRow[];
  return rows.map(toSymbolNode);
}

/** 获取节点调用了谁 */
export function getCallees(
  db: Database,
  nodeId: number,
  limit: number = 50
): SymbolNode[] {
  const rows = db
    .prepare(
      `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.to_id = n.id
    WHERE e.from_id = ? AND e.kind = 'calls'
    LIMIT ?
  `
    )
    .all(nodeId, limit) as NodeRow[];
  return rows.map(toSymbolNode);
}

/** 获取节点的引用（非调用关系） */
export function getReferences(
  db: Database,
  nodeId: number,
  limit: number = 50
): SymbolNode[] {
  const rows = db
    .prepare(
      `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.from_id = n.id
    WHERE e.to_id = ? AND e.kind = 'references'
    LIMIT ?
  `
    )
    .all(nodeId, limit) as NodeRow[];
  return rows.map(toSymbolNode);
}

/** 获取单个节点的详细信息 */
export function getNode(db: Database, nodeId: number): SymbolNode | null {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(nodeId) as NodeRow | undefined;
  return row ? toSymbolNode(row) : null;
}

/** 按名称获取节点 */
export function getNodeByName(
  db: Database,
  name: string,
  file?: string
): SymbolNode[] {
  if (file) {
    const rows = db
      .prepare("SELECT * FROM nodes WHERE name = ? AND file = ? LIMIT 10")
      .all(name, file) as NodeRow[];
    return rows.map(toSymbolNode);
  }
  const rows = db
    .prepare("SELECT * FROM nodes WHERE name = ? LIMIT 10")
    .all(name) as NodeRow[];
  return rows.map(toSymbolNode);
}

// ═══════════════════════════════════════════
//  影响分析
// ═══════════════════════════════════════════

/** 计算影响半径 */
export function getImpactRadius(
  db: Database,
  nodeId: number,
  maxDepth: number = 3
): ImpactResult {
  const symbol = getNode(db, nodeId);
  if (!symbol) {
    throw new Error(`Symbol not found: ${nodeId}`);
  }

  const callees = getCallees(db, nodeId);
  const callers = getCallers(db, nodeId);
  const references = getReferences(db, nodeId);

  const visited = new Set<number>([nodeId]);
  const affected: SymbolNode[] = [];
  const queue: Array<{ id: number; depth: number }> = [];

  for (const n of [...callees, ...references]) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      queue.push({ id: n.id, depth: 1 });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > maxDepth) continue;

    const node = getNode(db, current.id);
    if (node) affected.push(node);

    const nextCallees = getCallees(db, current.id, 20);
    for (const n of nextCallees) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        queue.push({ id: n.id, depth: current.depth + 1 });
      }
    }
  }

  return { symbol, callees, callers, references, affected, depth: maxDepth };
}

// ═══════════════════════════════════════════
//  上下文构建
// ═══════════════════════════════════════════

export function buildContext(
  db: Database,
  task: string,
  options?: {
    maxNodes?: number;
    maxFiles?: number;
  }
): ExploreResult {
  const maxNodes = options?.maxNodes ?? 15;
  const maxFiles = options?.maxFiles ?? 5;

  const keywords = task
    .toLowerCase()
    .split(/[^a-zA-Z0-9_]/)
    .filter((w) => w.length > 2);

  if (keywords.length === 0) {
    return { symbols: [], edges: [], files: [], sourceRanges: [] };
  }

  const allResults: SearchResult[] = [];
  for (const kw of keywords.slice(0, 5)) {
    const results = searchNodes(db, kw, { limit: 10 });
    allResults.push(...results);
  }

  const seen = new Set<number>();
  const unique: SymbolNode[] = [];
  for (const r of allResults) {
    if (!seen.has(r.node.id) && unique.length < maxNodes) {
      seen.add(r.node.id);
      unique.push(r.node);
    }
  }

  const edges: SymbolEdge[] = [];
  for (const node of unique.slice(0, 5)) {
    const relatedEdges = db
      .prepare("SELECT * FROM edges WHERE from_id = ? OR to_id = ? LIMIT 10")
      .all(node.id, node.id) as EdgeRow[];
    for (const edge of relatedEdges) {
      edges.push(toSymbolEdge(edge));
    }
  }

  const files = [...new Set(unique.map((n) => n.file))].slice(0, maxFiles);

  const fileRanges = new Map<string, { min: number; max: number }>();
  for (const node of unique) {
    const existing = fileRanges.get(node.file);
    if (existing) {
      existing.min = Math.min(existing.min, node.startLine);
      existing.max = Math.max(existing.max, node.endLine);
    } else {
      fileRanges.set(node.file, {
        min: node.startLine,
        max: node.endLine,
      });
    }
  }

  const sourceRanges = Array.from(fileRanges.entries()).map(([file, range]) => ({
    file,
    startLine: range.min,
    endLine: range.max,
  }));

  return { symbols: unique, edges, files, sourceRanges };
}

// ═══════════════════════════════════════════
//  探索
// ═══════════════════════════════════════════

export function exploreNodes(
  db: Database,
  nodeIds: number[],
  options?: {
    maxDepth?: number;
    maxNodes?: number;
  }
): ExploreResult {
  const maxDepth = options?.maxDepth ?? 2;
  const maxNodes = options?.maxNodes ?? 30;

  const visited = new Set<number>();
  const allNodes: SymbolNode[] = [];
  const allEdges: SymbolEdge[] = [];
  const queue: Array<{ id: number; depth: number }> = nodeIds.map((id) => ({
    id,
    depth: 0,
  }));

  while (queue.length > 0 && allNodes.length < maxNodes) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const node = getNode(db, current.id);
    if (!node) continue;
    allNodes.push(node);

    if (current.depth < maxDepth) {
      const edges = db
        .prepare("SELECT * FROM edges WHERE from_id = ? OR to_id = ? LIMIT 15")
        .all(current.id, current.id) as EdgeRow[];

      for (const edge of edges) {
        allEdges.push(toSymbolEdge(edge));
        const neighborId =
          edge.from_id === current.id ? edge.to_id : edge.from_id;
        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, depth: current.depth + 1 });
        }
      }
    }
  }

  const files = [...new Set(allNodes.map((n) => n.file))];

  const fileRanges = new Map<string, { min: number; max: number }>();
  for (const node of allNodes) {
    const existing = fileRanges.get(node.file);
    if (existing) {
      existing.min = Math.min(existing.min, node.startLine);
      existing.max = Math.max(existing.max, node.endLine);
    } else {
      fileRanges.set(node.file, {
        min: node.startLine,
        max: node.endLine,
      });
    }
  }

  const sourceRanges = Array.from(fileRanges.entries()).map(([file, range]) => ({
    file,
    startLine: range.min,
    endLine: range.max,
  }));

  return {
    symbols: allNodes,
    edges: allEdges,
    files,
    sourceRanges,
  };
}

// ═══════════════════════════════════════════
//  统计
// ═══════════════════════════════════════════

export function getStats(db: Database): IndexStats {
  const fileCount = db.prepare("SELECT COUNT(*) as count FROM files").get() as {
    count: number;
  };
  const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get() as {
    count: number;
  };
  const edgeCount = db.prepare("SELECT COUNT(*) as count FROM edges").get() as {
    count: number;
  };

  const langRows = db
    .prepare("SELECT language, COUNT(*) as count FROM nodes GROUP BY language")
    .all() as Array<{ language: string; count: number }>;

  const languages: Record<string, number> = {};
  for (const row of langRows) {
    languages[row.language] = row.count;
  }

  const lastIndexed =
    fileCount.count > 0
      ? (
          db
            .prepare("SELECT MAX(last_indexed) as ts FROM files")
            .get() as { ts: number }
        ).ts
      : null;

  return {
    totalFiles: fileCount.count,
    totalNodes: nodeCount.count,
    totalEdges: edgeCount.count,
    languages,
    lastIndexed,
  };
}

export function getFiles(
  db: Database,
  options?: {
    filter?: string;
    format?: "tree" | "list" | "flat";
    maxDepth?: number;
  }
): Array<{ path: string; language: string; nodes: number }> {
  let query = "SELECT path, language, (SELECT COUNT(*) FROM nodes WHERE nodes.file = files.path) as nodes FROM files";

  if (options?.filter) {
    query += ` WHERE path LIKE '%${options.filter}%'`;
  }

  query += " ORDER BY path";

  return db.prepare(query).all() as Array<{
    path: string;
    language: string;
    nodes: number;
  }>;
}

export { toSymbolNode, toSymbolEdge, type NodeRow, type EdgeRow };
