#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/engine/resolution/cross-file.ts
var cross_file_exports = {};
__export(cross_file_exports, {
  resolveCrossFileReferences: () => resolveCrossFileReferences
});
function resolveCrossFileReferences(db) {
  const unresolved = db.prepare(
    `SELECT e.id, e.label, e.from_id, e.file as edge_file
       FROM edges e
       WHERE e.to_id = -1 AND e.kind = 'calls' AND e.label IS NOT NULL`
  ).all();
  if (unresolved.length === 0) return 0;
  const nameIndex = /* @__PURE__ */ new Map();
  const allNodes = db.prepare("SELECT id, name, file FROM nodes").all();
  for (const n of allNodes) {
    const ids = nameIndex.get(n.name) || [];
    ids.push(n.id);
    nameIndex.set(n.name, ids);
  }
  let resolved = 0;
  for (const edge of unresolved) {
    const targets = nameIndex.get(edge.label);
    if (!targets || targets.length === 0) continue;
    const crossTarget = targets.find((tid) => {
      const node = allNodes.find((n) => n.id === tid);
      return node && node.file !== edge.edge_file;
    });
    const targetId = crossTarget ?? targets[0];
    db.prepare("UPDATE edges SET to_id = ? WHERE id = ?").run(targetId, edge.id);
    resolved++;
  }
  return resolved;
}
var init_cross_file = __esm({
  "src/engine/resolution/cross-file.ts"() {
    "use strict";
  }
});

// src/cli.ts
import { resolve } from "node:path";

// src/engine/index.ts
import { existsSync, mkdirSync } from "node:fs";
import { join as join2 } from "node:path";

// src/engine/db/adapter.ts
import DatabaseConstructor from "better-sqlite3";
var adapter_default = DatabaseConstructor;

// src/engine/db/schema.ts
var SCHEMA_VERSION = 1;
function initDatabase(dbPath) {
  const db = new adapter_default(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      version INTEGER NOT NULL
    );
  `);
  const currentVersion = db.prepare(
    "SELECT version FROM _schema_version"
  ).get();
  if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
    createSchema(db);
    db.prepare("INSERT OR REPLACE INTO _schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
  }
  return db;
}
function createSchema(db) {
  db.exec(`
    -- \u5DF2\u7D22\u5F15\u7684\u6587\u4EF6
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL,
      checksum TEXT,
      last_indexed INTEGER NOT NULL
    );

    -- \u4EE3\u7801\u7B26\u53F7
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

    -- \u7B26\u53F7\u95F4\u5173\u7CFB\uFF08label \u5B58\u50A8\u8C03\u7528\u76EE\u6807\u540D\uFF0C\u7528\u4E8E\u8DE8\u6587\u4EF6\u89E3\u6790\uFF09
    CREATE TABLE IF NOT EXISTS edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      label TEXT
    );

    -- \u7D22\u5F15
    CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
    CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file);
    CREATE INDEX IF NOT EXISTS idx_nodes_language ON nodes(language);
    CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);

    -- FTS5 \u5168\u6587\u641C\u7D22
    CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
      name,
      qualified_name,
      content='nodes',
      content_rowid='id'
    );

    -- FTS \u89E6\u53D1\u5668\uFF1A\u81EA\u52A8\u540C\u6B65
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

