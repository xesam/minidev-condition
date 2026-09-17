# @mini-dev/condition 微信示例验收用例

> 面向 e2e 自动化测试编写，侧重用户可观察行为。算法性行为（单飞去重、依赖就绪过滤、补齐后置校验、DEFERRED 复行、`neither` 报错）由 core 单元测试覆盖，不在本文档范围内（见末尾「与单元测试的分工」）。

示例是一条贴近真实的电商小程序旅程：**首页（隐私协议 → 城市）→ 商品页（登录 → 支付 → 实名）**。每个条件单独成 flow，顺序由页面串行/阶段保证（不用 `dependsOn`）。另含一个**外部启动参数**演示：DevTools 预置编译模式「外部启动带city参数」（`project.config.json` 的 `condition.miniprogram.list`），模拟分享/扫码入口带 `city` query 启动。

## 被测系统

| 页面 | 路由 | 前置条件 flow | 说明 |
|------|------|--------------|------|
| 首页 | `pages/index/index` | agreement flow → city flow（串行）；city flow 可携启动参数 `params` | 协议用自定义页内弹层；不同意退出小程序；城市未选返回自动重跳；启动带 `city` 时免跳页补齐/替换落地（条件带参做精确匹配） |
| 商品页 | `pages/product/product` | login flow（进入）+ realname flow（点支付触发） | 登录页进入时检查；实名由"支付"按钮动作触发 |
| 城市选择页 | `pages/city/city` | — | resolver 目标页 |
| 登录页 | `pages/login/login` | — | resolver 目标页 |
| 实名认证页 | `pages/realname/realname` | — | resolver 目标页 |

**条件定义：**

| condition.key | 存储键 | resolver 方式 |
|---------------|--------|--------------|
| `agreement` | `__demo_agreement` | 自定义页内 overlay（经 `globalData.presentAgreement` 桥驱动页面 UI） |
| `city` | `__demo_city` | 无启动参数：导航到 `/pages/city/city`（DEFERRED）；启动参数 `externalCity`：直接写 storage 补齐/替换落地（SUCCESS，免跳页——是否触发由带参 `satisfied` 的精确匹配决定） |
| `login` | `__demo_login` | 导航到 `/pages/login/login`（DEFERRED） |
| `realname` | `__demo_realname` | 导航到 `/pages/realname/realname`（DEFERRED） |

### 关键契约

- **协议 resolver 驱动页面 UI**：`AgreementResolver` 调 `getApp().globalData.presentAgreement()`（首页在 `onLoad` 注册、返回 `Promise<boolean>`），overlay 的「同意/不同意」按钮回填该 Promise。同意 → `SUCCESS`；不同意 → `CANCEL` → agreement flow `onCancel` → `wx.exitMiniProgram`。
- **两 flow 串行**：首页 agreement flow `onReady` → `cityFlow.start()`，不靠 `dependsOn`。
- **城市"重新执行"**：城市 flow `onCancel`（返回未选触发）→ `cityFlow.start()` 重置 → 自动再跳城市页。这是库"全新 `start` 总会重新尝试"机制的体现；库默认的"一次复行"会在返回未选时终止，这里用 `start()` 主动重试实现"重新执行城市流程"。
- **实名 action 触发**：商品页 realname flow 不在 onLoad 启动，而在"支付"按钮 `onPay` 里 `start()`；`onShow` 同时 resume 两个 flow（login 就绪后 resume 为 no-op）。
- **外部启动参数补齐/替换（组 D）**：首页 `onLoad` 把非空 `options.city` 注入 city ref 的 `params.externalCity`（无参时仍是裸字符串 ref）。`params.externalCity` 语义是**期望状态（desired）**：`CityCondition.satisfied` 带参做**精确匹配**（本地 = 期望才满足），无参做**存在性检查**。因此本地缺失 → 不满足 → resolver 免跳页**补齐**；本地已有**其他**城市 → 期望 ≠ 实际 → 同样不满足 → resolver 免跳页**替换**落地；本地已与期望一致 → 满足直接就绪（resolver 不触发）。两条硬规则：启动参数**不绕过协议 flow**；完成信号仍唯一是 `satisfied()` 读 storage——resolver 落地（补齐或替换）后，任何求值路径（带不带参）都收敛一致。
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

## 用例组 D：外部启动参数补齐/替换城市（编译模式演示）

> 对应 DevTools 编译模式「外部启动带city参数」（`query=city=杭州`）。e2e 用 `reLaunch('/pages/index/index?city=…')` 注入同样的 onLoad options。首页就绪卡片会标注「（来自启动参数）」以区分免跳页落地与本地预设两条就绪路径。启动参数语义是**期望状态**：本地缺失则补齐、本地不同则替换、本地一致则直接就绪。

### D1 启动带 city、本地缺失 — 免跳页直接落地就绪
- 前置：`__demo_agreement`=true，无 city，启动 query `city=杭州`
- 预期：不跳城市页（全程 `currentPage` 为首页），就绪显示「杭州（来自启动参数）」；`__demo_city`=`'杭州'` 落地 storage

### D2 本地已有其他城市 — 启动参数替换本地
- 前置：`__demo_agreement`=true, `__demo_city`=`'北京'`，启动 query `city=杭州`
- 预期：带参求值不满足（本地≠期望）→ resolver 免跳页替换落地；就绪显示「杭州（来自启动参数）」；`__demo_city`=`'杭州'`
- 边界（不单独设例）：本地已与启动参数一致 → 带参求值满足、resolver 不触发，直接就绪（可观察行为与就绪等价）

### D3 回归 — 无启动参数仍走跳城市页路径
- 前置：`__demo_agreement`=true，无 city，无启动参数
- 预期：原 DEFERRED 路径不变——跳转城市选择页

### D4 参数不绕过协议 — 同意后免跳页完成城市
- 前置：无任何 `__demo_*`，启动 query `city=杭州`
- 预期：先弹协议 overlay；同意后**从未进入城市页**，首页就绪显示「杭州（来自启动参数）」

### D5 落地后无参再入 — 就绪不依赖启动参数
- 前置：`__demo_agreement`=true, `__demo_city`=`'杭州'`（模拟 D1 落地后），无启动参数再入
- 预期：直接就绪显示「杭州」；**无**来源标注（就绪由 storage 驱动，与瞬时参数无关）

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
| params 透传给 resolver（ResolveContext.params） | `runtime.test.ts` |
| 同 key 不同 params 各自独立求值 | `runtime.test.ts` |
| ConditionRuntime parent-child：注册地路由 + parent-first + child 覆盖 | `parent-child.test.ts` |
| createPrerequisiteController 复行 / 终止 / 不重复触发 | `prerequisite-flow.test.ts` |

> 本示例不演示 parent-child、FAILED 两路——真实旅程自然不经过它们；这些能力由上述单测覆盖。**条件 params 已由组 D 演示**（外部启动参数作为期望状态注入 → 带参精确匹配求值 → resolver 分叉补齐/替换落地），其余参数化场景（同 key 多 ref）仍由单测覆盖。如需专门演示其余能力，见历史 commit 的技术演示台版本。

## 已知问题

（暂无。）
