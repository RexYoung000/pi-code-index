/**
 * 跨文件引用解析
 *
 * 在索引完所有文件后，将 toId=-1 的未解析边匹配到其他文件中的符号
 * 使用 edge.label 存储的调用目标名称进行匹配
 */

import { type Database } from "../db/adapter";

/**
 * 解析跨文件调用引用
 */
export function resolveCrossFileReferences(db: Database): number {
  const unresolved = db
    .prepare(
      `SELECT e.id, e.label, e.from_id, e.file as edge_file
       FROM edges e
       WHERE e.to_id = -1 AND e.kind = 'calls' AND e.label IS NOT NULL`
    )
    .all() as Array<{ id: number; label: string; from_id: number; edge_file: string }>;

  if (unresolved.length === 0) return 0;

  // 构建 cross-file name index（排除 edges 所在文件）
  const nameIndex = new Map<string, number[]>();
  const allNodes = db.prepare("SELECT id, name, file FROM nodes").all() as Array<{
    id: number;
    name: string;
    file: string;
  }>;
  for (const n of allNodes) {
    const ids = nameIndex.get(n.name) || [];
    ids.push(n.id);
    nameIndex.set(n.name, ids);
  }

  let resolved = 0;

  for (const edge of unresolved) {
    const targets = nameIndex.get(edge.label);
    if (!targets || targets.length === 0) continue;

    // 优先匹配同一项目中其他文件的符号
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
