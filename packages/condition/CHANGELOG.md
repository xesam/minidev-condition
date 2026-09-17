# @mini-dev/condition

## 0.1.1 (2026-09-17)

### 发布配置与文档

- **文档权威源迁移**：完整使用文档移至本包 `README.md` 并随包分发（`files` 含 `README.md` / `CHANGELOG.md`）——npm registry 页面与 `node_modules` 内可直接阅读完整文档，跨目录引用使用 GitHub 绝对链接
- **`files` 诚实化**：0.1.0 的 `files` 声明了不存在的 `README.md`（tarball 实际未包含）；本版起 README 物理存在于包内
- **小程序「构建 npm」入口修正**：`miniprogram` 从目录形式（`dist/cjs`，抖音不识别）改为完整文件路径 `dist/cjs/index.js`（微信/抖音两端交集，与 `main` 同源）；新增字段锁定单测
- 仓库根 `README.md` 精简为仓库门面（结构总览 + 指向包文档/示例）；「工具箱位置」章节只描述本库定位，完整工具箱目录指向 [xesam/minidev](https://github.com/xesam/minidev)
- 包代码与 0.1.0 完全相同（零代码变更；本版为文档/发布配置 patch）

### 仓库层（不随包分发）

- `examples/wechat-sample` 新增 DevTools 编译模式「外部启动带city参数」演示：外部启动参数作为条件的**期望状态**——本地缺失则补齐、本地不同则替换、本地一致则直接就绪；resolver 免跳页落地（e2e 组 D，见 `ACCEPTANCE.md`）
- 上述演示全程未改动库代码——补齐/替换策略反转收敛于 `Condition.satisfied` 的参数化求值，`packages/condition` 自 0.1.0 起零变更

## 0.1.0 (2026-08-13)

### 首次发布

小程序前置条件编排引擎 — 声明页面需要哪些条件，运行时自动判断、串行补齐并返回结果。

#### 核心功能

- **声明式条件编排**：通过 `Target` 声明页面所需条件，无需手写 `checkXXX()` 链式调用
- **Parent-child 架构**：支持全局 + 页面级条件分层注册，parent-first 执行保证
- **依赖排序**：`dependsOn` 自动排序条件执行顺序，支持参数化条件
- **DEFERRED 复行**：跨页 resolver 返回 `DEFERRED`，用户返回后自动复行检查
- **单飞去重**：并发 `ensure()` 调用自动去重，避免重复补齐

#### 类型系统

- `Condition` / `Resolver` / `Target` / `ConditionRuntime` 核心类型
- `EnsureResult` 枚举：`READY` / `CANCEL` / `FAILED` / `DEFERRED` / `ERROR`
- `ERROR` 结果类型：区分程序员错误（未注册）与运行时失败（用户行为）

#### 质量保证

- **深度父链查找**：`deepHasCondition()` 递归查找祖先 runtime，支持 3+ 层级
- **循环依赖降级**：检测到 `dependsOn` 循环时输出中文警告并回退到数组顺序
- **中文错误提示**：运行时错误消息全部中文化，便于开发者调试
- **31 个单元测试**：覆盖核心流程、parent-child、DEFERRED 复行、依赖排序等场景

#### 平台支持

- **平台无关**：核心为纯 TypeScript，不依赖任何平台 API
- **微信小程序示例**：`examples/wechat-sample` 提供完整集成示例
- **零运行时依赖**：无第三方依赖，包体积仅 13KB（gzip: 4.6KB）

#### 架构设计

- **单包结构**：`@mini-dev/condition` 包含领域核心 + 页面边缘糖
- **注册即作用域**：条件注册在哪个 runtime 就属于哪个作用域，无 `scope` 标签
- **生命周期翻译**：`createPrerequisiteController` 将页面生命周期翻译为显式 `ensure()` 调用
- **显式控制流**：用命令式 `ensure()` 替代事件驱动，避免隐式行为

#### 文档

- [README.md](./README.md) — 快速上手与核心概念
- [docs/02-ARCHITECTURE.md](../../docs/02-ARCHITECTURE.md) — 完整架构设计
- [CLAUDE.md](../../CLAUDE.md) — 开发者指南

---

### 致谢

感谢所有参与早期测试和反馈的开发者。
