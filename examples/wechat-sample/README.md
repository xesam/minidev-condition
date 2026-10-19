# wechat-sample

`@mini-dev/condition` 的微信小程序完整落地示例——一条贴近真实的电商旅程：**首页（隐私协议 → 城市）→ 商品页（登录 → 支付 → 实名）**。功能验收清单见 [ACCEPTANCE.md](./ACCEPTANCE.md)。

## 运行

1. 用微信开发者工具打开本目录（`examples/wechat-sample`）
2. 工具栏「工具 → 构建 npm」（`packNpmManually` 已配置：从 `./package.json` 构建到 `miniprogram/miniprogram_npm`）
3. 编译预览

DevTools 编译模式列表预置了「外部启动带city参数」——模拟分享/扫码入口带 `city` query 启动，演示参数化条件的**期望状态**语义（本地缺失补齐 / 本地不同替换），详见 [ACCEPTANCE.md](./ACCEPTANCE.md) 组 D。

## e2e

需要微信开发者工具 + `miniprogram-automator`，运行方式与用例结构见 [e2e/README.md](./e2e/README.md)。

## 平台限制：微信返回动画期间 navigateTo 被丢弃

**问题**：在 `resume()` 触发的 resolver 里立即调用 `wx.navigateTo()` 时，该调用会被微信运行时**静默丢弃**（无报错、无跳转）。原因是用户刚从子页返回，返回动画（约 200–300ms）尚未结束，微信此时拒绝新的 `navigateTo` 调用。

**解决**：在 resolver 内延迟 200–300ms 再跳转（本项目实现见 `miniprogram/utils/nav.ts`）：

```ts
// ✗ 错误：立即 navigateTo 会被丢弃
async resolve() {
  wx.navigateTo({ url: '/pages/city/city' })
  return ResolveResult.DEFERRED
}

// ✓ 正确：延迟 300ms 等返回动画结束
async resolve() {
  setTimeout(() => wx.navigateTo({ url: '/pages/city/city' }), 300)
  return ResolveResult.DEFERRED
}
```

这是微信小程序平台的真实限制，不是 `@mini-dev/condition` 的设计选择。本示例所有 DEFERRED resolver（login / city / realname）都采用了这个 workaround。
