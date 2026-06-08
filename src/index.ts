/**
 * pi-code-index — Pi 扩展入口
 *
 * 为 AI 编程助手提供代码知识图谱能力：
 * 1. 开工前预注入上下文（减少探索 token）
 * 2. 工作中快速查询（搜索、调用分析、影响分析）
 * 3. 改完后影响检查（是否踩坑）
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Text } from "@earendil-works/pi-tui";
import { CodeIndexEngine, loadEngine, isInitialized } from "./engine/index";
import { FileWatcher } from "./engine/sync/index";
import { getStatusText } from "./ui/index";
import type { SymbolKind } from "./engine/types";

/** 全局引擎实例（每个会话一份） */
let engine: CodeIndexEngine | null = null;
/** 文件监听器 */
let watcher: FileWatcher | null = null;
/** 当前会话中修改过的文件（通过 tool_call 事件追踪） */
const editedFilesInSession = new Set<string>();

export default function (pi: ExtensionAPI) {
  // ═══════════════════════════════════════
  //  注册消息渲染器
  // ═══════════════════════════════════════

  pi.registerMessageRenderer("codeindex-context", (message, _options, theme) => {
    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((c: any) => c.text || "").join("")
        : "";
    return new Text(theme.fg("accent", content), 0, 0);
  });

  pi.registerMessageRenderer("codeindex-impact", (message, _options, theme) => {
    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((c: any) => c.text || "").join("")
        : "";
    return new Text(theme.fg("warning", content), 0, 0);
  });

  // ═══════════════════════════════════════════
  //  生命周期：会话启动时自动检测和加载索引
  // ═══════════════════════════════════════════

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;

    if (isInitialized(cwd)) {
      engine = await loadEngine(cwd);
      if (engine) {
        // 启动文件监听，自动增量同步
        watcher = new FileWatcher(engine, cwd);
        watcher.start();

        ctx.ui.setStatus("code-index", getStatusText(engine));
        ctx.ui.setWidget("code-index", [
          getStatusText(engine),
          "文件监听已启动 · 使用 /codeindex-init 重建索引",
        ]);
      }
    } else {
      ctx.ui.setStatus("code-index", "📊 未索引 — 使用 /codeindex-init 初始化");
    }
  });

  // ═══════════════════════════════════════
  //  命令：手动初始化索引
  // ═══════════════════════════════════════

  pi.registerCommand("codeindex-init", {
    description: "初始化或重建代码索引",
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd;
      ctx.ui.notify("正在初始化代码索引...", "info");

      try {
        const newEngine = new CodeIndexEngine(cwd);
        await newEngine.init();
        await newEngine.indexAll({
          onProgress: (p) => {
            if (p.current === p.total) {
              ctx.ui.setStatus("code-index", `📂 ${p.phase}: ${p.total} 个文件`);
            }
          },
        });

        // 更新全局 engine
        if (engine) engine.close();
        if (watcher) watcher.stop();
        engine = newEngine;
        watcher = new FileWatcher(engine, cwd);
        watcher.start();

        const stats = engine.getStats();
        ctx.ui.setStatus("code-index", getStatusText(engine));
        ctx.ui.notify(
          `索引完成！${stats.totalFiles} 个文件，${stats.totalNodes} 个符号`,
          "info"
        );
      } catch (e: any) {
        ctx.ui.notify(`索引失败: ${e.message}`, "error");
      }
    },
  });

  // ═══════════════════════════════════════════
  //  能力 1：AI 开工前 — 智能上下文预注入
  // ═══════════════════════════════════════════

  pi.on("before_agent_start", async (event, ctx) => {
    if (!engine) return;

    const prompt = event.prompt;
    if (!prompt || prompt.length < 5) return;

    try {
      // 根据用户的任务描述，从索引中拉取最相关的代码片段
      const context = engine.buildContext(prompt, {
        maxNodes: 8,
        maxFiles: 3,
      });

      if (context.symbols.length === 0) return;

      // 构建上下文注入消息
      const symbolList = context.symbols
        .map((s) => `- \`${s.name}\` (${s.kind}) — ${s.file}:${s.startLine}`)
        .join("\n");

      const message = [
        "## 📊 代码索引上下文",
        "",
        `根据你的任务「${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}」，以下是相关代码：`,
        "",
        symbolList,
        "",
        `💡 使用 \`codeindex_explore\` 获取这些符号的完整源码。`,
      ].join("\n");

      return {
        message: {
          customType: "codeindex-context",
          content: message,
          display: true,
        },
      };
    } catch {
      // 上下文注入失败不中断流程
    }
  });

  // ═══════════════════════════════════════════
  //  能力 3：AI 改完后 — 变更影响检查
  // ═══════════════════════════════════════════

  pi.on("agent_end", async () => {
    if (!engine || editedFilesInSession.size === 0) return;

    // 对修改过的文件中的主要符号检查影响范围
    const affectedSymbols: string[] = [];
    for (const file of editedFilesInSession) {
      const symbols = engine.search("", { file, limit: 5 });
      for (const { node } of symbols) {
        try {
          const impact = engine.getImpactRadius(node.id, 2);
          if (impact.affected.length > 3) {
            affectedSymbols.push(
              `\`${node.name}\` → 影响 ${impact.affected.length} 个符号`
            );
          }
        } catch {
          // skip
        }
      }
    }

    editedFilesInSession.clear();

    if (affectedSymbols.length > 0) {
      pi.sendMessage({
        customType: "codeindex-impact",
        content: [
          "## ⚠️ 变更影响提示",
          "",
          `${affectedSymbols.length} 个符号的修改影响了较多关联代码：`,
          ...affectedSymbols.map((s) => `- ${s}`),
          "",
          "建议用 \`codeindex_impact\` 查看详情。",
        ].join("\n"),
        display: true,
      });
    }
  });

  // ═══════════════════════════════════════════
  //  能力 2：AI 工作中 — 注册查询工具
  // ═══════════════════════════════════════════

  // ── codeindex_init ──
  pi.registerTool({
    name: "codeindex_init",
    label: "初始化索引",
    description:
      "初始化或重建代码索引。索引完成后自动启动文件监听。",
    promptSnippet: "Initialize or rebuild the code index",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, onUpdate, _ctx) {
      const cwd = _ctx.cwd;

      // 关闭旧引擎
      if (engine) engine.close();
      if (watcher) watcher.stop();

      const newEngine = new CodeIndexEngine(cwd);
      await newEngine.init();

      const eventCount = { count: 0 };
      await newEngine.indexAll({
        onProgress: (p) => {
          eventCount.count++;
          if (eventCount.count % 5 === 0) {
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `${p.phase}: ${p.current}/${p.total}`,
                },
              ],
              details: {},
            });
          }
        },
      });

      engine = newEngine;
      watcher = new FileWatcher(engine, cwd);
      watcher.start();

      const stats = engine.getStats();
      return {
        content: [
          {
            type: "text",
            text: `索引完成！${stats.totalFiles} 个文件，${stats.totalNodes} 个符号，${stats.totalEdges} 条关系。文件监听已启动。`,
          },
        ],
        details: { stats },
      };
    },
  });

  // ── codeindex_search ──
  pi.registerTool({
    name: "codeindex_search",
    label: "搜索符号",
    description:
      "在代码索引中搜索符号（函数、类、方法等）。支持按名称模糊匹配。",
    promptSnippet: "Search the code index for symbols by name",
    promptGuidelines: [
      "Use codeindex_search to quickly find symbols (functions, classes, methods) across the entire codebase before reading files.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "搜索关键词（符号名称）" }),
      kind: Type.Optional(
        Type.String({ description: "过滤符号类型：function, method, class, interface, enum, type_alias" })
      ),
      language: Type.Optional(
        Type.String({ description: "过滤编程语言：typescript, javascript, python, go, rust, java" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "返回结果数量上限，默认 15" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) {
        return {
          content: [{ type: "text", text: "代码索引未初始化。请先运行索引。" }],
          details: {},
        };
      }

      const results = engine.search(params.query, {
        kind: params.kind as SymbolKind | undefined,
        language: params.language,
        limit: params.limit ?? 15,
      });

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `未找到匹配 "${params.query}" 的符号。` }],
          details: { results: [] },
        };
      }

      const text = results
        .map(
          (r, i) =>
            `${i + 1}. \`${r.node.name}\` — ${r.node.kind} | ${r.node.file}:${r.node.line}`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `找到 ${results.length} 个匹配 "${params.query}" 的符号：\n\n${text}`,
          },
        ],
        details: { results: results.map((r) => r.node) },
      };
    },
  });

  // ── codeindex_context ──
  pi.registerTool({
    name: "codeindex_context",
    label: "构建上下文",
    description:
      "根据任务描述，从代码索引中提取最相关的符号和文件上下文。用于快速了解项目结构。",
    promptSnippet: "Get relevant code context for a task from the code index",
    promptGuidelines: [
      "Use codeindex_context at the start of a task to get an overview of relevant code before diving into implementation.",
      "codeindex_context returns symbol names and locations, not source code. Use read to get the actual code.",
    ],
    parameters: Type.Object({
      task: Type.String({ description: "任务描述，用于匹配相关代码" }),
      maxNodes: Type.Optional(
        Type.Number({ description: "最多返回多少个符号，默认 10" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) {
        return {
          content: [{ type: "text", text: "代码索引未初始化。" }],
          details: {},
        };
      }

      const context = engine.buildContext(params.task, {
        maxNodes: params.maxNodes ?? 10,
        maxFiles: 5,
      });

      if (context.symbols.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `未在索引中找到与 "${params.task}" 明确相关的代码。建议使用 codeindex_search 手动搜索。`,
            },
          ],
          details: { symbols: [], files: [] },
        };
      }

      const symbolText = context.symbols
        .map((s) => `- \`${s.name}\` (${s.kind}) — ${s.file}:${s.startLine}-${s.endLine}`)
        .join("\n");

      const fileText = context.files.map((f) => `- ${f}`).join("\n");

      return {
        content: [
          {
            type: "text",
            text: [
              `## 任务「${params.task.slice(0, 100)}」的相关代码：`,
              "",
              `**符号**（${context.symbols.length} 个）：`,
              symbolText,
              "",
              `**涉及文件**（${context.files.length} 个）：`,
              fileText,
            ].join("\n"),
          },
        ],
        details: {
          symbols: context.symbols,
          files: context.files,
          sourceRanges: context.sourceRanges,
        },
      };
    },
  });

  // ── codeindex_callers ──
  pi.registerTool({
    name: "codeindex_callers",
    label: "查询调用者",
    description: "查找哪些符号调用了指定符号（谁在调用它）。",
    promptSnippet: "Find what calls a given symbol",
    parameters: Type.Object({
      nodeId: Type.Optional(
        Type.Number({ description: "符号的 ID（从搜索结果中获取）" })
      ),
      name: Type.Optional(
        Type.String({ description: "符号名称（如果没有 ID）" })
      ),
      file: Type.Optional(
        Type.String({ description: "限定文件路径（可选，缩小范围）" })
      ),
      limit: Type.Optional(
        Type.Number({ description: "返回数量上限，默认 20" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) return { content: [{ type: "text", text: "代码索引未初始化。" }], details: {} };

      const nodes = resolveNodes(
        params.nodeId,
        params.name,
        params.file
      );
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "未找到指定符号。" }], details: {} };
      }

      const limit = params.limit ?? 20;
      const allCallers = nodes.flatMap((n) => engine!.getCallers(n.id, limit));

      if (allCallers.length === 0) {
        return {
          content: [{ type: "text", text: `未找到调用 \`${nodes[0].name}\` 的符号。` }],
          details: {},
        };
      }

      const text = allCallers
        .slice(0, limit)
        .map((c) => `- \`${c.name}\` (${c.kind}) — ${c.file}:${c.line}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `以下 ${Math.min(allCallers.length, limit)} 个符号调用了 \`${nodes[0].name}\`：\n\n${text}`,
          },
        ],
        details: { callers: allCallers.slice(0, limit) },
      };
    },
  });

  // ── codeindex_callees ──
  pi.registerTool({
    name: "codeindex_callees",
    label: "查询被调用者",
    description: "查找指定符号调用了哪些其他符号。",
    promptSnippet: "Find what a symbol calls",
    parameters: Type.Object({
      nodeId: Type.Optional(Type.Number({ description: "符号的 ID" })),
      name: Type.Optional(Type.String({ description: "符号名称" })),
      file: Type.Optional(Type.String({ description: "限定文件路径" })),
      limit: Type.Optional(Type.Number({ description: "返回数量上限，默认 20" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) return { content: [{ type: "text", text: "代码索引未初始化。" }], details: {} };

      const nodes = resolveNodes(params.nodeId, params.name, params.file);
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "未找到指定符号。" }], details: {} };
      }

      const limit = params.limit ?? 20;
      const allCallees = nodes.flatMap((n) => engine!.getCallees(n.id, limit));

      if (allCallees.length === 0) {
        return {
          content: [{ type: "text", text: `未找到 \`${nodes[0].name}\` 调用的符号。` }],
          details: {},
        };
      }

      const text = allCallees
        .slice(0, limit)
        .map((c) => `- \`${c.name}\` (${c.kind}) — ${c.file}:${c.line}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `\`${nodes[0].name}\` 调用了以下 ${Math.min(allCallees.length, limit)} 个符号：\n\n${text}`,
          },
        ],
        details: { callees: allCallees.slice(0, limit) },
      };
    },
  });

  // ── codeindex_impact ──
  pi.registerTool({
    name: "codeindex_impact",
    label: "影响分析",
    description:
      "分析修改一个符号会影响到哪些其他符号。返回调用者、被调用者及影响半径内的符号。",
    promptSnippet: "Analyze what code is affected by changing a symbol",
    promptGuidelines: [
      "Use codeindex_impact before editing a symbol to understand the blast radius of your change.",
    ],
    parameters: Type.Object({
      nodeId: Type.Optional(Type.Number({ description: "符号的 ID" })),
      name: Type.Optional(Type.String({ description: "符号名称" })),
      file: Type.Optional(Type.String({ description: "限定文件路径" })),
      depth: Type.Optional(
        Type.Number({ description: "影响分析深度，默认 2" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) return { content: [{ type: "text", text: "代码索引未初始化。" }], details: {} };

      const nodes = resolveNodes(params.nodeId, params.name, params.file);
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "未找到指定符号。" }], details: {} };
      }

      const impact = engine.getImpactRadius(nodes[0].id, params.depth ?? 2);

      const callerText =
        impact.callers.length > 0
          ? impact.callers.map((c) => `- \`${c.name}\` — ${c.file}:${c.line}`).join("\n")
          : "- 无";

      const calleeText =
        impact.callees.length > 0
          ? impact.callees.map((c) => `- \`${c.name}\` — ${c.file}:${c.line}`).join("\n")
          : "- 无";

      const affectedText =
        impact.affected.length > 0
          ? impact.affected
              .slice(0, 10)
              .map((a) => `- \`${a.name}\` (${a.kind}) — ${a.file}:${a.line}`)
              .join("\n")
          : "- 无";

      const summary =
        impact.affected.length > 10
          ? `\n\n⚠️ 影响范围较大（${impact.affected.length} 个符号），建议谨慎修改。`
          : impact.affected.length > 5
            ? `\n\n⚡ 有一定影响范围（${impact.affected.length} 个符号）。`
            : "";

      return {
        content: [
          {
            type: "text",
            text: [
              `## \`${impact.symbol.name}\` 的影响分析`,
              "",
              `**被谁调用**（${impact.callers.length} 个）：`,
              callerText,
              "",
              `**调用了谁**（${impact.callees.length} 个）：`,
              calleeText,
              "",
              `**影响范围内的符号**（${impact.affected.length} 个）：`,
              affectedText,
              summary,
            ].join("\n"),
          },
        ],
        details: { impact },
      };
    },
  });

  // ── codeindex_explore ──
  pi.registerTool({
    name: "codeindex_explore",
    label: "探索代码",
    description:
      "获取一组符号的完整源码和关系图。输入符号 ID 列表，返回按文件分组的源码和符号关系。",
    promptSnippet: "Explore code around given symbols with full source and relationships",
    parameters: Type.Object({
      nodeIds: Type.Array(
        Type.Number({ description: "符号 ID 列表" })
      ),
      maxDepth: Type.Optional(
        Type.Number({ description: "探索深度，默认 2" })
      ),
      maxNodes: Type.Optional(
        Type.Number({ description: "最多返回节点数，默认 20" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!engine) return { content: [{ type: "text", text: "代码索引未初始化。" }], details: {} };

      const result = engine.explore(params.nodeIds, {
        maxDepth: params.maxDepth ?? 2,
        maxNodes: params.maxNodes ?? 20,
      });

      if (result.symbols.length === 0) {
        return { content: [{ type: "text", text: "未找到相关符号。" }], details: {} };
      }

      const symbolText = result.symbols
        .map((s) => `- [${s.id}] \`${s.name}\` (${s.kind}) — ${s.file}:${s.startLine}-${s.endLine}`)
        .join("\n");

      const rangeText = result.sourceRanges
        .map((r) => `- ${r.file}:${r.startLine}-${r.endLine}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: [
              `## 探索结果（${result.symbols.length} 个符号，${result.files.length} 个文件）`,
              "",
              "**符号列表**：",
              symbolText,
              "",
              "**相关代码区域**：",
              rangeText,
              "",
              "使用 `read` 读取这些区域的完整源码。",
            ].join("\n"),
          },
        ],
        details: result,
      };
    },
  });

  // ── codeindex_status ──
  pi.registerTool({
    name: "codeindex_status",
    label: "索引状态",
    description: "查看代码索引的统计信息：已索引文件数、符号数、语言分布等。",
    promptSnippet: "Check code index statistics and health",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      if (!engine) {
        return {
          content: [
            {
              type: "text",
              text: "代码索引未初始化。提示用户运行索引初始化。",
            },
          ],
          details: {},
        };
      }

      const stats = engine.getStats();
      const langText = Object.entries(stats.languages)
        .map(([lang, count]) => `- ${lang}: ${count} 个符号`)
        .join("\n");

      const lastIndexed = stats.lastIndexed
        ? new Date(stats.lastIndexed).toLocaleString()
        : "未知";

      return {
        content: [
          {
            type: "text",
            text: [
              "## 代码索引状态",
              "",
              `- **文件数**：${stats.totalFiles}`,
              `- **符号数**：${stats.totalNodes}`,
              `- **关系数**：${stats.totalEdges}`,
              `- **最后索引**：${lastIndexed}`,
              "",
              "**语言分布**：",
              langText,
            ].join("\n"),
          },
        ],
        details: { stats },
      };
    },
  });

  // ═══════════════════════════════════════════
  //  会话结束：清理资源
  // ═══════════════════════════════════════════

  pi.on("session_shutdown", async () => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    if (engine) {
      engine.close();
      engine = null;
    }
  });
}

// ═══════════════════════════════════════════
//  辅助函数
// ═══════════════════════════════════════════

function resolveNodes(
  nodeId?: number,
  name?: string,
  file?: string
): Array<{ id: number; name: string }> {
  if (!engine) return [];

  if (nodeId) {
    const node = engine.getNode(nodeId);
    return node ? [{ id: node.id, name: node.name }] : [];
  }

  if (name) {
    return engine.getNodeByName(name, file).map((n) => ({ id: n.id, name: n.name }));
  }

  return [];
}
