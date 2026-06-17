/**
 * pi-code-index — Pi 扩展入口
 * 单工具版：减少工具 schema token 开销，符合“省 token”初衷。
 */

import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { CodeIndexEngine, loadEngine, isInitialized } from "./engine/index";
import { FileWatcher } from "./engine/sync/index";
import { getStatusText } from "./ui/index";

let engine: CodeIndexEngine | null = null;
let watcher: FileWatcher | null = null;
const editedFilesInSession = new Set<string>();

async function rebuildIndex(cwd: string, onProgress?: (phase: string, current: number, total: number) => void) {
  if (watcher) {
    watcher.stop();
    watcher = null;
  }
  if (engine) {
    engine.close();
    engine = null;
  }

  const next = new CodeIndexEngine(cwd);
  await next.init();
  await next.indexAll({
    onProgress: (p) => onProgress?.(p.phase, p.current, p.total),
  });

  engine = next;
  watcher = new FileWatcher(engine, cwd);
  watcher.start();
  return engine.getStats();
}

function resolveNodes(nodeId?: number, name?: string, file?: string) {
  if (!engine) return [];
  if (nodeId) {
    const node = engine.getNode(nodeId);
    return node ? [node] : [];
  }
  if (name) return engine.getNodeByName(name, file);
  return [];
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  // 统一截断：避免大结果撑爆 LLM 上下文 / 导致压缩失败（官方 50KB / 2000 行上限）
  const trunc = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  let out = trunc.content;
  if (trunc.truncated) {
    out += `\n\n[结果已截断：显示 ${trunc.outputLines}/${trunc.totalLines} 行（${formatSize(trunc.outputBytes)} / ${formatSize(trunc.totalBytes)}）。请用更精确的 query 或更小的 limit 缩小范围。]`;
  }
  return { content: [{ type: "text" as const, text: out }], details };
}

