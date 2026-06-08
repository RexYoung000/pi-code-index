/**
 * 文件监听和增量同步
 * 使用操作系统原生文件事件，自动更新索引
 */

import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { type Database } from "../db/adapter";
import { getLanguage } from "../types";
import { extractFile, saveExtraction } from "../extraction/index";

/** 防抖间隔（毫秒） */
const DEBOUNCE_MS = 2000;

export class FileWatcher {
  private watchers: FSWatcher[] = [];
  private db: Database;
  private projectRoot: string;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(db: Database, projectRoot: string) {
    this.db = db;
    this.projectRoot = projectRoot;
  }

  /** 开始监听 */
  start(): void {
    if (this.running) return;
    this.running = true;

    // 递归监听项目目录
    try {
      const watcher = watch(
        this.projectRoot,
        { recursive: true },
        (_eventType, filename) => {
          if (!filename) return;
          const fullPath = join(this.projectRoot, filename.toString());

          // 只处理源代码文件
          if (!getLanguage(fullPath)) return;

          this.pending.add(fullPath);
          this.debounce();
        }
      );

      this.watchers.push(watcher);
    } catch {
      // watch 在某些平台可能不支持 recursive
      // 降级：仅监听顶层
      try {
        const watcher = watch(this.projectRoot, (_eventType, filename) => {
          if (!filename) return;
          const fullPath = join(this.projectRoot, filename.toString());
          if (!getLanguage(fullPath)) return;
          this.pending.add(fullPath);
          this.debounce();
        });
        this.watchers.push(watcher);
      } catch {
        // 文件监听不可用
      }
    }
  }

  /** 停止监听 */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        // ignore
      }
    }
    this.watchers = [];
  }

  /** 手动触发同步 */
  async syncNow(files: string[]): Promise<void> {
    for (const file of files) {
      const lang = getLanguage(file);
      if (!lang) continue;

      try {
        const { nodes, edges } = await extractFile(file, 1, 1);
        saveExtraction(this.db, file, lang, nodes, edges);
      } catch {
        // 解析失败，跳过
      }
    }
  }

  /** 防抖处理 */
  private debounce(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, DEBOUNCE_MS);
  }

  /** 处理所有待同步的文件 */
  private flush(): void {
    const files = Array.from(this.pending);
    this.pending.clear();
    this.syncNow(files).catch(() => {
      // 同步失败静默处理
    });
  }
}
