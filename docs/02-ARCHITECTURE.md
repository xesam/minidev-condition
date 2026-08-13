# @mini-dev/condition: 架构设计

> 当前架构。库为单包 `@mini-dev/condition`，平台无关；导航与跨页回传由 resolver / 页面代码承担。

## 概述

condition 是面向小程序的**前置条件编排引擎**。开发者声明一个 `Target` 需要哪些条件，运行时判断、串行补齐、返回结果。库**不**接管导航、跨页结果回传或页面生命周期——这些由 resolver / 页面代码用 App 自己的路由承接。`Condition.satisfied()` 是唯一的完成信号。

单包结构，无平台适配层：

1. **领域核心**：`Condition` / `Resolver` / `Target` / `ConditionRuntime`，无任何平台概念。
2. **页面边缘糖**：`createPrerequisiteController` 把页面生命周期翻译成显式 `ensure()` 调用，仍平台无关。

两者同处 `@mini-dev/condition` 一个包——都是纯 TS、无平台依赖，没有"领域层 vs 适配层"的边界要守。（历史上的 `flow-runtime-integration` 已合并回 core。）

```text
@mini-dev/condition          (no internal deps)
  ↑
examples/wechat-sample     → @mini-dev/condition   (uses wx.* directly in resolvers/pages)
```

## 一、领域核心（core）

### Condition

回答一个问题：当前是否满足。只读查询，不承担补齐、副作用或平台行为。

```ts
interface Condition {
  key: string
  satisfied(params?: Record<string, unknown>): boolean
  dependsOn?: string[]   // 就绪过滤，非拓扑排序、非环检测
}
```

### Resolver

补齐某个条件。可以用任何方式：跳页、弹窗、异步请求、平台原生能力。实现由外部注入，运行时只观察 `ResolveResult`。

```ts
interface Resolver {
  condition: string
  resolve(ctx: ResolveContext): Promise<ResolveResult>
}
```

### Target 与 ConditionRef

`Target` 是一个待进入的页面/功能入口需要的条件。`ConditionRef` **没有 `scope` 字段**——条件注册在哪一档就是哪一档。

```ts
interface Target { key: string; conditions: ConditionRef[] }
interface ConditionRef { condition: string; params?: Record<string, unknown> }
```

同一 `condition` key 可带不同 `params`，各自独立求值。

### ConditionRuntime（可选 parent）

条件编排引擎。可选 `parent` 开启 parent-child 委托。

```ts
class ConditionRuntime {
  constructor(parent?: ConditionRuntime)
  ensure(target: Target): Promise<EnsureResult>
  registerCondition(c: Condition): void
  registerResolver(r: Resolver): void
  isSatisfied(key: string, params?: Record<string, unknown>): boolean
  getDeferredCondition(): { condition: string; params?: ... } | undefined
  dispose(): void   // 只清自己，不动 parent
}
```

`ensure()` 的职责：找出未满足条件 → 按 `dependsOn` 就绪过滤排序 → 依次执行 resolver → 每次补齐后重新校验 `isSatisfied()`（不满足则 `FAILED`）→ 返回 `EnsureResult`。

### 结果枚举

```ts
enum ResolveResult { SUCCESS, CANCEL, FAILED, DEFERRED }
enum EnsureResult  { READY,  CANCEL, FAILED, DEFERRED }
```

## 二、parent-child by registration（无 scope）

一个 `ConditionRuntime` 可以声明 `parent`。**没有 `scope` 标签**：ref 归谁解，由"谁注册了这个 condition key"决定。

### 路由

`ensure(target)` 把 `target.conditions` 分成三组：

- **selfOwned**：注册在本 runtime 上的 ref（若父子都注册，**child 覆盖 parent**）→ 本地解
- **parentOwned**：本 runtime 没注册、parent 注册了的 ref → 委托 `parent.ensure(...)`
- **neither**：两边都没注册 → 抛 `no runtime owns condition "X"`（比"no resolver"更明确）

### parent-first 硬屏障

```text
parent.ensure(parentOwned)
  ├─ 非 READY (CANCEL/FAILED/DEFERRED) → 直接返回，self 阶段不跑
  └─ READY → 继续
self.runEnsure(selfOwned)
```

- **跨层顺序免费**：parent 持有的条件整体先于 child 持有的条件，不用逐对写 `dependsOn`。
- **短路保护**：parent 阶段挂掉（失败/取消/跳页 deferred），child resolver 绝不触发——避免"全局 side-flow 还没结束就叠加页内 side-flow"。
- **跨层依赖**：child 条件 `dependsOn` 一个 parent 条件时，因 parent 阶段先全 READY，进入 child 阶段时该依赖已满足，`dependsOn` 就绪过滤天然成立。

`isSatisfied` / `getDeferredCondition` / runtime view 都是 `self ?? parent`：child 阶段的 resolver 能查到 parent 已解的条件；parent 阶段 deferred 时 `getDeferredCondition()` 透传 parent 的。

### per-page 隔离

页级 `ConditionRuntime(parent)` 注册自己的条件，`dispose()` 只清自己；global 常驻。页面条件不串页、不污染全局注册表。

## 三、页面边缘糖：生命周期翻译

core 不理解 `onLoad`/`onShow`/`APP_SHOW` 等平台事件。`createPrerequisiteController`（与 core 同包）把页面生命周期翻译成显式 `ensure()` 调用：

```ts
const flow = createPrerequisiteController({
  runtime,            // PrerequisiteRuntime：ConditionRuntime 或 page flow
  key,                // target key，用于单飞去重
  prereqs,            // PrerequisiteRef[]（裸字符串 → { condition }）
  onReady, onCancel?,
})  // → { start, resume, pause, dispose }
```

