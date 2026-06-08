/**
 * pi-code-index — AI 驱动的代码知识图谱
 *
 * 三层能力：
 * 1. AI 开工前 → 智能上下文预注入（省掉探索的 token）
 * 2. AI 工作中 → 快速查询工具（搜符号、查调用、看影响）
 * 3. AI 改完后 → 变更影响检查（有没有踩坑）
 */

// ── 共享类型 ──

/** 符号类型 */
export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "enum"
  | "type_alias"
  | "variable"
  | "module"
  | "route";

/** 关系类型 */
export type EdgeKind =
  | "calls"
  | "imports"
  | "extends"
  | "implements"
  | "references"
  | "defines";

/** 图中的一个节点（代码符号） */
export interface SymbolNode {
  id: number;
  name: string;
  kind: SymbolKind;
  file: string;
  line: number;
  column: number;
  language: string;
  /** 符号所在代码片段的起始行 */
  startLine: number;
  /** 符号所在代码片段的结束行 */
  endLine: number;
  /** 父符号 ID（如方法是类的方法） */
  parentId: number | null;
  /** 所属包的完整限定名 */
  qualifiedName: string | null;
}

/** 图中的一个边（符号间关系） */
export interface SymbolEdge {
  id: number;
  fromId: number;
  toId: number;
  kind: EdgeKind;
  file: string;
  line: number;
}

/** 索引统计信息 */
export interface IndexStats {
  totalFiles: number;
  totalNodes: number;
  totalEdges: number;
  languages: Record<string, number>;
  lastIndexed: number | null;
}

/** 支持的编程语言 */
export const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** 文件扩展名 → 语言映射 */
export const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
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
};

/** 根据文件路径获取语言 */
export function getLanguage(filePath: string): SupportedLanguage | null {
  for (const [ext, lang] of Object.entries(EXTENSION_TO_LANGUAGE)) {
    if (filePath.endsWith(ext)) return lang;
  }
  return null;
}
