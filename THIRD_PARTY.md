# 第三方与上游依赖

言界 1.0 候选只直接依赖：

| 包 | 版本与修订 | 许可 | 用途 |
| --- | --- | --- | --- |
| `yanxu-platform` | 1.0.0；`9b6bce794a2e23fba04340f762e3d8f49a2724ff` | MIT OR Apache-2.0 | 平台原语、文字和绘制 |
| `言据` | 1.1.2；`765d9dd623db901a3e71aa4759dbcd77563cb3a9` | MIT | 主题配置、模式和 JSON 转换 |

言界主体为纯言序，不直接链接其他原生库。言台的 Rust 窗口、绘制、字体和图片依赖及安全
例外记录在言台 Release 的 `THIRD_PARTY.md`、`SECURITY.md` 和 `deny.toml` 中；发布制品的
SHA-256 由言台 Release 提供并写入目标平台锁文件。

仓库自身采用 MIT OR Apache-2.0 双许可。GitHub Actions 的 checkout、upload-artifact 和
download-artifact 均固定 40 位提交，不跟随浮动标签。清单、锁、源码包导入、许可证摘要、
工作流引用和自有原生库扫描的机器结果见
[`api/supply-chain-v1.json`](api/supply-chain-v1.json)，策略任务会重新生成并逐字节比较。
