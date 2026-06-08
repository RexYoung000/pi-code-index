/**
 * SQLite 数据库层
 * 管理代码图谱的存储、查询和迁移
 */

import DatabaseCtor, { type Database } from "./adapter";

/** 数据库版本，用于自动迁移 */
const SCHEMA_VERSION = 1;

/** 初始化数据库，创建表和索引 */
export function initDatabase(dbPath: string): Database {
  const db = new DatabaseCtor(dbPath);

  // 启用 WAL 模式（读写并发）
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 创建 schema 版本表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER NOT NULL
    );
  `);

  const currentVersion = db.prepare(
    "SELECT version FROM _schema_version"
  ).get() as { version: number } | undefined;

  if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
    createSchema(db);
    db.prepare("INSERT OR REPLACE INTO _schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
  }

  return db;
}

function createSchema(db: Database): void {
  db.exec(`
    -- 已索引的文件
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL,
      checksum TEXT,
      last_indexed INTEGER NOT NULL
    );

    -- 代码符号
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      column INTEGER NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      language TEXT NOT NULL,
      parent_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
      qualified_name TEXT
    );

    -- 符号间关系（label 存储调用目标名，用于跨文件解析）
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      label TEXT
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
    CREATE INDEX IF NOT EXISTS idx_nodes_language ON nodes(language);
    CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

    -- FTS5 全文搜索
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      name,
      qualified_name,
      content='nodes',
      content_rowid='id'
    );

    -- FTS 触发器：自动同步
    CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
      INSERT INTO nodes_fts(rowid, name, qualified_name)
      VALUES (new.id, new.name, new.qualified_name);
    END;

    CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name)
      VALUES ('delete', old.id, old.name, old.qualified_name);
    END;

    CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
      INSERT INTO nodes_fts(nodes_fts, rowid, name, qualified_name)
      VALUES ('delete', old.id, old.name, old.qualified_name);
      INSERT INTO nodes_fts(rowid, name, qualified_name)
      VALUES (new.id, new.name, new.qualified_name);
    END;
  `);
}
