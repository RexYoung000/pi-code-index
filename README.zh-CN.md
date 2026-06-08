# pi-code-index 中文说明

这是一个给 Pi 使用的本地代码索引扩展。它会为当前项目建立本地代码知识图谱，让 Pi 中的 AI 更快理解项目，减少大范围 grep/read/find 带来的 token 浪费。

[English README](./README.md)

## 为什么需要它

Vibecoding 场景里，用户通常用自然语言描述需求，例如：

> 帮我加用户登录，并确认不要影响现有流程。

如果没有代码索引，AI 往往需要反复搜索、读取很多文件来理解项目。`pi-code-index` 会先给 AI 一张本地代码地图，让它可以：

- 更快找到相关函数、类、方法
- 修改前查看调用者和被调用者
- 分析改动影响范围
- 减少无关搜索和文件读取

所有数据都保存在本地 `.codeindex/codeindex.db`，不会上传代码。

## 支持语言

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++

## 快速开始

安装或加载扩展后，在项目中运行：

```text
/codeindex-init
```

初始化完成后，扩展会启动文件监听，代码变化后自动同步索引。

## AI 工具

为了减少工具 schema 带来的 token 开销，扩展只暴露一个紧凑工具：

```text
codeindex
```

通过 `action` 参数区分能力：

| Action | 用途 |
|---|---|
| `init` | 初始化或重建索引 |
| `search` | 按名称搜索符号 |
| `context` | 根据任务描述构建相关代码上下文 |
| `callers` | 查询谁调用了某个符号 |
| `callees` | 查询某个符号调用了谁 |
| `impact` | 分析修改某个符号的影响范围 |
| `explore` | 探索相关符号和文件 |
| `status` | 查看索引状态 |
| `files` | 列出已索引文件 |

## 使用流程

1. 在 Pi 中打开项目。
2. 运行 `/codeindex-init`。
3. 用自然语言提出开发需求。
4. Pi 会在开工前获得轻量代码地图，并在任务中使用索引查询。
5. 文件被修改后，监听器会自动更新索引。

## 本地文件

索引保存在：

```text
.codeindex/codeindex.db
```

如需重建：

```text
/codeindex-init
```

## 当前版本重点

这是 MVP 版本，重点验证：

- 多语言符号提取
- 全文搜索 + CamelCase fallback
- 跨文件调用解析
- Pi 扩展集成
- 文件监听增量同步

