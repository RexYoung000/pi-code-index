/**
 * 代码图谱引擎
 * 负责索引管理：初始化、完整索引、增量同步
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import DatabaseCtor, { type Database } from "./db/adapter";
import { initDatabase } from "./db/schema";
import {
  searchNodes,
  getCallers,
  getCallees,
  getReferences,
  getNode,
  getNodeByName,
  getImpactRadius,
  buildContext,
  exploreNodes,
  getStats,
  getFiles,
} from "./db/queries";
import { indexProject } from "./extraction/index";
import type { SearchResult, ExploreResult, ImpactResult } from "./db/queries";
import type { SymbolNode, SymbolKind, IndexStats } from "./types";

/** 数据目录名 */
const DATA_DIR = ".codeindex";

export class CodeIndexEngine {
  private db: Database | null = null;
  private projectRoot: string;
  private dbPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.dbPath = join(projectRoot, DATA_DIR, "codeindex.db");
  }

  /** 初始化或打开数据库 */
  async init(): Promise<void> {
    const dataDir = join(this.projectRoot, DATA_DIR);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.db = initDatabase(this.dbPath);
  }

  /** 打开已有数据库（不重新初始化） */
  async open(): Promise<boolean> {
    if (!existsSync(this.dbPath)) return false;
    this.db = new DatabaseCtor(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    return true;
  }

  /** 是否已初始化 */
  get initialized(): boolean {
    return this.db !== null;
  }

  /** 完整索引 */
  async indexAll(options?: {
    onProgress?: (progress: { phase: string; current: number; total: number }) => void;
  }): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    await indexProject(this.db, this.projectRoot, options?.onProgress);
  }

  // ═══════════════════════════════════
  //  查询方法
  // ═══════════════════════════════════

  search(query: string, options?: { kind?: SymbolKind; language?: string; file?: string; limit?: number }): SearchResult[] {
    if (!this.db) throw new Error("Database not initialized");
    return searchNodes(this.db, query, options);
  }

  getCallers(nodeId: number, limit?: number): SymbolNode[] {
    if (!this.db) throw new Error("Database not initialized");
    return getCallers(this.db, nodeId, limit);
  }

  getCallees(nodeId: number, limit?: number): SymbolNode[] {
    if (!this.db) throw new Error("Database not initialized");
    return getCallees(this.db, nodeId, limit);
  }

  getReferences(nodeId: number, limit?: number): SymbolNode[] {
    if (!this.db) throw new Error("Database not initialized");
    return getReferences(this.db, nodeId, limit);
  }

  getNode(nodeId: number): SymbolNode | null {
    if (!this.db) throw new Error("Database not initialized");
    return getNode(this.db, nodeId);
  }

  getNodeByName(name: string, file?: string): SymbolNode[] {
    if (!this.db) throw new Error("Database not initialized");
    return getNodeByName(this.db, name, file);
  }

  getImpactRadius(nodeId: number, depth?: number): ImpactResult {
    if (!this.db) throw new Error("Database not initialized");
    return getImpactRadius(this.db, nodeId, depth);
  }

  buildContext(task: string, options?: { maxNodes?: number; maxFiles?: number }): ExploreResult {
    if (!this.db) throw new Error("Database not initialized");
    return buildContext(this.db, task, options);
  }

  explore(nodeIds: number[], options?: { maxDepth?: number; maxNodes?: number }): ExploreResult {
    if (!this.db) throw new Error("Database not initialized");
    return exploreNodes(this.db, nodeIds, options);
  }

  getStats(): IndexStats {
    if (!this.db) throw new Error("Database not initialized");
    return getStats(this.db);
  }

  getFiles(options?: { filter?: string }): Array<{ path: string; language: string; nodes: number }> {
    if (!this.db) throw new Error("Database not initialized");
    return getFiles(this.db, options);
  }

  /** 关闭数据库 */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * 加载或初始化代码索引引擎
 * 如果 .codeindex/ 目录存在，则打开；否则返回 null（未初始化）
 */
export async function loadEngine(projectRoot: string): Promise<CodeIndexEngine | null> {
  const engine = new CodeIndexEngine(projectRoot);
  const opened = await engine.open();
  return opened ? engine : null;
}

/**
 * 检查项目是否已初始化代码索引
 */
export function isInitialized(projectRoot: string): boolean {
  return existsSync(join(projectRoot, DATA_DIR, "codeindex.db"));
}
