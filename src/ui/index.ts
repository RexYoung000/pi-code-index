/**
 * UI 组件 — 索引状态 Widget
 * 在 Pi 界面中显示代码索引的实时状态
 */

import type { CodeIndexEngine } from "../engine/index";

/**
 * 获取索引状态文本
 * 用于 setStatus 或 setWidget
 */
export function getStatusText(engine: CodeIndexEngine | null): string {
  if (!engine) return "📊 未索引";

  const stats = engine.getStats();
  if (stats.totalNodes === 0) return "📊 索引为空";

  return `📊 ${stats.totalNodes} 符号 · ${stats.totalFiles} 文件`;
}

/**
 * 获取详细的 Widget 内容
 * 用于 setWidget（显示更多信息）
 */
export function getWidgetContent(engine: CodeIndexEngine | null): string[] {
  if (!engine) return ["代码索引未初始化", "安装扩展后运行索引即可自动管理"];

  const stats = engine.getStats();

  if (stats.totalNodes === 0) {
    return [
      "代码索引已初始化，但尚未索引",
      "代码修改后索引会自动更新",
    ];
  }

  const lines = [
    `📊 代码索引`,
    `  ${stats.totalNodes} 个符号 · ${stats.totalFiles} 个文件 · ${stats.totalEdges} 条关系`,
  ];

  const langEntries = Object.entries(stats.languages);
  if (langEntries.length > 0) {
    lines.push("  语言分布：");
    for (const [lang, count] of langEntries.slice(0, 5)) {
      lines.push(`    ${lang}: ${count}`);
    }
  }

  if (stats.lastIndexed) {
    const ago = Math.round((Date.now() - stats.lastIndexed) / 60000);
    lines.push(`  最后更新：${ago} 分钟前`);
  }

  return lines;
}
