# Changelog

本文件记录 pi-code-indexer 的用户可见变更。0.4.3 之前的版本未单独记录条目。

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
