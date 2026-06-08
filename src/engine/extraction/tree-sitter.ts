/**
 * tree-sitter 封装
 * 管理 WASM 运行时和语言语法加载
 */

import { Parser, Language } from "web-tree-sitter";
import type { Tree, Node } from "web-tree-sitter";

// Re-export for use by extractors
export type { Tree, Node };

let parser: Parser | null = null;
let parserInitPromise: Promise<Parser> | null = null;
const languageCache = new Map<string, Language>();

export async function getParser(): Promise<Parser> {
  if (parser) return parser;
  if (parserInitPromise) return parserInitPromise;

  parserInitPromise = (async () => {
    await Parser.init();
    parser = new Parser();
    return parser;
  })();

  return parserInitPromise;
}

export async function loadLanguage(langName: string): Promise<Language> {
  const cached = languageCache.get(langName);
  if (cached) return cached;

  let wasmPath: string;
  try {
    wasmPath = require.resolve(`tree-sitter-wasms/out/tree-sitter-${langName}.wasm`);
  } catch {
    try {
      wasmPath = require.resolve(`tree-sitter-${langName}.wasm`);
    } catch {
      throw new Error(
        `Language grammar not found: ${langName}. Install tree-sitter-wasms.`
      );
    }
  }

  const lang = await Language.load(wasmPath);
  languageCache.set(langName, lang);
  return lang;
}

export async function parseSource(source: string, language: Language): Promise<Tree> {
  const p = await getParser();
  p.setLanguage(language);
  const tree = p.parse(source);
  if (!tree) throw new Error("Failed to parse source");
  return tree;
}

export function resetParser(): void {
  parser = null;
  parserInitPromise = null;
  languageCache.clear();
}
