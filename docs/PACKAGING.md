# 构建、Bundle 与发布

## 锁定依赖

言界 0.5.0 固定言台标签`v1.0.0`和言据 1.1.2 对应的 Git 提交
`765d9dd623db901a3e71aa4759dbcd77563cb3a9`。首次构建或切换目标平台后，从项目根目录运行：

```sh
yanbao 装
yanbao 查
```

`言序.lock`记录当前目标、每个依赖的精确提交、内容摘要，以及言台所选原生制品的 ABI、
SHA-256 和大小。不能把一个目标生成的锁文件直接冒充为另一目标的锁文件。

## 应用 Bundle

言序 1.1.9 继续作为源码加载与库 API 的兼容下限；生产 YXB 和 Bundle 必须使用言序
1.1.20 或更新的兼容稳定版构建。本仓库发布的自动关闭 YXB 固定使用 1.1.20，并在对应
目标的独立进程中重新打开和运行成功后才进入候选归档。

入口保留公开控件类和薄方法，列表与虚拟数据视图的实现位于独立模块；最低工具链的发布
门禁会同时构建包入口和全部示例，并拒绝任一序列化字节码模块超过 32 MiB。

应用清单需声明图形应用和权限：

```toml
[应用]
类型 = "图形"
名称 = "我的言界应用"
标识 = "dev.example.my-ui-app"
版本 = "0.1.0"

[权限]
图形界面 = true
原生扩展 = true
剪贴板 = true
文件对话框 = true
```

构建当前宿主的正式 Bundle：

```sh
yanbao 构 --release --bundle
```

言包会从锁定依赖图选中当前目标的言台动态库，并把它连同 YXB 和权限元数据装入 macOS
`.app`、Windows GUI 应用目录或 Linux AppDir。应用不应复制或硬编码 DLL、dylib、so 路径。

## 六目标发布

同一上层源码在六个对应架构执行器上分别重新生成 1.1.9 目标锁文件、类型检查、执行
测试、构建所有公开示例和真实窗口冒烟。随后从当前提交导出隔离源码副本，用 1.1.20
生成独立锁和自动关闭 YXB，并由同一个目标运行器实际回放。每个矩阵项上传自己的公开锁
文件、已回放 YXB 和运行时元数据；汇总作业只有在六项都成功后才创建确定性源码归档、
目标锁目录和 SHA-256 文件。

正式 Release 工作流不重新编译。它只接受与标签同一提交的成功 CI run，下载已经验收的
汇总候选，复核 SHA-256 后发布。因此标签、源码、API 快照、六目标锁与 Release 制品具有
同一提交来源。

## 性能报告

Linux x86-64 专用作业使用言序 1.1.20 的 Release 宿主运行
`benchmarks/性能预算.yx`。脚本预热并自动校准后记录 9 轮样本，以中位数和 MAD 同时判定，
原始 JSON 作为`performance-budget`制品保留 14 天。该作业成功后汇总作业才会生成六目标
候选归档。

本机建立同版本 Release 基线：

```sh
cargo build --manifest-path yanxu-language-new/Cargo.toml --release --locked --bin yanxu
YANXU_MAX_STEPS=1000000000 \
  yanxu-language-new/target/release/yanxu 字节 yanxu-ui/benchmarks/性能预算.yx \
  > /tmp/yanxu-ui-performance-budget.json
```

跨机器绝对值不能直接解释为回归。预算变更需在同一固定运行器上保存前后报告，且性能结果
不能代替语义、真实窗口、压力、资源归零和六目标构建门禁。
