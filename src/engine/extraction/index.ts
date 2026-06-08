/**
 * 多语言提取器聚合
 * 根据语言类型分发给对应的提取器
 */

import { readFileSync } from "node:fs";
import { type Database } from "../db/adapter";
import type { SymbolNode, SymbolEdge, SupportedLanguage } from "../types";
import { getLanguage } from "../types";
import { extractTypeScript } from "./languages/typescript";
import { extractPython } from "./languages/python";
import { extractGo } from "./languages/go";
import { extractRust } from "./languages/rust";
import { extractJava } from "./languages/java";
import { extractC } from "./languages/c-cpp";
import { discoverFiles } from "./discover";

/** 提取一个文件的符号和关系 */
export async function extractFile(
  file: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  const lang = getLanguage(file);
  if (!lang) return { nodes: [], edges: [] };

  const source = readFileSync(file, "utf-8");

  // 跳过空文件和大文件
  if (!source.trim() || source.length > 1_000_000) {
    return { nodes: [], edges: [] };
  }

  try {
    return await extractByLanguage(lang, file, source, startNodeId, startEdgeId);
  } catch {
    // 解析失败时返回空结果
    return { nodes: [], edges: [] };
  }
}

async function extractByLanguage(
  lang: SupportedLanguage,
  file: string,
  source: string,
  startNodeId: number,
  startEdgeId: number
): Promise<{ nodes: SymbolNode[]; edges: SymbolEdge[] }> {
  switch (lang) {
    case "typescript":
    case "javascript":
      return extractTypeScript(file, source, startNodeId, startEdgeId);
    case "python":
      return extractPython(file, source, startNodeId, startEdgeId);
    case "go":
      return extractGo(file, source, startNodeId, startEdgeId);
    case "rust":
      return extractRust(file, source, startNodeId, startEdgeId);
    case "java":
      return extractJava(file, source, startNodeId, startEdgeId);
    case "c":
      return extractC(source, file, startNodeId, startEdgeId, "c");
    case "cpp":
      return extractC(source, file, startNodeId, startEdgeId, "cpp");
  }
}

/** 索引整个项目 */
export async function indexProject(
  db: Database,
  projectRoot: string,
  onProgress?: (progress: { phase: string; current: number; total: number }) => void
): Promise<void> {
  const files = discoverFiles(projectRoot);
  onProgress?.({ phase: "discovering", current: files.length, total: files.length });

  let nodeId = 1;
  let edgeId = 1;

  // 每批处理 20 个文件，避免大项目 OOM
  const BATCH_SIZE = 20;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    onProgress?.({ phase: "indexing", current: Math.min(i + BATCH_SIZE, files.length), total: files.length });

    for (const file of batch) {
      try {
        const lang = getLanguage(file);
        if (!lang) continue;
        const { nodes, edges } = await extractFile(file, nodeId, edgeId);
        saveExtraction(db, file, lang, nodes, edges);
        nodeId += nodes.length;
        edgeId += edges.length;
      } catch (err) {
        console.error(`Failed to index ${file}:`, (err as Error).message);
      }
    }
  }

  // 跨文件引用解析
  onProgress?.({ phase: "resolving", current: files.length, total: files.length });
  try {
    const { resolveCrossFileReferences } = await import("../resolution/cross-file");
    const resolved = resolveCrossFileReferences(db);
    if (resolved > 0) {
      console.log(`Resolved ${resolved} cross-file references`);
    }
    // 清理后剩余的 -1 边（外部库引用等，属于正常情况）
    const remaining = db.prepare("SELECT COUNT(*) as c FROM edges WHERE to_id = -1").get() as { c: number };
    if (remaining.c > 0) {
      console.log(`${remaining.c} unresolved references (external packages etc.)`);
    }
  } catch (err) {
    console.error("Cross-file resolution failed:", (err as Error).message);
  }

  onProgress?.({ phase: "done", current: files.length, total: files.length });
}

/** 将提取结果写入数据库 */
export function saveExtraction(
  db: Database,
  file: string,
  language: string,
  nodes: SymbolNode[],
  edges: SymbolEdge[]
): void {
  const insertFile = db.prepare(`
    INSERT OR REPLACE INTO files (path, language, last_indexed)
    VALUES (?, ?, ?)
  `);

  const insertNode = db.prepare(`
    INSERT INTO nodes (id, name, kind, file, line, column, start_line, end_line, language, parent_id, qualified_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEdge = db.prepare(`
    INSERT INTO edges (id, from_id, to_id, kind, file, line, label)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    // 先删除旧数据
    db.prepare("DELETE FROM edges WHERE file = ?").run(file);
    db.prepare("DELETE FROM nodes WHERE file = ?").run(file);

    insertFile.run(file, language, Date.now());

    for (const node of nodes) {
      insertNode.run(
        node.id, node.name, node.kind, node.file, node.line, node.column,
        node.startLine, node.endLine, node.language, node.parentId, node.qualifiedName
      );
    }

    for (const edge of edges) {
      insertEdge.run(edge.id, edge.fromId, edge.toId, edge.kind, edge.file, edge.line, edge.label ?? null);
    }
  });

  transaction();
}