export default function (pi: ExtensionAPI) {
  let codeindexToolRegistered = false;
  const ensureCodeindexTool = () => {
    if (codeindexToolRegistered) return;
    codeindexToolRegistered = true;
    registerCodeindexTool();
  };

  // ── 自定义消息渲染 ──
  pi.registerMessageRenderer("codeindex-context", (message, _options, theme) => {
    const content = typeof message.content === "string" ? message.content : "";
    return new Text(theme.fg("accent", content), 0, 0);
  });

  pi.registerMessageRenderer("codeindex-impact", (message, _options, theme) => {
    const content = typeof message.content === "string" ? message.content : "";
    return new Text(theme.fg("warning", content), 0, 0);
  });

  // ── 生命周期：加载索引 + 文件监听 ──
  pi.on("session_start", async (_event, ctx) => {
    if (isInitialized(ctx.cwd)) {
      engine = await loadEngine(ctx.cwd);
      if (engine) {
        watcher = new FileWatcher(engine, ctx.cwd);
        watcher.start();
        ctx.ui.setStatus("code-index", getStatusText(engine));
        ctx.ui.setWidget("code-index", [
          getStatusText(engine),
          "文件监听已启动 · 使用 /codeindex-init 重建索引",
        ]);
        ensureCodeindexTool();
      }
    } else {
      ctx.ui.setStatus("code-index", "📊 未索引 — 使用 /codeindex-init 初始化");

    }
  });

  pi.on("session_shutdown", async () => {
    watcher?.stop();
    watcher = null;
    engine?.close();
    engine = null;
  });

  // ── 追踪编辑文件，用于改完后影响检查 ──
  pi.on("agent_start", async () => editedFilesInSession.clear());

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    const path = (event.input as any)?.path;
    if (typeof path === "string") {
      editedFilesInSession.add(path.startsWith("/") ? path : `${ctx.cwd}/${path}`);
    }
  });

  // ── 开工前：轻量代码地图预注入 ──
  pi.on("before_agent_start", async (event) => {
    if (!engine || !event.prompt || event.prompt.length < 5) return;
    try {
      const ctx = engine.buildContext(event.prompt, { maxNodes: 6, maxFiles: 3 });
      if (ctx.symbols.length === 0) return;
      const symbols = ctx.symbols
        .map((s) => `- [${s.id}] ${s.name} (${s.kind}) — ${s.file}:${s.startLine}`)
        .join("\n");
      return {
        message: {
          customType: "codeindex-context",
          content: `## 代码索引上下文\n${symbols}\n\n可用 codeindex(action=explore) 查看更多关系。`,
          display: true,
        },
      };
    } catch {
      return;
    }
  });

  // ── 改完后：影响提示 ──
  pi.on("agent_end", async () => {
    if (!engine || editedFilesInSession.size === 0) return;
    const impacted: string[] = [];
    for (const file of editedFilesInSession) {
      for (const { node } of engine.search("", { file, limit: 8 })) {
        try {
          const impact = engine.getImpactRadius(node.id, 2);
          if (impact.affected.length > 3) {
            impacted.push(`- ${node.name} → 影响 ${impact.affected.length} 个符号`);
          }
        } catch {
          // ignore
        }
      }
    }
    editedFilesInSession.clear();
    if (impacted.length > 0) {
      pi.sendMessage({
        customType: "codeindex-impact",
        content: `## 变更影响提示\n${impacted.join("\n")}\n\n建议使用 codeindex(action=impact) 查看详情。`,
        display: true,
      });
    }
  });

  // ── 用户命令：初始化索引 ──
  pi.registerCommand("codeindex-init", {
    description: "初始化或重建代码索引",
    handler: async (_args, ctx) => {
      ctx.ui.notify("正在初始化代码索引...", "info");
      try {
        const stats = await rebuildIndex(ctx.cwd, (phase, current, total) => {
          if (current === total) ctx.ui.setStatus("code-index", `📂 ${phase}: ${total} 文件`);
        });
        ctx.ui.setStatus("code-index", getStatusText(engine));
        ctx.ui.setWidget("code-index", [getStatusText(engine), "文件监听已启动"]);
        ensureCodeindexTool();
        ctx.ui.notify(`索引完成：${stats.totalFiles} 文件，${stats.totalNodes} 符号`, "info");
      } catch (e: any) {
        ctx.ui.notify(`索引失败：${e.message}`, "error");
      }
    },
  });

  // ── 单一 AI 工具：减少 schema token ──
  function registerCodeindexTool() {
    pi.registerTool({
    name: "codeindex",
    label: "代码索引",
    description: "Query local code index. actions: init/search/context/callers/callees/impact/explore/status/files.",
    promptSnippet: "Query local code index for symbols, context, calls, impact, files, status, init",
    parameters: Type.Object({
      action: StringEnum(
        ["init", "search", "context", "callers", "callees", "impact", "explore", "status", "files"] as const,
        { description: "要执行的操作" },
      ),
      query: Type.Optional(Type.String({ description: "search text, task text, symbol name, or file filter" })),
      id: Type.Optional(Type.Number({ description: "symbol id" })),
      ids: Type.Optional(Type.Array(Type.Number(), { description: "symbol ids" })),
      limit: Type.Optional(Type.Number({ description: "result limit" })),
      depth: Type.Optional(Type.Number({ description: "graph depth" })),
    }),
    async execute(_id, params, _signal, onUpdate, ctx) {
      const action = params.action;

      if (action === "init") {
        const stats = await rebuildIndex(ctx.cwd, (phase, current, total) => {
          onUpdate?.({ content: [{ type: "text", text: `${phase}: ${current}/${total}` }], details: {} });
        });
        return textResult(`索引完成：${stats.totalFiles} 文件，${stats.totalNodes} 符号，${stats.totalEdges} 关系。`, { stats });
      }

      if (!engine) return textResult("代码索引未初始化。请先运行 /codeindex-init 或 codeindex(action=init)。");

      if (action === "status") {
        const stats = engine.getStats();
        return textResult(`索引状态：${stats.totalFiles} 文件，${stats.totalNodes} 符号，${stats.totalEdges} 关系。`, { stats });
      }

      if (action === "files") {
        const files = engine.getFiles({ filter: params.query });
        return textResult(files.map((f) => `- ${f.path} (${f.language}, ${f.nodes} symbols)`).join("\n") || "无文件", { files });
      }

      if (action === "search") {
        const results = engine.search(params.query ?? "", {
          limit: params.limit ?? 15,
        });
        return textResult(results.map((r) => `[${r.node.id}] ${r.node.name} (${r.node.kind}) — ${r.node.file}:${r.node.line}`).join("\n") || "无结果", { results: results.map((r) => r.node) });
      }

      if (action === "context") {
        const result = engine.buildContext(params.query ?? "", { maxNodes: params.limit ?? 10, maxFiles: 5 });
        return textResult(
          [
            `相关符号：${result.symbols.length}`,
            ...result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) — ${s.file}:${s.startLine}`),
            "",
            `涉及文件：${result.files.length}`,
            ...result.files.map((f) => `- ${f}`),
          ].join("\n"),
          result as any
        );
      }

      if (action === "callers" || action === "callees" || action === "impact") {
        const nodes = resolveNodes(params.id, params.query);
        if (nodes.length === 0) return textResult("未找到指定符号。请先 action=search。");
        const node = nodes[0];
        if (action === "callers") {
          const callers = engine.getCallers(node.id, params.limit ?? 20);
          return textResult(callers.map((c) => `[${c.id}] ${c.name} — ${c.file}:${c.line}`).join("\n") || "无调用者", { callers });
        }
        if (action === "callees") {
          const callees = engine.getCallees(node.id, params.limit ?? 20);
          return textResult(callees.map((c) => `[${c.id}] ${c.name} — ${c.file}:${c.line}`).join("\n") || "无被调用者", { callees });
        }
        const impact = engine.getImpactRadius(node.id, params.depth ?? 2);
        return textResult(
          [`${impact.symbol.name} 影响分析`, `调用者：${impact.callers.length}`, `被调用者：${impact.callees.length}`, `影响范围：${impact.affected.length}`].join("\n"),
          { impact }
        );
      }

      if (action === "explore") {
        const ids = params.ids?.length ? params.ids : params.id ? [params.id] : [];
        if (ids.length === 0) return textResult("缺少 nodeId/nodeIds。请先 action=search。");
        const result = engine.explore(ids, { maxDepth: params.depth ?? 2, maxNodes: params.limit ?? 20 });
        return textResult(
          result.symbols.map((s) => `[${s.id}] ${s.name} (${s.kind}) — ${s.file}:${s.startLine}-${s.endLine}`).join("\n") || "无结果",
          result as any
        );
      }

      return textResult(`未知 action: ${action}`);
    },
  });
  }
}