// src/engine/db/queries.ts
function toSymbolNode(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    file: row.file,
    line: row.line,
    column: row.column,
    startLine: row.start_line,
    endLine: row.end_line,
    language: row.language,
    parentId: row.parent_id,
    qualifiedName: row.qualified_name
  };
}
function toSymbolEdge(row) {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    kind: row.kind,
    file: row.file,
    line: row.line
  };
}
function searchNodes(db, query, options) {
  const limit = options?.limit ?? 20;
  const conditions = [];
  const params = {};
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
  if (!trimmed) {
    const rows = db.prepare(
      `SELECT * FROM nodes ${filterWhere} ORDER BY file, line LIMIT @limit`
    ).all({ ...params, limit });
    return rows.map((row) => ({
      node: toSymbolNode(row),
      rank: 0,
      snippet: `${row.name} (${row.kind}) \u2014 ${row.file}:${row.line}`
    }));
  }
  const ftsConditions = conditions.map((c) => c.replace(/\b(kind|language|file)\b/g, "n.$1"));
  const ftsWhere = ftsConditions.length > 0 ? "AND " + ftsConditions.join(" AND ") : "";
  const likeWhere = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";
  const results = /* @__PURE__ */ new Map();
  try {
    const ftsRows = db.prepare(
      `
      SELECT n.*, nodes_fts.rank
      FROM nodes_fts
      JOIN nodes n ON nodes_fts.rowid = n.id
      WHERE nodes_fts MATCH @ftsQuery
      ${ftsWhere}
      ORDER BY rank
      LIMIT @limit
    `
    ).all({ ...params, ftsQuery: `${trimmed}*`, limit });
    for (const row of ftsRows) {
      results.set(row.id, {
        node: toSymbolNode(row),
        rank: row.rank,
        snippet: `${row.name} (${row.kind}) \u2014 ${row.file}:${row.line}`
      });
    }
  } catch {
  }
  if (results.size < limit) {
    const likeRows = db.prepare(
      `
      SELECT * FROM nodes
      WHERE (lower(name) LIKE @like OR lower(coalesce(qualified_name, '')) LIKE @like)
      ${likeWhere}
      ORDER BY file, line
      LIMIT @limit
    `
    ).all({ ...params, like: `%${trimmed.toLowerCase()}%`, limit });
    for (const row of likeRows) {
      if (results.size >= limit) break;
      if (!results.has(row.id)) {
        results.set(row.id, {
          node: toSymbolNode(row),
          rank: 1,
          snippet: `${row.name} (${row.kind}) \u2014 ${row.file}:${row.line}`
        });
      }
    }
  }
  return Array.from(results.values()).slice(0, limit);
}
function getCallers(db, nodeId, limit = 50) {
  const rows = db.prepare(
    `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.from_id = n.id
    WHERE e.to_id = ? AND e.kind = 'calls'
    LIMIT ?
  `
  ).all(nodeId, limit);
  return rows.map(toSymbolNode);
}
function getCallees(db, nodeId, limit = 50) {
  const rows = db.prepare(
    `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.to_id = n.id
    WHERE e.from_id = ? AND e.kind = 'calls'
    LIMIT ?
  `
  ).all(nodeId, limit);
  return rows.map(toSymbolNode);
}
function getReferences(db, nodeId, limit = 50) {
  const rows = db.prepare(
    `
    SELECT n.* FROM edges e
    JOIN nodes n ON e.from_id = n.id
    WHERE e.to_id = ? AND e.kind = 'references'
    LIMIT ?
  `
  ).all(nodeId, limit);
  return rows.map(toSymbolNode);
}
function getNode(db, nodeId) {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(nodeId);
  return row ? toSymbolNode(row) : null;
}
function getNodeByName(db, name, file) {
  if (file) {
    const rows2 = db.prepare("SELECT * FROM nodes WHERE name = ? AND file = ? LIMIT 10").all(name, file);
    return rows2.map(toSymbolNode);
  }
  const rows = db.prepare("SELECT * FROM nodes WHERE name = ? LIMIT 10").all(name);
  return rows.map(toSymbolNode);
}
function getImpactRadius(db, nodeId, maxDepth = 3) {
  const symbol = getNode(db, nodeId);
  if (!symbol) {
    throw new Error(`Symbol not found: ${nodeId}`);
  }
  const callees = getCallees(db, nodeId);
  const callers = getCallers(db, nodeId);
  const references = getReferences(db, nodeId);
  const visited = /* @__PURE__ */ new Set([nodeId]);
  const affected = [];
  const queue = [];
  for (const n of [...callees, ...references]) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      queue.push({ id: n.id, depth: 1 });
    }
  }
  while (queue.length > 0) {
    const current = queue.shift();
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
function buildContext(db, task, options) {
  const maxNodes = options?.maxNodes ?? 15;
  const maxFiles = options?.maxFiles ?? 5;
  const keywords = task.toLowerCase().split(/[^a-zA-Z0-9_]/).filter((w) => w.length > 2);
  if (keywords.length === 0) {
    return { symbols: [], edges: [], files: [], sourceRanges: [] };
  }
  const allResults = [];
  for (const kw of keywords.slice(0, 5)) {
    const results = searchNodes(db, kw, { limit: 10 });
    allResults.push(...results);
  }
  const seen = /* @__PURE__ */ new Set();
  const unique = [];
  for (const r of allResults) {
    if (!seen.has(r.node.id) && unique.length < maxNodes) {
      seen.add(r.node.id);
      unique.push(r.node);
    }
  }
  const edges = [];
  for (const node of unique.slice(0, 5)) {
    const relatedEdges = db.prepare("SELECT * FROM edges WHERE from_id = ? OR to_id = ? LIMIT 10").all(node.id, node.id);
    for (const edge of relatedEdges) {
      edges.push(toSymbolEdge(edge));
    }
  }
  const files = [...new Set(unique.map((n) => n.file))].slice(0, maxFiles);
  const fileRanges = /* @__PURE__ */ new Map();
  for (const node of unique) {
    const existing = fileRanges.get(node.file);
    if (existing) {
      existing.min = Math.min(existing.min, node.startLine);
      existing.max = Math.max(existing.max, node.endLine);
    } else {
      fileRanges.set(node.file, {
        min: node.startLine,
        max: node.endLine
      });
    }
  }
  const sourceRanges = Array.from(fileRanges.entries()).map(([file, range]) => ({
    file,
    startLine: range.min,
    endLine: range.max
  }));
  return { symbols: unique, edges, files, sourceRanges };
}
function exploreNodes(db, nodeIds, options) {
  const maxDepth = options?.maxDepth ?? 2;
  const maxNodes = options?.maxNodes ?? 30;
  const visited = /* @__PURE__ */ new Set();
  const allNodes = [];
  const allEdges = [];
  const queue = nodeIds.map((id) => ({
    id,
    depth: 0
  }));
  while (queue.length > 0 && allNodes.length < maxNodes) {
    const current = queue.shift();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    const node = getNode(db, current.id);
    if (!node) continue;
    allNodes.push(node);
    if (current.depth < maxDepth) {
      const edges = db.prepare("SELECT * FROM edges WHERE from_id = ? OR to_id = ? LIMIT 15").all(current.id, current.id);
      for (const edge of edges) {
        allEdges.push(toSymbolEdge(edge));
        const neighborId = edge.from_id === current.id ? edge.to_id : edge.from_id;
        if (!visited.has(neighborId)) {
          queue.push({ id: neighborId, depth: current.depth + 1 });
        }
      }
    }
  }
  const files = [...new Set(allNodes.map((n) => n.file))];
  const fileRanges = /* @__PURE__ */ new Map();
  for (const node of allNodes) {
    const existing = fileRanges.get(node.file);
    if (existing) {
      existing.min = Math.min(existing.min, node.startLine);
      existing.max = Math.max(existing.max, node.endLine);
    } else {
      fileRanges.set(node.file, {
        min: node.startLine,
        max: node.endLine
      });
    }
  }
  const sourceRanges = Array.from(fileRanges.entries()).map(([file, range]) => ({
    file,
    startLine: range.min,
    endLine: range.max
  }));
  return {
    symbols: allNodes,
    edges: allEdges,
    files,
    sourceRanges
  };
}
function getStats(db) {
  const fileCount = db.prepare("SELECT COUNT(*) as count FROM files").get();
  const nodeCount = db.prepare("SELECT COUNT(*) as count FROM nodes").get();
  const edgeCount = db.prepare("SELECT COUNT(*) as count FROM edges").get();
  const langRows = db.prepare("SELECT language, COUNT(*) as count FROM nodes GROUP BY language").all();
  const languages = {};
  for (const row of langRows) {
    languages[row.language] = row.count;
  }
  const lastIndexed = fileCount.count > 0 ? db.prepare("SELECT MAX(last_indexed) as ts FROM files").get().ts : null;
  return {
    totalFiles: fileCount.count,
    totalNodes: nodeCount.count,
    totalEdges: edgeCount.count,
    languages,
    lastIndexed
  };
}
function getFiles(db, options) {
  let query = "SELECT path, language, (SELECT COUNT(*) FROM nodes WHERE nodes.file = files.path) as nodes FROM files";
  if (options?.filter) {
    query += ` WHERE path LIKE '%${options.filter}%'`;
  }
  query += " ORDER BY path";
  return db.prepare(query).all();
}

// src/engine/extraction/index.ts
import { readFileSync as readFileSync3 } from "node:fs";

// src/engine/types.ts
var EXTENSION_TO_LANGUAGE = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp"
};
function getLanguage(filePath) {
  for (const [ext, lang] of Object.entries(EXTENSION_TO_LANGUAGE)) {
    if (filePath.endsWith(ext)) return lang;
  }
  return null;
}

