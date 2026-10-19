# @mini-dev/condition

## 0.1.2 (2026-10-19)

### 行为变更（含 breaking，源自 `.changeset/wild-pandas-wave.md`）

- **BREAKING**：`dependsOn` 依赖成环时 `ensure()` 返回 `ERROR` 而非按数组顺序执行（此前为中文警告 + 回退数组顺序）——周旋执行属于掩蔽程序员错误，现在显式报错
- 错误消息（ERROR path）由中文改为英文；console 日志输出统一 `[ConditionRuntime]` 前缀（`EnsureOutcome.message` 本身不带前缀，与 result 判别一致）
- resolver 报 `SUCCESS` 但条件仍不满足（契约违反）时，`console.error` 带专属可辨识消息，与 resolver 主动 FAILED 在控制台可区分

### 失败条件身份（per-condition cancellation）

- `EnsureOutcome` 的 CANCEL/FAILED 分支新增 `cancelledCondition` / `failedCondition`（`failedCondition` 可选——resolver 抛异常时无具体 ref）：单 flow 内多 prereq 可按条件分支失败策略，不再被迫拆链式多 flow
- `createPrerequisiteController` 的 `onCancel` 签名改为 `(outcome: CancelOutcome) => void`，透传终止条件身份；ERROR（编程错误）单独分支——记录并终止，不触发 onCancel
- parent → child 传播、resume（返回未满足）路径均携带身份

### owner 通道（页内 resolver 的发起者引用）
- `Target.owner?`（可选）：本次 ensure 的发起者（通常页面实例），库不解释、透传到 `ResolveContext.owner`；**不进 in-flight 去重 key**（key 即调用方身份，owner 为其附随物）；跨 parent 委托转发
- `ResolveContext<TOwner>` / `Resolver<TOwner>` 泛型化：resolver 声明所需 owner 形状，类型在用户端闭合；库内注册缝存 `any`
- `createPrerequisiteController` 新增 `owner?` 选项：替代 globalData 钩子桥（全局可变状态反模式）驱动页内 UI
- 分界规则：params 可能进 `satisfied()`（求值实参、进 key），owner 永不进（发起者引用）

### 术语整固（纯注释与文档）

- README 重构为「快速上手（最小可运行闭环）→ 进阶地图（owner / DEFERRED 复行 / 依赖与参数化 / parent-child / 去重）→ API 速览」三层信息架构；新增 `EnsureOutcome` 结果语义表与 controller 复行状态机图；根 README 增加 npm 徽章与上手/跑示例路径
- README 信息架构二次整固：快速上手上移（安装命令不再被定位/价值主张等 meta 段遮挡），目标用户并入核心价值主张，单包结构挪至架构原则近旁；核心模型新增概念关系图（配对/引用/翻译三条连线）与一次 `ensure()` 完整时序图（含后置复核与 DEFERRED 分支），进阶各小节补业务场景导语，§2 以电商旅程做具象叙事；文档修正 `EnsureResult` 缺行、「可推导」与就绪过滤措辞矛盾及若干笔误；公共 API 与运行时行为零变化
- 架构设计文档收口为单入口：架构原则、parent-first 路由与硬屏障、pay 页示意时序并入本 README「进阶地图 · 页面级作用域」与「架构原则」章节；「微信返回动画期间 navigateTo 被丢弃」平台 workaround 见 [examples/wechat-sample/README.md](../../examples/wechat-sample/README.md)（新增示例运行指引）

- 全库文档/注释中的叙事词 **flow** 退役，各实体归位于已有官方名：controller（`createPrerequisiteController` 实例）、runtime（`ConditionRuntime` 实例，global / page-scoped）、chain（一次 `ensure()` 执行链）；`side-flow`（跨页旁路）保留；`.d.ts` 注释随之变更，公共 API 与运行时行为零变化
- `[PrerequisiteController]` 控制台错误消息中 `Flow "..."` 措辞改为 `Controller "..."`（用户可观察的日志字符串变化）

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
- 开发者指南（仓库内文档）

---

### 致谢

感谢所有参与早期测试和反馈的开发者。
