# @mini-dev/condition 微信示例验收用例

> 面向 e2e 自动化测试编写，侧重用户可观察行为。算法性行为（单飞去重、依赖就绪过滤、补齐后置校验、DEFERRED 复行、`neither` 报错）由 core 单元测试覆盖，不在本文档范围内（见末尾「与单元测试的分工」）。

示例是一条贴近真实的电商小程序旅程：**首页（隐私协议 → 城市）→ 商品页（登录 → 支付 → 实名）**。每个条件单独成 flow，顺序由页面串行/阶段保证（不用 `dependsOn`）。

## 被测系统

| 页面 | 路由 | 前置条件 flow | 说明 |
|------|------|--------------|------|
| 首页 | `pages/index/index` | agreement flow → city flow（串行） | 协议用自定义页内弹层；不同意退出小程序；城市未选返回自动重跳 |
| 商品页 | `pages/product/product` | login flow（进入）+ realname flow（点支付触发） | 登录页进入时检查；实名由"支付"按钮动作触发 |
| 城市选择页 | `pages/city/city` | — | resolver 目标页 |
| 登录页 | `pages/login/login` | — | resolver 目标页 |
| 实名认证页 | `pages/realname/realname` | — | resolver 目标页 |

**条件定义：**

| condition.key | 存储键 | resolver 方式 |
|---------------|--------|--------------|
| `agreement` | `__demo_agreement` | 自定义页内 overlay（经 `globalData.presentAgreement` 桥驱动页面 UI） |
| `city` | `__demo_city` | 导航到 `/pages/city/city`（DEFERRED） |
| `login` | `__demo_login` | 导航到 `/pages/login/login`（DEFERRED） |
| `realname` | `__demo_realname` | 导航到 `/pages/realname/realname`（DEFERRED） |

### 关键契约

- **协议 resolver 驱动页面 UI**：`AgreementResolver` 调 `getApp().globalData.presentAgreement()`（首页在 `onLoad` 注册、返回 `Promise<boolean>`），overlay 的「同意/不同意」按钮回填该 Promise。同意 → `SUCCESS`；不同意 → `CANCEL` → agreement flow `onCancel` → `wx.exitMiniProgram`。
- **两 flow 串行**：首页 agreement flow `onReady` → `cityFlow.start()`，不靠 `dependsOn`。
- **城市"重新执行"**：城市 flow `onCancel`（返回未选触发）→ `cityFlow.start()` 重置 → 自动再跳城市页。这是库"全新 `start` 总会重新尝试"机制的体现；库默认的"一次复行"会在返回未选时终止，这里用 `start()` 主动重试实现"重新执行城市流程"。
- **实名 action 触发**：商品页 realname flow 不在 onLoad 启动，而在"支付"按钮 `onPay` 里 `start()`；`onShow` 同时 resume 两个 flow（login 就绪后 resume 为 no-op）。
- **目标页非 condition-runtime-aware**：城市/登录/实名页只写 storage + `navigateBack`，完成信号由原页 `resume()` 复检 `Condition.satisfied()` 给出。

---

## 用例组 A：首页（隐私协议 + 城市）

### A1 全部满足 — 直接就绪
- 前置：`__demo_agreement`=true, `__demo_city`=`'Beijing'`
- 操作：进入首页
- 预期：不弹协议 overlay、无 loading；显示「当前城市: Beijing」与「去商品页」按钮

### A2 全缺失 — 协议(同意) → 城市页 → 选城市 → 就绪
- 前置：无任何 `__demo_*`
- 操作：进入首页 → overlay 出现 → 点「同意」 → 跳城市页 → 点第一个城市
- 预期：返回首页就绪，显示所选城市（如「北京」）

### A3 拒绝协议 — 退出小程序
- 前置：无任何 `__demo_*`
- 操作：进入首页 → overlay 出现 → 点「不同意」
- 预期：调用 `wx.exitMiniProgram`（e2e 中 mock 记录），不跳城市页，停在首页

### A4 协议已同意、缺城市 — 跳过协议直接跳城市页
- 前置：`__demo_agreement`=true
- 操作：进入首页
- 预期：不弹 overlay，直接跳城市页；选城市后回首页就绪

### A5 城市页返回不选 — 自动再跳城市页
- 前置：`__demo_agreement`=true
- 操作：进入首页 → 跳城市页 → 点「返回」
- 预期：回到首页后城市 flow `onCancel` → `start()` → 自动再跳城市页