// src/engine/extraction/tree-sitter.ts
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
var _req = createRequire(import.meta.url);
var wts = _req("web-tree-sitter");
var wtsReady = false;
async function ensureInit() {
  if (wtsReady) return;
  await wts.Parser.init();
  wtsReady = true;
}
var parser = null;
var parserInitPromise = null;
var languageCache = /* @__PURE__ */ new Map();
async function getParser() {
  await ensureInit();
  if (parser) return parser;
  if (parserInitPromise) return parserInitPromise;
  parserInitPromise = (async () => {
    parser = new wts.Parser();
    return parser;
  })();
  return parserInitPromise;
}
async function loadLanguage(langName) {
  await ensureInit();
  const cached = languageCache.get(langName);
  if (cached) return cached;
  const wasmPath = _req.resolve(`tree-sitter-wasms/out/tree-sitter-${langName}.wasm`);
  const wasmBuffer = readFileSync(wasmPath);
  const lang = await wts.Language.load(wasmBuffer);
  languageCache.set(langName, lang);
  return lang;
}
async function parseSource(source, language) {
  const p = await getParser();
  p.setLanguage(language);
  const tree = p.parse(source);
  if (!tree) throw new Error("Failed to parse source");
  return tree;
}

// src/engine/extraction/languages/base.ts
function createContext(file, source, startNodeId, startEdgeId) {
  return {
    file,
    source,
    nodes: [],
    edges: [],
    nextNodeId: startNodeId,
    nextEdgeId: startEdgeId
  };
}
function addNode(ctx, name, kind, node, parentId = null, qualifiedName = null) {
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
    qualifiedName
  });
  return id;
}
function extractCallName(callText) {
  const cleaned = callText.split("(")[0].trim();
  const parts = cleaned.split(".");
  return parts[parts.length - 1] || cleaned;
}
function getNodeText(node, source) {
  return source.slice(node.startIndex, node.endIndex);
}

