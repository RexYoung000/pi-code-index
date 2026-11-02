# Changelog

本文件记录 pi-code-indexer 的用户可见变更。0.4.3 之前的版本未单独记录条目。

## [0.4.5] - 2026-11-02

### Fixed

- **Node 26 下代码索引完全不可用**：改用 better-sqlite3 13（Node-API）。旧版 11.x 按 Node
  ABI 绑定预编译二进制，在 Node 26（ABI 147）上运行时报 `Module did not self-register`，
  安装时 `prebuild-install` 找不到对应二进制、回退编译又因 v11 用了 Node 26 已移除的 V8 API
  而失败，导致 `npm i` 直接失败。13.x 在受支持的平台使用随 npm 包分发的预编译二进制，避免安装期额外下载
  或本地编译。修复来自社区 PR #1（@yzqzy）。

### Changed

- `engines.node` 由 `>=20.0.0` 调整为 `>=22.0.0`。Pi 自身要求 Node >= 22.19.0，原声明与
  Pi 扩展运行环境不一致；独立 CLI / 通用 Skill 也不再支持 Node 20。lockfile 同步移除
  35 个旧安装链路依赖。
- 新增 GitHub Actions CI：在 Node 22 / 24 / 26 上执行安装、构建、14 项测试（含真实数据库
  索引与搜索）以及打包检查。

## [0.4.4] - 2026-11-01

### Fixed

- 移除 Go 提取器中不会执行的重复方法分支，消除构建警告。
- 修复 Go 指针、值及泛型接收者的方法完整名称，并在类型声明位于方法之后时仍关联同文件所属结构体。
- Skill 和 CLI 文档统一说明从 `SKILL.md` 所在目录定位脚本，使用带引号的绝对路径，支持任意工作目录和含空格的安装目录。

## [0.4.3] - 2026-11-01

### Improved

- **`codeindex` 工具输出截断**：统一按 pi 官方上限（50KB / 2000 行）截断，超出时提示
  用更精确的 query 或更小的 limit 缩小范围。此前在大项目上搜索容易把结果整段灌进
  上下文，触发对话压缩甚至失败。
- **`action` 参数改为枚举**：9 个合法操作（init / search / context / callers / callees /
  impact / explore / status / files）由自由字符串改为枚举，模型知道合法取值，减少传错
  操作，同时省 token。

### Fixed

- 补充 `@earendil-works/pi-ai` 的 peer 声明（运行时由 pi 提供，不随包安装）。
