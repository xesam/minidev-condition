# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**condition** is a prerequisite orchestration engine for mini-programs. It lets developers declare which conditions (auth, city, realname, etc.) a page needs, and the runtime evaluates and sequentially resolves missing conditions — without scattering `checkXXX()` chains across page code. It deliberately does **not** own navigation or cross-page result relay (see the README product positioning); resolvers trigger navigation themselves and signal completion via `Condition.satisfied()`.

## Commands

```bash
# Build all packages (tsdown: ESM + CJS, each with per-format .d.ts)
pnpm build

# Run all tests (vitest)
pnpm test

# Run per-package
pnpm --filter @mini-dev/condition test

# Lint (type-check only, no separate linter)
pnpm lint
pnpm --filter @mini-dev/condition lint   # tsc --noEmit

# Watch mode per-package
pnpm --filter @mini-dev/condition dev     # tsdown --watch

# wechat-sample e2e (requires WeChat DevTools + miniprogram-automator)
pnpm --filter @mini-dev/condition-wechat-sample e2e
```

## Architecture: single package (no platform adapter)

The library does **not** own navigation, cross-page result relay, or lifecycle
modeling (see the README "非目标" section — these are explicit non-goals). Resolvers
trigger navigation themselves with the app's own router; the only completion
signal is `Condition.satisfied()`. There is no WeChat-specific package, and no
separate integration package — everything ships from `@mini-dev/condition`.

```
@mini-dev/condition        Pure TS — no platform concepts
  Condition              { key, satisfied(params?), dependsOn? }
  Resolver               { condition, resolve(ctx) → ResolveResult }
  Target                 { key, conditions: ConditionRef[] }
  ConditionRuntime            ensure(target) → EnsureResult (READY / CANCEL / FAILED / DEFERRED)
                         + getDeferredCondition() — which condition a DEFERRED await
                         optional parent: routes refs by ownership, parent-first
  ConditionRef           { condition, params? }   (no scope — registration IS the scope)
  ResolveResult          SUCCESS | CANCEL | FAILED | DEFERRED
  dependsOn              ordering is a simple "ready" filter in runEnsure (no graph,
                         no topological sort, no cycle detection)

  createPrerequisiteController({runtime,key,prereqs,onReady,onCancel})
                         → { start, resume, pause, dispose } resume handler
                         (page-edge sugar — translates page lifecycle into ensure()
                         calls; still platform-free, the page wires the verbs itself)
  PrerequisiteRef        string | ConditionRef  (bare string → { condition })
  normalizePrerequisites / createTarget   bridge page-edge sugar → core Target
  (app owns the global flow; pages reach it via getApp().globalData — no library singleton.
   a page with page-scoped conditions builds its own ConditionRuntime(globalFlow) and
   disposes it on unload — no PageRuntime class)
```

## Key design rules

1. **`ensure(target)` is the only orchestration entry point.** The engine does not understand lifecycle events (`onLoad`, `onShow`, `APP_SHOW`). The `createPrerequisiteController` helper translates page lifecycle into explicit `ensure()` calls.

2. **Parent-child by registration, not scope labels.** `ConditionRuntime` takes an optional `parent`. `ensure()` routes each ref by ownership — refs whose condition is registered on this runtime resolve locally, the rest delegate to the parent — and runs the parent phase to READY before its own (parent-first). If the parent phase returns CANCEL/FAILED/DEFERRED, the flow terminates immediately and the local phase never runs. Same key registered on both → child overrides; a ref owned by neither → error. There is no `ConditionRef.scope`: where a condition is registered *is* its scope.

3. **Cross-page resolvers return `DEFERRED`; the library owns no navigation.** A resolver that needs another page triggers the navigation itself (e.g. `wx.navigateTo(...)`) and returns `ResolveResult.DEFERRED` — it does **not** await a cross-page result. `ensure()` returns `EnsureResult.DEFERRED` and the originating page stays not-ready. When the user returns, the `createPrerequisiteController` handler revives via `resume` (gated by a prior `pause`) and re-runs `ensure()`; `Condition.satisfied()` is the only completion signal. There is no channel, no `__fr_channel` query injection, no page-bridge — the app's own router is never bypassed.

4. **One chance per revive.** If the deferred condition is *still* unsatisfied when the user returns (denied / went back), the flow terminates (CANCEL) rather than re-triggering the side-flow — which would otherwise loop. A fresh page instance (`start`) resets this, so re-launching the page always re-attempts.

5. **Single-flight dedup.** `ConditionRuntime.ensure()` deduplicates concurrent calls with the same `(targetKey + serialized conditions)` key via `inFlightEnsures`.

6. **After each resolver succeeds, the runtime re-verifies the condition is actually satisfied.** If `isSatisfied()` returns false post-resolve, it returns `FAILED`.

## Current state

The adapter-wx package has been removed and the integration package has been merged back into core. The library is a single package (`@mini-dev/condition`), platform-free; navigation and cross-page relay live in resolver / page code, not the library.

Docs: [`docs/02-ARCHITECTURE.md`](docs/02-ARCHITECTURE.md) is the **current** architecture; the product positioning lives in the root [`README.md`](README.md). (Earlier three-layer / `PageRuntime` / `scope` design docs have been removed; the architecture is single-package and parent-child by registration.)

## Package dependency graph

```
@mini-dev/condition          (no internal deps)
  ↑
examples/wechat-sample     → core   (uses wx.* directly in resolvers/pages)
```
