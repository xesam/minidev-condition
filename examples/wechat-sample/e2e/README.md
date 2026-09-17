# E2E Tests for @mini-dev/condition wechat-sample

## Prerequisites

1. **WeChat DevTools** installed (macOS: `/Applications/wechatwebdevtools.app`)
2. **Service port enabled** in DevTools: Settings → Security → Service Port (open)
3. **Project built**: `pnpm build` from the wechat-sample directory
4. **WeChat DevTools CLI**: Ensure `/Applications/wechatwebdevtools.app/Contents/MacOS/cli` exists

## Running

```bash
# From the wechat-sample directory:
pnpm e2e

# Watch mode:
pnpm e2e:watch
```

## Test structure

```
e2e/
├── helpers.ts              # Storage manipulation, navigation, modal/exit mocking
├── vitest.config.ts        # Sequential execution, 60s timeout
├── home.spec.ts            # Group A — home: privacy agreement + city
├── product.spec.ts         # Group B — product: login + pay(realname)
├── resolver-targets.spec.ts # Group C — city/login/realname target pages
└── startup-param.spec.ts   # Group D — external launch param completes city (compile-mode demo)
```

Each spec file independently launches and closes the mini program.
Tests run sequentially (no file parallelism) since only one automator instance
can exist at a time.

## Known limitations

- `wx.showModal` is patched directly via `evaluate()` (see `helpers.ts`) — the automator cannot tap native modal buttons, and `mockWxMethod` does not reliably intercept callback-based APIs
- `onShow` lifecycle is not directly triggerable; use `page.callMethod()` or `evaluate()` as workarounds
- Automator requires WeChat DevTools to be open with the project loaded
- While DevTools has the project open, it may merge personal settings (real appid, `sassSetting`) from `project.private.config.json` back into the shared `project.config.json` — that is environment noise, not a source change; restore the shared file and keep only intended edits (the compile-mode `condition` block lives in the shared file deliberately, so it ships with the repo)