---

## 用例组 B：商品页（登录 + 支付→实名）

### B1 全满足 — 就绪，支付直接成功
- 前置：`__demo_login`=true, `__demo_realname`=true
- 操作：进入商品页 → 点「支付」
- 预期：显示「商品详情」，支付后显示「支付成功」（实名已满足，不跳页）

### B2 全缺失 — 登录页 → 实名页 → 支付成功
- 前置：无
- 操作：进入商品页 → 跳登录页 → 点「登录」 → 回商品页 → 点「支付」 → 跳实名页 → 点「完成认证」
- 预期：回商品页显示「支付成功」

### B3 已登录、缺实名 — 支付跳实名页
- 前置：`__demo_login`=true
- 操作：进入商品页 → 点「支付」 → 跳实名页 → 点「完成认证」
- 预期：回商品页显示「支付成功」

### B4 登录取消 — 未登录卡片
- 前置：无
- 操作：进入商品页 → 跳登录页 → 点「暂不登录」
- 预期：回商品页显示「未登录」卡片（login flow onCancel）

### B5 实名取消 — 支付未成功
- 前置：`__demo_login`=true
- 操作：进入商品页 → 点「支付」 → 跳实名页 → 点「取消」
- 预期：回商品页显示「实名未通过，可重试支付」（realname flow onCancel）

---

## 用例组 C：Resolver 目标页（写 storage + navigateBack）

城市/登录/实名页都不是 condition-runtime-aware。各自操作写入对应存储键并 `navigateBack`。

| # | 页面 | 操作 | 预期存储 |
|---|------|------|---------|
| C1 | 城市页 | 点第一个城市 | `__demo_city` truthy |
| C2 | 城市页 | 点「返回」 | `__demo_city` falsy |
| C3 | 登录页 | 点「登录」 | `__demo_login` true |
| C4 | 登录页 | 点「暂不登录」 | `__demo_login` false |
| C5 | 实名页 | 点「完成认证」 | `__demo_realname` true |
| C6 | 实名页 | 点「取消」 | `__demo_realname` false |

---

## 测试辅助

### 状态预设

所有 demo 条件通过 `wx.getStorageSync` 读、`wx.setStorageSync` 写。

| 场景 | 预设 |
|------|------|
| 清空全部 | `['__demo_agreement','__demo_city','__demo_login','__demo_realname'].forEach(k => wx.removeStorageSync(k))` |
| 首页就绪 | `__demo_agreement`=true, `__demo_city`=`'Beijing'` |
| 仅缺城市 | `__demo_agreement`=true |
| 商品页就绪 | `__demo_login`=true, `__demo_realname`=true |
| 仅缺实名 | `__demo_login`=true |

e2e helper：`clearAllState` 清 4 键 + 清 `runtime.inFlightEnsures`；`mockExitMiniProgram` 把 `wx.exitMiniProgram` 替换为写 `__demo_exit_called` 标志（避免 automator 会话被关）。

### 用例间隔离

每个用例 `beforeEach` 重置存储（`clearAllState`）并还原 modal/exit mock。

---

## 与单元测试的分工

以下行为由 `@mini-dev/condition/__tests__` 覆盖，e2e 不重复验证：

| 行为 | 覆盖文件 |
|------|---------|
| 并发 ensure 单飞去重（`inFlightEnsures`） | `runtime.test.ts` |
| `neither` 报错（"no runtime owns condition"） | `runtime.test.ts` |
| `dependsOn` 就绪过滤决定先后 | `runtime.test.ts` |
| 补齐后置校验（SUCCESS 但未满足 → FAILED） | `runtime.test.ts` |
| resolver 返回 FAILED 终止 | `runtime.test.ts` |
| DEFERRED 停链 + getDeferredCondition + 复行续链 | `runtime.test.ts` |
| ConditionRuntime parent-child：注册地路由 + parent-first + child 覆盖 | `parent-child.test.ts` |
| createPrerequisiteController 复行 / 终止 / 不重复触发 | `prerequisite-flow.test.ts` |

> 本示例不演示 parent-child、条件 params、FAILED 三路——真实旅程自然不经过它们；这些能力由上述单测覆盖。如需专门演示，见历史 commit 的技术演示台版本。

## 已知问题

（暂无。）
