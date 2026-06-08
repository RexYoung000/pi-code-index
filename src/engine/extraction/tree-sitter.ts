/**
 * tree-sitter 封装
 *
 * 关键：必须先调用 Parser.init()（初始化 Emscripten 运行时），
 * 然后才能使用 Language.load()。
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const _req = createRequire(import.meta.url);
const wts: any = _req("web-tree-sitter");

/** 确保 Parser 已初始化 */
let wtsReady = false;
async function ensureInit(): Promise<void> {
  if (wtsReady) return;
  await wts.Parser.init();
  wtsReady = true;
}

let parser: any = null;
let parserInitPromise: Promise<any> | null = null;
const languageCache = new Map<string, any>();

export async function getParser(): Promise<any> {
  await ensureInit();
  if (parser) return parser;
  if (parserInitPromise) return parserInitPromise;

  parserInitPromise = (async () => {
    parser = new wts.Parser();
    return parser;
  })();

  return parserInitPromise;
}

export async function loadLanguage(langName: string): Promise<any> {
  await ensureInit(); // 必须先初始化 Emscripten 运行时

  const cached = languageCache.get(langName);
  if (cached) return cached;

  const wasmPath = _req.resolve(`tree-sitter-wasms/out/tree-sitter-${langName}.wasm`);
  const wasmBuffer = readFileSync(wasmPath);

  const lang = await wts.Language.load(wasmBuffer);
  languageCache.set(langName, lang);
  return lang;
}

export async function parseSource(source: string, language: any): Promise<any> {
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
  wtsReady = false;
}
