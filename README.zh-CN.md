# pi-code-index 中文说明

这是一个给 Pi 和通用 Agent 使用的本地代码索引项目。它会为目标项目建立本地代码知识图谱，让 AI 编程助手更快理解项目，减少大范围 grep/read/find 带来的 token 浪费。

[English README](./README.md)

## 为什么需要它

Vibecoding 场景里，用户通常用自然语言描述需求，例如：

> 帮我加用户登录，并确认不要影响现有流程。

如果没有代码索引，AI 往往需要反复搜索、读取很多文件来理解项目。`pi-code-index` 会先给 AI 一张本地代码地图，让它可以：

- 更快找到相关函数、类、方法
- 修改前查看调用者和被调用者
- 分析改动影响范围
- 减少无关搜索和文件读取
- 在 Pi 中边开发边自动同步索引

所有数据都保存在本地 `.codeindex/codeindex.db`，不会上传代码。

## 支持语言

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++

## Pi 扩展快速开始

安装或加载扩展后，在项目中运行：

```text
/codeindex-init
```

初始化完成后，扩展会启动文件监听，代码变化后自动同步索引。

## 通用 Agent Skill 快速开始

这个项目现在也内置了一个跨 Agent 的 Skill：

```text
skills/pi-code-index/
```

Codex、Claude Code 或其他支持 Agent Skills 的工具，可以加载这个目录，并通过里面的脚本调用代码索引能力。

先在本项目根目录安装依赖：

```bash
npm install
```

然后可以运行：

```bash
node skills/pi-code-index/scripts/codeindex.mjs status /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project --json
node skills/pi-code-index/scripts/codeindex.mjs search /path/to/project "CodeIndexEngine" --json
node skills/pi-code-index/scripts/codeindex.mjs context /path/to/project "把项目改造成可复用 skill" --json
node skills/pi-code-index/scripts/codeindex.mjs impact /path/to/project 12 --depth 2 --json
```

也可以使用更语义化的脚本：

```bash
node skills/pi-code-index/scripts/index-project.mjs /path/to/project
node skills/pi-code-index/scripts/search-code.mjs /path/to/project "CodeIndexEngine"
node skills/pi-code-index/scripts/build-context.mjs /path/to/project "把项目改造成可复用 skill"
node skills/pi-code-index/scripts/analyze-impact.mjs /path/to/project 12
```

## CLI

项目提供了一个快速 MVP 版 CLI：

```bash
node bin/pi-code-index.js <action> <project> [args...] [options]
```

如果作为包安装，也可以这样调用：

```bash
pi-code-index <action> <project> [args...] [options]
```

支持的 action：

| Action | 用途 |
|---|---|
| `init` | 初始化或重建索引 |
| `status` | 查看索引状态 |
| `files` | 列出已索引文件 |
| `search` | 按名称或文本搜索符号 |
| `context` | 根据任务描述构建相关代码上下文 |
| `callers` | 查询谁调用了某个符号 |
| `callees` | 查询某个符号调用了谁 |
| `impact` | 分析修改某个符号的影响范围 |
| `explore` | 探索相关符号和文件 |

建议 Agent 使用 `--json` 获取结构化输出。

## Pi AI 工具

为了减少工具 schema 带来的 token 开销，Pi 扩展只暴露一个紧凑工具：

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

1. 在 Pi 中打开项目，或让通用 Agent 指向目标项目路径。
2. 初始化索引。
3. 用自然语言提出开发需求。
4. Agent 先用代码地图找到相关文件和符号。
5. Agent 仍然需要直接读取关键源码再编辑或下结论。
6. 在 Pi 中，文件监听会在修改后自动更新索引。

## 本地文件

索引保存在：

```text
.codeindex/codeindex.db
```

在 Pi 中重建：

```text
/codeindex-init
```

通过通用 Agent 脚本重建：

```bash
node skills/pi-code-index/scripts/codeindex.mjs init /path/to/project
```

## 当前版本重点

这是 MVP 版本，重点验证：

- 多语言符号提取
- 全文搜索 + CamelCase fallback
- 跨文件调用解析
- Pi 扩展集成
- Pi 中的文件监听增量同步
- 面向 Codex / Claude Code 等通用 Agent 的 Skill 脚本入口
