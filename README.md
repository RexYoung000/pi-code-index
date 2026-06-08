# pi-code-index

AI 驱动的代码知识图谱 Pi 扩展。它会为当前项目建立本地代码索引，让 Pi 中的 AI 在理解代码时少做全局搜索、少读无关文件，从而更快、更省 token。

## 核心目标

- **开工前**：根据用户任务自动给 AI 注入相关代码地图
- **工作中**：提供快速查询工具，帮助 AI 搜符号、查调用、看影响范围
- **改完后**：根据编辑过的文件做影响提示，减少漏改风险

所有索引都保存在本地 `.codeindex/codeindex.db`，不会上传代码。

## 支持语言

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++

## 使用方式

安装后，在 Pi 里运行：

```text
/codeindex-init
```

它会为当前项目建立索引，并启动文件监听。之后 AI 会自动获得以下工具：

| 工具 | 用途 |
|---|---|
| `codeindex_init` | 初始化或重建代码索引 |
| `codeindex_search` | 搜索函数、类、方法、接口等符号 |
| `codeindex_context` | 根据任务描述构建相关代码上下文 |
| `codeindex_callers` | 查询谁调用了某个符号 |
| `codeindex_callees` | 查询某个符号调用了谁 |
| `codeindex_impact` | 修改前分析影响范围 |
| `codeindex_explore` | 围绕指定符号探索相关代码结构 |
| `codeindex_status` | 查看索引状态 |

## 适合的场景

适合 vibecoding 工作流：用户用自然语言描述产品需求，AI 负责理解项目、修改代码、解释影响。

这个扩展的“主动能力”主要服务 AI，而不是打扰用户：

1. AI 开始任务前自动获得相关代码地图
2. AI 需要查找时优先查索引，而不是反复 grep/read
3. AI 修改后获得影响提示

## 本地文件

索引数据保存在项目根目录：

```text
.codeindex/codeindex.db
```

如需重建，运行：

```text
/codeindex-init
```

## 发布说明

当前为 MVP 版本，重点验证：

- 多语言符号提取
- 全文搜索 + CamelCase fallback
- 跨文件调用解析
- Pi 扩展工具集成
- 文件监听增量同步