// src/engine/extraction/languages/typescript.ts
async function extractTypeScript(file, source, startNodeId, startEdgeId) {
  const lang = await loadLanguage("typescript");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  const setLang = (n) => {
    n.language = file.endsWith(".ts") || file.endsWith(".tsx") ? "typescript" : "javascript";
  };
  try {
    extractFromNode(tree.rootNode, ctx, null, setLang);
  } finally {
  }
  resolveCalls(ctx);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractFromNode(node, ctx, parentId, setLang) {
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
            const body = child.childForFieldName("body");
            if (body) extractCallsFromNode(body, id, ctx);
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
            const extendsClause = child.childForFieldName("extends");
            if (extendsClause) {
              const extendsName = getNodeText(extendsClause, ctx.source);
              recordUnresolvedEdge(ctx, id, extendsName, "extends", extendsClause);
            }
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
      extractFromNode(child, ctx, parentId, setLang);
    }
  }
}
function extractVariableDecl(node, ctx, parentId, setLang) {
  for (let i = 0; i < node.childCount; i++) {
    const declarator = node.child(i);
    if (declarator?.type !== "variable_declarator") continue;
    const nameNode = declarator.childForFieldName("name");
    const valueNode = declarator.childForFieldName("value");
    if (!nameNode || !valueNode) continue;
    const name = getNodeText(nameNode, ctx.source);
    if (valueNode.type === "arrow_function" || valueNode.type === "function_expression") {
      const id = addNode(ctx, name, "function", declarator, parentId);
      setLang(ctx.nodes[ctx.nodes.length - 1]);
      const body = valueNode.childForFieldName("body");
      if (body) extractCallsFromNode(body, id, ctx);
    }
  }
}
var unresolvedEdges = /* @__PURE__ */ new Map();
function recordUnresolvedEdge(ctx, fromId, toName, kind, node) {
  const edges = unresolvedEdges.get(ctx.file) || [];
  edges.push({
    fromId,
    toName,
    kind,
    line: node.startPosition.row + 1
  });
  unresolvedEdges.set(ctx.file, edges);
}
function extractCallsFromNode(node, callerId, ctx) {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.pop();
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
function resolveCalls(ctx) {
  const edges = unresolvedEdges.get(ctx.file);
  if (!edges) return;
  const nameMap = /* @__PURE__ */ new Map();
  for (const node of ctx.nodes) {
    const ids = nameMap.get(node.name) || [];
    ids.push(node.id);
    nameMap.set(node.name, ids);
  }
  for (const edge of edges) {
    const targets = nameMap.get(edge.toName);
    let bestTarget = -1;
    if (targets && targets.length > 0) {
      const caller = ctx.nodes.find((n) => n.id === edge.fromId);
      const callerParent = caller?.parentId;
      bestTarget = targets[0];
      if (callerParent) {
        const sibling = targets.find((tid) => {
          const t = ctx.nodes.find((n) => n.id === tid);
          return t?.parentId === callerParent;
        });
        if (sibling) bestTarget = sibling;
      }
    }
    ctx.edges.push({
      id: ctx.nextEdgeId++,
      fromId: edge.fromId,
      toId: bestTarget,
      kind: "calls",
      file: ctx.file,
      line: edge.line,
      label: edge.toName
    });
  }
  unresolvedEdges.delete(ctx.file);
}
function isBuiltin(name) {
  const builtins = /* @__PURE__ */ new Set([
    "console",
    "log",
    "error",
    "warn",
    "info",
    "debug",
    "require",
    "import",
    "export",
    "JSON",
    "parse",
    "stringify",
    "Math",
    "Date",
    "Array",
    "Object",
    "String",
    "Number",
    "Boolean",
    "Promise",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "undefined",
    "null",
    "true",
    "false",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "return",
    "throw",
    "try",
    "catch",
    "finally",
    "new",
    "this",
    "super",
    "typeof",
    "instanceof",
    "map",
    "filter",
    "reduce",
    "forEach",
    "find",
    "push",
    "pop",
    "shift",
    "unshift",
    "splice",
    "slice",
    "toString",
    "valueOf",
    "hasOwnProperty",
    // React hooks
    "useState",
    "useEffect",
    "useCallback",
    "useMemo",
    "useRef",
    "useContext",
    "useReducer",
    "useLayoutEffect"
  ]);
  return builtins.has(name);
}

// src/engine/extraction/languages/helpers.ts
function extractCalls(node, ctx, callerId) {
  const stack = [node];
  const builtins = /* @__PURE__ */ new Set([
    "print",
    "len",
    "range",
    "type",
    "int",
    "str",
    "float",
    "bool",
    "list",
    "dict",
    "set",
    "tuple",
    "enumerate",
    "zip",
    "map",
    "filter",
    "sorted",
    "open",
    "isinstance",
    "hasattr",
    "getattr",
    "setattr",
    "super",
    "self",
    "cls",
    "fmt",
    "log",
    "os",
    "io",
    "http",
    "json",
    "context",
    "Printf",
    "Println",
    "Sprintf",
    "Errorf",
    "Fprintf",
    "println",
    "panic",
    "recover",
    "make",
    "new",
    "append",
    "copy",
    "delete",
    "close",
    "System",
    "out",
    "println",
    "print",
    "printf",
    "console",
    "log",
    "error",
    "warn",
    "info",
    "require",
    "import",
    "true",
    "false",
    "nil",
    "null",
    "None"
  ]);
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.type === "call_expression" || current.type === "call") {
      const funcNode = current.childForFieldName("function");
      if (funcNode) {
        let callName = "";
        if (funcNode.type === "attribute" || funcNode.type === "field_expression") {
          const obj = funcNode.childForFieldName("object");
          const attr = funcNode.childForFieldName("attribute") || funcNode.childForFieldName("field");
          if (attr) {
            callName = getNodeText(attr, ctx.source);
          }
        } else {
          callName = getNodeText(funcNode, ctx.source);
        }
        callName = callName.replace(/[^a-zA-Z0-9_]/g, "");
        if (callName && !builtins.has(callName) && callName.length > 0) {
          ctx.edges.push({
            id: ctx.nextEdgeId++,
            fromId: callerId,
            toId: -1,
            kind: "calls",
            file: ctx.file,
            line: current.startPosition.row + 1,
            label: callName
          });
        }
      }
    }
    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i);
      if (child) stack.push(child);
    }
  }
}
function getName(node, ctx) {
  const nameNode = node.childForFieldName("name");
  if (nameNode) return getNodeText(nameNode, ctx.source);
  return null;
}