接线（平台无关的动词，不与任何平台生命周期同名）：

| 事件 | 调用 | 作用 |
|------|------|------|
| 页面实例新建 | `flow.start()` | 重置 per-page 状态，首次 `ensure()` |
| 页面变可见 | `flow.resume()` | 若在等 deferred 且真离开过 → 复行复检 |
| 页面变不可见 | `flow.pause()` | 标记已离开，供下次 `resume` 判定 |
| 页面实例销毁 | `flow.dispose()` | 清理（per-page 状态随实例回收，通常 no-op） |

辅助：`PrerequisiteRef = string | ConditionRef`（裸字符串 → `{ condition }`）；`normalizePrerequisites` / `createTarget` 把页面糖桥接到 core `Target`。

**App 自持 runtime，无库单例**：app `new ConditionRuntime()` 后经 `getApp().globalData` 暴露，页面自行取用或建 page flow。

## 四、DEFERRED + 回页复行契约

跨页 resolver **不**等待跨页结果。流程：

1. resolver 自己 `wx.navigateTo(...)` 跳到目标页，返回 `ResolveResult.DEFERRED`。
2. `ensure()` 返回 `EnsureResult.DEFERRED`，原页保持未就绪，记录 deferred 条件。
3. **目标页不是 condition-runtime-aware**：只写 storage + `navigateBack`，没有 channel、没有 `notifyPageResult`。
4. 用户回到原页 → `onShow` → `flow.resume()` 复行：复检 `Condition.satisfied()`（读 storage）。
   - 满足 → 续链，补下一个未满足条件。
   - 未满足（用户拒绝/返回）→ 终止 `CANCEL`，**不**再触发 side-flow（避免循环）。
5. 全新页面实例（`start`）重置状态 → 重新尝试。

`Condition.satisfied()` 是唯一完成信号。库不持有 channel、不注入 `__fr_channel` query、不 bypass app 路由。

`resume()` 的"真离开"判定：只有 `pause()` 之后的 `resume()` 才复行；`start()` 后紧跟的首次 `resume()` 被跳过（那次 show 是新建的一部分，不是"返回"）。

## 五、运行时保证

1. **`ensure(target)` 是唯一编排入口**；core 不理解生命周期事件。
2. **单飞去重**：`ConditionRuntime.ensure()` 按 `(targetKey + 序列化 conditions)` 在 `inFlightEnsures` 去重并发调用。
3. **补齐后置校验**：每个 resolver 成功后重新校验 `isSatisfied()`，不满足则 `FAILED`。
4. **`dependsOn` 就绪过滤**：一个 ref 只有当其 `dependsOn` 全部满足时才"ready"被解；非拓扑排序、非环检测。
5. **一次复行机会**：deferred 条件在返回时仍未满足则终止，不循环；新页面实例重置。

## 六、示例时序：pay 页 parent-first

> 本节为 parent-first 机制的**示意**时序（条件名与 `new ConditionRuntime(parent)` 用法均为演示）。`examples/wechat-sample` 的实际演示不使用 parent-child——所有 flow 直接挂在 global runtime 上；parent-child 的单测见 `packages/@mini-dev/condition/__tests__/parent-child.test.ts`。

pay 页建 `pageFlow = new ConditionRuntime(globalFlow)`，注册 `feature_check` 在 page flow；`auth`/`realname` 在 global flow。target = `[auth, realname, feature_check]`（feature_check 带 `params:{feature:'payment_v2'}`）。

```text
pageFlow.ensure([auth, realname, feature_check])
  │ 路由：parentOwned=[auth, realname]  selfOwned=[feature_check]
  ▼
globalFlow.ensure([auth, realname])          ── parent 阶段
  │ auth 未满足 → AuthResolver: wx.navigateTo(/pages/auth) → DEFERRED
  ▼ ensure 返回 DEFERRED，pageFlow 透传，原页 pause
  ··· 用户在 auth 页点「Grant」→ 写 __demo_auth → navigateBack ···
  ▼ 原页 onShow → pageFlow.resume() → 复检 auth ✓ → 重跑 ensure
globalFlow.ensure([auth, realname])
  │ auth 满足跳过 → realname 未满足 → RealnameResolver: navigateTo → DEFERRED
  ▼ ··· 用户实名页点「Complete」→ 写 __demo_realname → navigateBack ···
  ▼ resume → 复检 realname ✓ → 重跑 ensure
globalFlow.ensure([auth, realname]) → READY   ── parent 阶段完成
  ▼
pageFlow.runEnsure([feature_check])          ── self 阶段
  │ feature_check 未满足 → FeatureCheckResolver: wx.showModal(payment_v2) → SUCCESS
  ▼ 后置校验 ✓ → READY
onReady()  ── 支付页就绪
```

注意 `feature_check`（page）排在 `auth`/`realname`（global）之后是 parent-first 决定的，不是数组顺序，也不用写 `feature_check.dependsOn(['auth','realname'])`。

## 七、架构原则

1. **领域优先**：core 只保留条件编排必需的概念，无平台名词。
2. **注册地即作用域**：parent-child 靠注册地路由，无 `scope` 标签，避免标签与注册地对不上的脚枪。
3. **显式控制流**：用命令式 `ensure()` 替代平台事件驱动 core；生命周期在外围被翻译。
4. **平台细节在外围**：导航、跨页回传、生命周期接线由 resolver/页面代码承担，库不内置 adapter 层。
5. **外围可替换**：同一 core 可对接不同平台（sample 用 `wx.*`，其它平台换自己的路由即可）。
