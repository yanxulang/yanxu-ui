# 第三方与上游依赖

言界 0.1 直接依赖：

| 包 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| `yanxu-platform` | 0.1.x | MIT OR Apache-2.0 | 平台原语、文字和绘制 |
| `言据` | 1.1.x | MIT | 主题配置、模式和 JSON 转换 |

言界主体为纯言序，不直接链接其他原生库。言台的 Rust 窗口、绘制、字体和图片依赖及安全
例外记录在言台 Release 的 `THIRD_PARTY.md`、`SECURITY.md` 和 `deny.toml` 中；发布制品的
SHA-256 由言台 Release 提供并写入目标平台锁文件。