// src/engine/extraction/languages/python.ts
async function extractPython(file, source, startNodeId, startEdgeId) {
  const lang = await loadLanguage("python");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  try {
    extractModule(tree.rootNode, ctx, null);
  } finally {
  }
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractModule(node, ctx, parentId) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    try {
      switch (child.type) {
        case "function_definition": {
          const name = getName(child, ctx);
          if (name && !name.startsWith("__")) {
            const id = addNode(ctx, name, parentId ? "method" : "function", child, parentId);
            ctx.nodes[ctx.nodes.length - 1].language = "python";
            const body = child.childForFieldName("body");
            if (body) extractCalls(body, ctx, id);
          }
          break;
        }
        case "class_definition": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "class", child, null);
            ctx.nodes[ctx.nodes.length - 1].language = "python";
            const superclasses = child.childForFieldName("superclasses");
            if (superclasses) {
              for (let j = 0; j < superclasses.childCount; j++) {
                const sup = superclasses.child(j);
                if (sup && sup.type === "identifier") {
                  ctx.edges.push({
                    id: ctx.nextEdgeId++,
                    fromId: id,
                    toId: -1,
                    kind: "extends",
                    file: ctx.file,
                    line: sup.startPosition.row + 1
                  });
                }
              }
            }
            const body = child.childForFieldName("body");
            if (body) extractModule(body, ctx, id);
          }
          break;
        }
        case "decorated_definition": {
          extractModule(child, ctx, parentId);
          break;
        }
        default:
          extractModule(child, ctx, parentId);
          break;
      }
    } catch {
      extractModule(child, ctx, parentId);
    }
  }
}

// src/engine/extraction/languages/go.ts
async function extractGo(file, source, startNodeId, startEdgeId) {
  const lang = await loadLanguage("go");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  try {
    extractSourceFile(tree.rootNode, ctx);
  } finally {
  }
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractSourceFile(node, ctx) {
  let currentStructId = null;
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
          let parentId = null;
          if (receiver) {
            const typeNode = findTypeInReceiver(receiver, ctx);
            if (typeNode) {
              qName = `${typeNode}.${name}`;
              for (const n of ctx.nodes) {
                if (n.name === typeNode && n.kind === "class") {
                  parentId = n.id;
                  break;
                }
              }
            }
          }
          if (name) {
            const id = addNode(ctx, name, "method", child, parentId, qName);
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
              const id = addNode(ctx, name, "class", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
              currentStructId = id;
            } else if (typeChild.type === "interface_type") {
              const id = addNode(ctx, name, "interface", spec, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = "go";
            }
          }
          break;
        }
        case "method_declaration":
          break;
        default:
          extractSourceFile(child, ctx);
          break;
      }
    } catch {
      extractSourceFile(child, ctx);
    }
  }
}
function findTypeInReceiver(node, ctx) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "type_identifier") {
      return ctx.source.slice(child.startIndex, child.endIndex);
    }
    if (child.type === "pointer_type") {
      const inner = child.child(0);
      if (inner && inner.type === "type_identifier") {
        return ctx.source.slice(inner.startIndex, inner.endIndex);
      }
    }
  }
  return null;
}

// src/engine/extraction/languages/rust.ts
async function extractRust(file, source, startNodeId, startEdgeId) {
  const lang = await loadLanguage("rust");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  try {
    extractModule2(tree.rootNode, ctx, null);
  } finally {
  }
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractModule2(node, ctx, currentImpl) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    try {
      switch (child.type) {
        case "function_item": {
          const name = getName(child, ctx);
          if (name) {
            const kind = currentImpl ? "method" : "function";
            const parentId = currentImpl ? findStructId(ctx, currentImpl.type) : null;
            const qName = currentImpl ? `${currentImpl.type}::${name}` : name;
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
            if (traitName) {
              const structNode = findStructId(ctx, typeName);
              const traitNode2 = findTraitId(ctx, traitName);
              if (structNode) {
                ctx.edges.push({
                  id: ctx.nextEdgeId++,
                  fromId: structNode,
                  toId: traitNode2 ?? -1,
                  kind: "implements",
                  file: ctx.file,
                  line: child.startPosition.row + 1
                });
              }
            }
            extractModule2(child, ctx, { type: typeName });
          }
          break;
        }
        default:
          extractModule2(child, ctx, currentImpl);
          break;
      }
    } catch {
      extractModule2(child, ctx, currentImpl);
    }
  }
}
function findStructId(ctx, name) {
  for (const n of ctx.nodes) {
    if (n.name === name && n.kind === "class") return n.id;
  }
  return null;
}
function findTraitId(ctx, name) {
  for (const n of ctx.nodes) {
    if (n.name === name && n.kind === "interface") return n.id;
  }
  return null;
}

