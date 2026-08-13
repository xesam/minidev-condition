# @mini-dev/condition

![status: pre-release](https://img.shields.io/badge/status-pre--release-orange.svg)
![platform: 小程序](https://img.shields.io/badge/platform-小程序-07c160.svg)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

> `@mini-dev` 小程序开发工具箱的一员 —— 面向微信**原生**小程序的**前置条件编排引擎**。

页面进入前通常有一组条件需要满足：授权、登录、城市选择、用户协议、实名认证……传统做法把这些检查散落在 `onLoad`、`onShow` 或业务函数里，条件一多就演变成嵌套调用、重复判断和不可控的跳转时序。

condition 让开发者**声明「目标需要哪些条件」**，由运行时负责判断、串行补齐并返回最终结果——不接管页面生命周期，也不包装平台导航。跨页 resolver 自己触发跳转并返回 `DEFERRED`，回到原页时由生命周期接线复行；`Condition.satisfied()` 是唯一的完成信号。

## 目录

1. [在 @mini-dev 工具箱中的位置](#1-在-mini-dev-工具箱中的位置)
2. [它解决什么问题](#2-它解决什么问题)
3. [核心价值主张](#3-核心价值主张)
4. [核心模型](#4-核心模型)
5. [目标用户](#5-目标用户)
6. [非目标](#6-非目标)
7. [单包结构（平台无关）](#7-单包结构平台无关)
8. [快速上手](#8-快速上手)
   - [8.1 App 启动时注册全局条件与 resolver](#81-app-启动时注册全局条件与-resolver)
   - [8.2 页面声明前置条件并接线生命周期](#82-页面声明前置条件并接线生命周期)
   - [8.3 依赖排序与参数化条件](#83-依赖排序与参数化条件)
9. [包](#9-包)
10. [文档](#10-文档)
11. [状态](#11-状态)

## 1. 在 @mini-dev 工具箱中的位置

`@mini-dev` 是一组面向微信原生小程序的工具库，每个成员只解决一件事。condition 填的是「**进入页面前哪些条件必须先满足**」这一空位：

| 成员 | 解决的一件事 |
|------|------------|
| `@mini-dev/router` | 路由封装 —— 决定「**去哪**」 |
| **`@mini-dev/condition`（本库）** | 前置条件编排 —— 决定「**去之前先满足什么**」 |
| `@mini-dev/env` | 按 `envVersion` 区分多环境参数 |
| `@mini-dev/hook` | 拦截 App / Page / Component 做统一兜底 |
| `@mini-dev/request` | `request` 拦截器 + Promise + 取消 |
| `@mini-dev/location` | 跨平台定位（只增强、不归一） |

`router` 与 `condition` 是**正交**的两个维度：路由决定「去哪里」，condition 决定「在到达目标前，哪些条件必须先满足」。二者协作而非替代——condition 不是替代路由框架，而是与路由框架协作。

## 2. 它解决什么问题

一个典型的首页进入流程：

```text
检查授权 -> 无授权则补齐授权 -> 继续
检查城市 -> 无城市则补齐城市 -> 继续
加载首页数据
```

当条件扩展到 6–7 个时，传统的 `checkXXX()` 链式调用会出现三个问题：

1. 条件逻辑散落在页面和业务代码中，难以复用
2. 条件之间的依赖关系不透明，修改时容易破坏顺序
3. 同一入口在多个触发点重复检查，容易产生重复补齐和竞态行为

condition 把这些收口为一个稳定的领域模型：声明 `Target`，运行时自动求值、串行补齐、返回 `READY / CANCEL / FAILED / DEFERRED`。条件间的 `dependsOn` 用一个轻量「就绪过滤」决定先后（不做拓扑排序、不做环检测）。

## 3. 核心价值主张

| 特性 | 说明 |
|------|------|
| **声明式** | 用 `Target` 声明目标所需条件，不写过程式 `checkXXX()` 链 |
| **可组合** | 条件和补齐逻辑以 `Condition` / `Resolver` 为单位独立注册、独立测试 |
| **可扩展** | 新增条件主要通过新增注册项完成，不需要修改页面主流程 |
| **可推导** | 运行时依据依赖关系自动排序并按序执行 |
| **跨平台** | 核心只描述条件编排，平台差异由调用方（resolver / 页面代码）承接，不在库内 |

## 4. 核心模型

- **Condition**：这个条件当前是否满足
- **Resolver**：当条件不满足时，如何补齐它
- **Target**：某个页面或功能入口需要哪些条件
- **Runtime**：对 `Target` 做条件求值、依赖排序、串行补齐，并给出最终结果

## 5. 目标用户

- 有多个页面前置条件的小程序业务开发者
- 需要统一准入流程规范的基础设施团队

## 6. 非目标

condition **负责**：

- 条件声明
- 条件依赖排序
- 条件补齐流程编排
- 成功 / 取消 / 失败结果返回

condition **不负责**：

- 路由框架
- 页面生命周期建模
- 状态管理
- UI 组件库
- 各平台导航 API 的统一抽象

平台导航、生命周期接线、跨页结果回传都属于外围集成问题，不是 condition 核心领域的一部分。

## 7. 单包结构（平台无关）

| 模块 | 职责 |
|------|------|
| 领域核心 | `Condition` / `Resolver` / `Target` / `ConditionRuntime`，不含任何平台概念 |
| 页面边缘糖 | `createPrerequisiteController` 把页面生命周期翻译成显式 `ensure()` 调用，仍平台无关 |

两者同处 `@mini-dev/condition` 一个包——都是纯 TS、无平台依赖，没有"领域层 vs 适配层"的边界要守。库**不**包含微信适配层——导航、跨页结果回传、生命周期接线都由 resolver / 页面代码用 App 自己的路由承接。`examples/wechat-sample` 用 `wx.*` 直接落地。

包依赖关系：

```text
@mini-dev/condition          (no internal deps)
  ↑
examples/wechat-sample     → @mini-dev/condition   (uses wx.* directly in resolvers/pages)
```

## 8. 快速上手

### 8.1 App 启动时注册全局条件与 resolver

```ts
import { ConditionRuntime } from '@mini-dev/condition'

const runtime = new ConditionRuntime()
runtime.registerCondition(authCondition)
runtime.registerResolver(authResolver)
runtime.registerCondition(cityCondition)
runtime.registerResolver(cityResolver)
// ...

// App 自己持有 runtime 实例，页面通过 getApp() 取用 —— 库不持有单例。
App({ globalData: { runtime } })
```

### 8.2 页面声明前置条件并接线生命周期

```ts
import { createPrerequisiteController } from '@mini-dev/condition'

const flow = createPrerequisiteController({
  runtime: getApp().globalData.runtime,
  key: 'pages/index/index',
  prereqs: ['auth', 'city', 'agreement'],   // 裸字符串 → { condition }
  onReady: () => { /* 全部满足，加载页面数据 */ },
  onCancel: () => { /* 取消 / 失败 / 返回未满足 */ },
})

Page({
  onLoad:  () => flow.start(),   // 新实例，首次求值
  onShow:  () => flow.resume(),   // 跨页返回后复行
  onHide:  () => flow.pause(),    // 标记已离开，供下次 resume 判定
})
```

跨页 resolver 自己 `wx.navigateTo` 并返回 `ResolveResult.DEFERRED`；`ensure()` 随之返回 `DEFERRED`，原页保持未就绪。用户返回时 `resume()` 复行：若延迟条件已满足则继续链，否则终止（不重复触发 side-flow，避免循环）。一个全新页面实例（`start`）总是重新尝试。

### 8.3 依赖排序与参数化条件

```ts
// auth 依赖 agreement：dependsOn 是就绪过滤，不是拓扑排序
const authCondition = { key: 'auth', dependsOn: ['agreement'], satisfied: () => ... }

// 同一 condition key 可带不同 params，各自独立求值
const target = {
  key: 'pay',
  conditions: [
    { condition: 'auth' },
    { condition: 'feature_check', params: { feature: 'payment_v2' } },
  ],
}
```

页内专属条件可挂在 page flow 上（`new ConditionRuntime(globalFlow)`），随页面 `dispose()` 清理；global flow 上的条件由 parent-first 先解。条件注册在哪一档就是哪一档——没有 `scope` 标签。

完整落地示例见 `examples/wechat-sample`。

## 9. 包

| 包名 | 说明 |
|------|------|
| `@mini-dev/condition` | 前置条件编排引擎 + 页面生命周期接线（`createPrerequisiteController` 等） |

## 10. 文档

- [docs/02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md) — 当前架构（单包 + parent-child by registration）

当前架构以 [docs/02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md) 和 [CLAUDE.md](./CLAUDE.md) 为准。

## 11. 状态

**pre-release**：尚未发布到 npm。当前为单包平台无关架构（`@mini-dev/condition`）；历史上的 `flow-runtime-adapter-wx` 与 `flow-runtime-integration` 已先后移除/合并，导航与跨页回传由 resolver / 页面代码承担。示例见 `examples/wechat-sample`。
