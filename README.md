# minidev-condition

![npm](https://img.shields.io/npm/v/@mini-dev/condition.svg)
![platform: 小程序](https://img.shields.io/badge/platform-小程序-07c160.svg)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

> `@mini-dev` 小程序开发工具箱的一员 —— 面向微信**原生**小程序的**前置条件编排引擎**。

页面进入前通常有一组条件需要满足：授权、登录、城市选择、用户协议、实名认证……传统做法把这些检查散落在 `onLoad`、`onShow` 或业务函数里，条件一多就演变成嵌套调用、重复判断和不可控的跳转时序。

condition 让开发者**声明「目标需要哪些条件」**，由运行时负责判断、串行补齐并回调最终结果——不接管页面生命周期，也不包装平台导航。

## 10 秒理解

- **Condition**：这个条件当前是否满足
- **Resolver**：当条件不满足时，如何补齐它
- **Target**：某个页面或功能入口需要哪些条件
- **Runtime**：对 `Target` 做条件求值、依赖排序、串行补齐，并给出最终结果

四者的关系：Condition 与 Resolver 以**同一个 key 配对**注册进 Runtime；页面用 Target 声明「需要哪些 key」；controller 把生命周期翻译成 `runtime.ensure(target)`。概念关系图与一次求值时序 → [§3 核心模型](./packages/condition/README.md#3-核心模型)。

```ts
import { createPrerequisiteController } from '@mini-dev/condition'

const controller = createPrerequisiteController({
  runtime: getApp().globalData.runtime,
  key: 'pages/index/index',
  prereqs: ['agreement', 'city'],   // 数组顺序即求值起点（依赖关系可重排）
  owner: this,                      // 可选：发起者（页面实例），透传给 resolver
  onReady: () => { /* 全部条件满足，加载数据 */ },
  onCancel: () => { /* 用户放弃补齐 */ },
})

Page({
  onLoad()   { controller.start()  },  // 页面新实例，首次求值
  onShow()   { controller.resume() },  // 跨页返回后复行
  onHide()   { controller.pause()   },  // 标记已离开
  onUnload() { controller.dispose() },  // 清理资源（可选）
})
```

## 快速上手

- **从零接入（5 分钟闭环）** → [packages/condition/README.md §4 快速上手](./packages/condition/README.md#4-快速上手)：安装 → 注册条件 → 页面接线 → 观察 `READY`
- **跑起来完整示例** → 用微信开发者工具打开 [`examples/wechat-sample`](./examples/wechat-sample)（电商旅程：协议 → 城市 → 登录 → 实名），按其 README 构建 npm 后直接预览；DevTools 编译模式「外部启动带city参数」可演示参数化期望状态补齐
- **深度定制** → [进阶地图](./packages/condition/README.md#7-进阶地图)：owner 通道、DEFERRED 复行、依赖排序、参数化条件、parent-child runtime、单飞去重；[API 速览](./packages/condition/README.md#8-api-速览)

## 仓库结构

| 位置 | 内容 |
|------|------|
| [`packages/condition`](./packages/condition) | **核心包** `@mini-dev/condition` —— 完整使用文档见 [packages/condition/README.md](./packages/condition/README.md)（安装、快速上手、进阶地图、API 速览、架构原则……） |
| [`examples/wechat-sample`](./examples/wechat-sample) | 微信小程序完整落地示例：电商旅程（协议 → 城市 → 登录 → 实名）+ DevTools 编译模式「外部启动带city参数」演示 + e2e |

## 在 @mini-dev 工具箱中的位置

`@mini-dev` 是一组面向微信原生小程序的工具库，每个成员只解决一件事——完整工具箱目录见 [xesam/minidev](https://github.com/xesam/minidev)。

condition 填的是「**进入页面前哪些条件必须先满足**」这一空位：前置条件编排，决定「**去之前先满足什么**」。与决定「去哪」的路由库（如 `@mini-dev/router`）是**正交**的两个维度——二者协作而非替代。

## 更多

- **完整使用文档** → [packages/condition/README.md](./packages/condition/README.md)
- **版本历史** → [packages/condition/CHANGELOG.md](./packages/condition/CHANGELOG.md)
- **npm** → [@mini-dev/condition](https://www.npmjs.com/package/@mini-dev/condition)