// src/engine/extraction/languages/java.ts
async function extractJava(file, source, startNodeId, startEdgeId) {
  const lang = await loadLanguage("java");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  try {
    extractProgram(tree.rootNode, ctx, null);
  } finally {
  }
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractProgram(node, ctx, parentId) {
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
                  line: sup.startPosition.row + 1
                });
              }
            }
          }
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
                  line: iface.startPosition.row + 1
                });
              }
            }
          }
          const body = child.childForFieldName("body");
          if (body) {
            extractInnerDeclarations(body, ctx, id);
            extractMethods(body, ctx, id, name);
          }
          break;
        }
        case "interface_declaration": {
          const name = getName(child, ctx);
          if (name) {
            const id = addNode(ctx, name, "interface", child, null, name);
            ctx.nodes[ctx.nodes.length - 1].language = "java";
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
                    line: sup.startPosition.row + 1
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
function extractInnerDeclarations(node, ctx, parentId) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "class_declaration" || child.type === "interface_declaration" || child.type === "enum_declaration") {
      extractProgram(child, ctx, parentId);
    }
  }
}
function extractMethods(node, ctx, parentId, parentName) {
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
        if (name && name !== parentName) {
          const id = addNode(ctx, name, "method", child, parentId, `${parentName}.${name}`);
          ctx.nodes[ctx.nodes.length - 1].language = "java";
        }
      }
    } catch {
    }
  }
}

// src/engine/extraction/languages/c-cpp.ts
async function extractC(source, file, startNodeId, startEdgeId, langName) {
  const lang = await loadLanguage(langName === "cpp" ? "cpp" : "c");
  const tree = await parseSource(source, lang);
  const ctx = createContext(file, source, startNodeId, startEdgeId);
  extractTranslationUnit(tree.rootNode, ctx);
  return { nodes: ctx.nodes, edges: ctx.edges };
}
function extractTranslationUnit(node, ctx) {
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
          const declarator = child.childForFieldName("declarator");
          const type = child.childForFieldName("type");
          if (declarator && type && type.type === "struct_specifier") {
            const name = extractFunctionName(declarator, ctx);
            if (name) {
              addNode(ctx, name, "class", child, null, name);
              ctx.nodes[ctx.nodes.length - 1].language = ctx.file.includes(".cpp") || ctx.file.includes(".hpp") || ctx.file.includes(".cc") ? "cpp" : "c";
            }
          } else if (declarator) {
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
function extractFunctionName(declarator, ctx) {
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

// src/engine/extraction/discover.ts
import { readFileSync as readFileSync2, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ignore from "ignore";
var DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  ".nuxt",
  "coverage",
  ".codeindex",
  ".codegraph"
];
function loadGitignore(projectRoot) {
  const ig = ignore();
  ig.add(DEFAULT_EXCLUDES.map((d) => `/${d}/`));
  ig.add(DEFAULT_EXCLUDES.map((d) => `/${d}`));
  try {
    const content = readFileSync2(join(projectRoot, ".gitignore"), "utf-8");
    ig.add(content);
  } catch {
  }
  return ig;
}
function discoverFiles(projectRoot) {
  const ig = loadGitignore(projectRoot);
  const files = [];
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relativePath = relative(projectRoot, fullPath);
      if (ig.ignores(relativePath)) continue;
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && stat.size < 1e6) {
        if (getLanguage(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  }
  walk(projectRoot);
  return files;
}

// src/engine/extraction/index.ts
async function extractFile(file, startNodeId, startEdgeId) {
  const lang = getLanguage(file);
  if (!lang) return { nodes: [], edges: [] };
  const source = readFileSync3(file, "utf-8");
  if (!source.trim() || source.length > 1e6) {
    return { nodes: [], edges: [] };
  }
  try {
    return await extractByLanguage(lang, file, source, startNodeId, startEdgeId);
  } catch {
    return { nodes: [], edges: [] };
  }
}
async function extractByLanguage(lang, file, source, startNodeId, startEdgeId) {
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
async function indexProject(db, projectRoot, onProgress) {
  const files = discoverFiles(projectRoot);
  onProgress?.({ phase: "discovering", current: files.length, total: files.length });
  let nodeId = 1;
  let edgeId = 1;
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
        console.error(`Failed to index ${file}:`, err.message);
      }
    }
  }
  onProgress?.({ phase: "resolving", current: files.length, total: files.length });
  try {
    const { resolveCrossFileReferences: resolveCrossFileReferences2 } = await Promise.resolve().then(() => (init_cross_file(), cross_file_exports));
    const resolved = resolveCrossFileReferences2(db);
    if (resolved > 0) {
      console.log(`Resolved ${resolved} cross-file references`);
    }
    const remaining = db.prepare("SELECT COUNT(*) as c FROM edges WHERE to_id = -1").get();
    if (remaining.c > 0) {
      console.log(`${remaining.c} unresolved references (external packages etc.)`);
    }
  } catch (err) {
    console.error("Cross-file resolution failed:", err.message);
  }
  onProgress?.({ phase: "done", current: files.length, total: files.length });
}
function saveExtraction(db, file, language, nodes, edges) {
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
    db.prepare("DELETE FROM edges WHERE file = ?").run(file);
    db.prepare("DELETE FROM nodes WHERE file = ?").run(file);
    insertFile.run(file, language, Date.now());
    for (const node of nodes) {
      insertNode.run(
        node.id,
        node.name,
        node.kind,
        node.file,
        node.line,
        node.column,
        node.startLine,
        node.endLine,
        node.language,
        node.parentId,
        node.qualifiedName
      );
    }
    for (const edge of edges) {
      insertEdge.run(edge.id, edge.fromId, edge.toId, edge.kind, edge.file, edge.line, edge.label ?? null);
    }
  });
  transaction();
}

