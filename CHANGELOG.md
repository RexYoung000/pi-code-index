# Changelog

本文件记录 pi-code-indexer 的用户可见变更。0.4.3 之前的版本未单独记录条目。

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