// src/engine/index.ts
var DATA_DIR = ".codeindex";
var CodeIndexEngine = class {
  db = null;
  /** 获取底层数据库实例（供文件监听等内部模块使用） */
  get rawDb() {
    return this.db;
  }
  projectRoot;
  dbPath;
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.dbPath = join2(projectRoot, DATA_DIR, "codeindex.db");
  }
  /** 初始化或打开数据库 */
  async init() {
    const dataDir = join2(this.projectRoot, DATA_DIR);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.db = initDatabase(this.dbPath);
  }
  /** 打开已有数据库（不重新初始化） */
  async open() {
    if (!existsSync(this.dbPath)) return false;
    this.db = new adapter_default(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    return true;
  }
  /** 是否已初始化 */
  get initialized() {
    return this.db !== null;
  }
  /** 完整索引 */
  async indexAll(options) {
    if (!this.db) throw new Error("Database not initialized");
    await indexProject(this.db, this.projectRoot, options?.onProgress);
  }
  // ═══════════════════════════════════
  //  查询方法
  // ═══════════════════════════════════
  search(query, options) {
    if (!this.db) throw new Error("Database not initialized");
    return searchNodes(this.db, query, options);
  }
  getCallers(nodeId, limit) {
    if (!this.db) throw new Error("Database not initialized");
    return getCallers(this.db, nodeId, limit);
  }
  getCallees(nodeId, limit) {
    if (!this.db) throw new Error("Database not initialized");
    return getCallees(this.db, nodeId, limit);
  }
  getReferences(nodeId, limit) {
    if (!this.db) throw new Error("Database not initialized");
    return getReferences(this.db, nodeId, limit);
  }
  getNode(nodeId) {
    if (!this.db) throw new Error("Database not initialized");
    return getNode(this.db, nodeId);
  }
  getNodeByName(name, file) {
    if (!this.db) throw new Error("Database not initialized");
    return getNodeByName(this.db, name, file);
  }
  getImpactRadius(nodeId, depth) {
    if (!this.db) throw new Error("Database not initialized");
    return getImpactRadius(this.db, nodeId, depth);
  }
  buildContext(task, options) {
    if (!this.db) throw new Error("Database not initialized");
    return buildContext(this.db, task, options);
  }
  explore(nodeIds, options) {
    if (!this.db) throw new Error("Database not initialized");
    return exploreNodes(this.db, nodeIds, options);
  }
  getStats() {
    if (!this.db) throw new Error("Database not initialized");
    return getStats(this.db);
  }
  getFiles(options) {
    if (!this.db) throw new Error("Database not initialized");
    return getFiles(this.db, options);
  }
  /** 关闭数据库 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
};
async function loadEngine(projectRoot) {
  const engine = new CodeIndexEngine(projectRoot);
  const opened = await engine.open();
  return opened ? engine : null;
}
function isInitialized(projectRoot) {
  return existsSync(join2(projectRoot, DATA_DIR, "codeindex.db"));
}

// src/cli.ts
function printHelp() {
  console.log(`pi-code-index \u2014 local code knowledge graph for agent workflows

Usage:
  pi-code-index <action> <project> [args...] [options]

Actions:
  init <project>                         Initialize or rebuild the index
  status <project>                       Show index health and statistics
  files <project> [--filter text]        List indexed files
  search <project> <query>               Search symbols by name or text
  context <project> <task>               Build relevant code context for a task
  callers <project> <id|symbol>          Find callers of a symbol
  callees <project> <id|symbol>          Find callees of a symbol
  impact <project> <id|symbol>           Analyze change impact radius
  explore <project> <id,id,...>          Explore related symbols and files

Options:
  --json                                 Print machine-readable JSON
  --limit <n>                            Limit result count
  --depth <n>                            Graph traversal depth
  --filter <text>                        Filter files
  -h, --help                             Show this help

Examples:
  pi-code-index init .
  pi-code-index search . "CodeIndexEngine" --json
  pi-code-index context . "make this project usable as a skill"
  pi-code-index impact . 12 --depth 2 --json
`);
}
function parseArgs(argv) {
  const positional = [];
  const options = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--limit") {
      options.limit = Number(argv[++i]);
    } else if (arg === "--depth") {
      options.depth = Number(argv[++i]);
    } else if (arg === "--filter") {
      options.filter = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      positional.push("help");
    } else {
      positional.push(arg);
    }
  }
  return { positional, options };
}
function isNumeric(value) {
  return /^\d+$/.test(value);
}
function output(options, text, payload = {}) {
  if (options.json) {
    console.log(JSON.stringify({ ok: true, message: text, ...payload }, null, 2));
  } else {
    console.log(text);
  }
}
function fail(options, message, exitCode = 1) {
  if (options.json) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(exitCode);
}
async function openRequiredEngine(projectRoot, options) {
  const engine = await loadEngine(projectRoot);
  if (!engine) {
    fail(options, `Index not initialized at ${projectRoot}. Run: pi-code-index init ${projectRoot}`);
  }
  return engine;
}
async function rebuild(projectRoot, options) {
  const engine = new CodeIndexEngine(projectRoot);
  await engine.init();
  await engine.indexAll({
    onProgress: (progress) => {
      if (!options.json) {
        process.stderr.write(`\r${progress.phase}: ${progress.current}/${progress.total}`);
      }
    }
  });
  if (!options.json) process.stderr.write("\n");
  const stats = engine.getStats();
  engine.close();
  output(options, `Index ready: ${stats.totalFiles} files, ${stats.totalNodes} symbols, ${stats.totalEdges} relations.`, { stats });
}
function resolveFirstNode(engine, symbolOrId, options) {
  if (isNumeric(symbolOrId)) {
    const node = engine.getNode(Number(symbolOrId));
    if (!node) fail(options, `Symbol id not found: ${symbolOrId}`);
    return node;
  }
  const matches = engine.getNodeByName(symbolOrId);
  if (matches.length === 0) fail(options, `Symbol not found: ${symbolOrId}. Try search first.`);
  return matches[0];
}
async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  const [action, projectArg, ...rest] = positional;
  if (!action || action === "help") {
    printHelp();
    return;
  }
  if (!projectArg) fail(options, "Missing <project>. Run pi-code-index --help for usage.");
  const projectRoot = resolve(projectArg);
  if (action === "init") {
    await rebuild(projectRoot, options);
    return;
  }
  if (action === "status" && !isInitialized(projectRoot)) {
    output(options, `Index not initialized at ${projectRoot}.`, { initialized: false, projectRoot });
    return;
  }
  const engine = await openRequiredEngine(projectRoot, options);
  try {
    if (action === "status") {
      const stats = engine.getStats();
      output(options, `Index status: ${stats.totalFiles} files, ${stats.totalNodes} symbols, ${stats.totalEdges} relations.`, {
        initialized: true,
        projectRoot,
        stats
      });
      return;
    }
    if (action === "files") {
      const fileFilter = options.filter ?? (rest.join(" ") || void 0);
      const files = engine.getFiles({ filter: fileFilter });
      output(options, files.map((f) => `- ${f.path} (${f.language}, ${f.nodes} symbols)`).join("\n") || "No files.", { files });
      return;
    }
    if (action === "search") {
      const query = rest.join(" ").trim();
      if (!query) fail(options, "Missing search query.");
      const results = engine.search(query, { limit: options.limit ?? 20 });
      output(options, results.map((r) => `[${r.node.id}] ${r.node.name} (${r.node.kind}) \u2014 ${r.node.file}:${r.node.line}`).join("\n") || "No results.", {
        query,
        results
      });
      return;
    }
    if (action === "context") {
      const task = rest.join(" ").trim();
      if (!task) fail(options, "Missing task text.");
      const result = engine.buildContext(task, { maxNodes: options.limit ?? 10, maxFiles: 5 });
      output(
        options,
        [
          `Relevant symbols: ${result.symbols.length}`,
          ...result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) \u2014 ${s.file}:${s.startLine}`),
          "",
          `Files: ${result.files.length}`,
          ...result.files.map((f) => `- ${f}`)
        ].join("\n"),
        { task, result }
      );
      return;
    }
    if (action === "callers" || action === "callees" || action === "impact") {
      const target = rest.join(" ").trim();
      if (!target) fail(options, `Missing symbol id or name for ${action}.`);
      const node = resolveFirstNode(engine, target, options);
      if (action === "callers") {
        const callers = engine.getCallers(node.id, options.limit ?? 20);
        output(options, callers.map((c) => `[${c.id}] ${c.name} \u2014 ${c.file}:${c.line}`).join("\n") || "No callers.", { symbol: node, callers });
        return;
      }
      if (action === "callees") {
        const callees = engine.getCallees(node.id, options.limit ?? 20);
        output(options, callees.map((c) => `[${c.id}] ${c.name} \u2014 ${c.file}:${c.line}`).join("\n") || "No callees.", { symbol: node, callees });
        return;
      }
      const impact = engine.getImpactRadius(node.id, options.depth ?? 2);
      output(
        options,
        [`${impact.symbol.name} impact`, `Callers: ${impact.callers.length}`, `Callees: ${impact.callees.length}`, `Affected: ${impact.affected.length}`].join("\n"),
        { impact }
      );
      return;
    }
    if (action === "explore") {
      const ids = rest.join(" ").split(",").map((id) => Number(id.trim())).filter((id) => Number.isFinite(id));
      if (ids.length === 0) fail(options, "Missing ids. Example: pi-code-index explore . 1,2,3");
      const result = engine.explore(ids, { maxDepth: options.depth ?? 2, maxNodes: options.limit ?? 20 });
      output(options, result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) \u2014 ${s.file}:${s.startLine}-${s.endLine}`).join("\n") || "No results.", { ids, result });
      return;
    }
    fail(options, `Unknown action: ${action}`);
  } finally {
    engine.close();
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
