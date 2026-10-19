// ============================================================
// @mini-dev/condition - Public Types
// ============================================================

/** Result returned by a Resolver after attempting to satisfy a condition */
export enum ResolveResult {
  SUCCESS = 'success',
  CANCEL = 'cancel',
  FAILED = 'failed',
  /**
   * The resolver kicked off an out-of-band side-flow (e.g. navigated to
   * another page) and returned without satisfying the condition yet. The
   * runtime stops the loop and returns DEFERRED; the caller is expected to
   * re-invoke `ensure()` later (e.g. on the originating page's next onShow)
   * so the condition is re-evaluated and the chain resumes.
   */
  DEFERRED = 'deferred',
}

/** Result returned by ConditionRuntime.ensure() */
export enum EnsureResult {
  READY = 'ready',
  CANCEL = 'cancel',
  FAILED = 'failed',
  /** A resolver returned DEFERRED; see {@link ResolveResult.DEFERRED}. */
  DEFERRED = 'deferred',
  /**
   * A programmer error was detected: a condition or resolver was not
   * registered, or condition dependencies form a cycle.
   * Distinct from FAILED (which is a resolver-level runtime result) so callers
   * can tell misconfiguration apart from a user action (cancel/deny).
   * The `message` field describes what was wrong.
   */
  ERROR = 'error',
}

/**
 * The outcome of a `ConditionRuntime.ensure()` call.
 *
 * When `result` is `DEFERRED`, the `deferredCondition` field identifies
 * which condition the resolver deferred on. This information is returned
 * inline with the result so callers never need a separate
 * `getDeferredCondition()` call — eliminating the two-step API and any
 * shared-state race between concurrent `ensure()` calls on the same runtime.
 *
 * Likewise, `cancelledCondition` / `failedCondition` identify which condition
 * the chain terminated on for `CANCEL` / `FAILED` — so a caller with multiple
 * prerequisites can branch per-condition failure policies without splitting
 * the chain. `failedCondition` is absent when the failure was a thrown error
 * rather than a resolver-reported outcome.
 *
 * When `result` is `ERROR`, the `message` field describes the programmer
 * error (unregistered condition/resolver, or a dependency cycle).
 *
 * For all other results, only `result` is present — except the identity
 * fields above when applicable.
 */
export type EnsureOutcome =
  | { result: EnsureResult.READY }
  | { result: EnsureResult.CANCEL; cancelledCondition: ConditionRef }
  | { result: EnsureResult.FAILED; failedCondition?: ConditionRef }
  | { result: EnsureResult.ERROR; message: string }
  | {
      result: EnsureResult.DEFERRED;
      deferredCondition: { condition: string; params?: Record<string, unknown> };
    };

/**
 * A Condition describes a required state for a target to be ready.
 * It only answers "is this condition satisfied?" — no side effects.
 */
export interface Condition {
  /** Unique key identifying this condition, e.g. "auth", "city" */
  key: string
  /**
   * Returns true if the condition is currently satisfied.
   * @param params - Dynamic parameters from the ConditionRef (e.g. orderId).
   */
  satisfied(params?: Record<string, unknown>): boolean
  /**
   * Optional dependencies: condition keys that must be satisfied (or absent
   * from the current target's pending set) before this condition's resolver
   * is invoked.
   *
   * **Scope — target-local only**: `dependsOn` only operates within the same
   * `Target.conditions` array. If a listed key is not present in the target
   * being ensured, it is treated as already-satisfied for ordering purposes
   * and does not block this condition's resolver.
   *
   * **Cross-layer ordering is free**: when using parent-child runtimes, all
   * parent-owned conditions resolve to READY before any child-owned condition
   * is attempted (parent-first guarantee). A child condition never needs to
   * list a parent-owned condition in `dependsOn`.
   *
   * A dependency cycle among the target's own conditions is treated as a
   * programmer error: `ensure()` returns ERROR instead of executing the
   * involved resolvers in an arbitrary order.
   */
  dependsOn?: string[]
}

/** Minimal runtime surface exposed to resolvers. */
export interface RuntimeView {
  /** Query whether another condition is currently satisfied. */
  isSatisfied(key: string, params?: Record<string, unknown>): boolean
}

/**
 * Context passed to a Resolver when it is invoked
 *
 * `owner` is the initiating reference of this ensure call (typically the
 * page instance that started the controller), passed through opaquely — the
 * library attaches no semantics to it. An in-call resolver that needs to
 * drive page-owned UI (e.g. an overlay) receives the initiator through
 * `owner` instead of reaching for global state.
 */
export interface ResolveContext<TOwner = unknown> {
  /** The target being ensured */
  target: Target
  /** Dynamic parameters from the ConditionRef (e.g. { orderId: '123' }) */
  params?: Record<string, unknown>
  /** Minimal runtime view for querying other conditions */
  runtime: RuntimeView
  /**
   * The initiator of this ensure call — whatever the caller declared as
   * the controller's `owner` (usually the page instance). Absent when the
   * controller was created without one.
   */
  owner?: TOwner
}

/**
 * A Resolver knows how to satisfy a specific condition.
 * It may navigate to a page, show a dialog, make an API call, etc.
 * How it resolves is its own concern — the runtime only calls resolve() and awaits.
 *
 * `TOwner` narrows the `owner` field of the ResolveContext this resolver
 * expects. Declare the shape you need (e.g.
 * `Resolver<{ presentAgreement(): Promise<boolean> }>`); typing closes on
 * the app side — the library stores resolvers through an internal seam.
 */
export interface Resolver<TOwner = unknown> {
  /** The condition key this resolver handles */
  condition: string
  /** Attempt to satisfy the condition. Resolves when done. */
  resolve(ctx: ResolveContext<TOwner>): Promise<ResolveResult>
}

/** A reference to a condition within a target */
export interface ConditionRef {
  /** Condition key */
  condition: string
  /** Optional dynamic parameters passed to Condition.satisfied() and ResolveContext */
  params?: Record<string, unknown>
}

/**
 * A Target represents a page/feature that needs certain conditions met
 * before it can proceed.
 *
 * Boundary between the two payload channels:
 * - `conditions[].params` may feed `Condition.satisfied()` (evaluation
 *   arguments) and participates in the in-flight dedup key.
 * - `owner` never feeds `satisfied()` (it is the initiator reference, not
 *   evaluation data) and is NOT part of the dedup key — `key` already
 *   identifies the caller; `owner` is that caller's substance.
 */
export interface Target {
  /** Unique key for this target, e.g. "home", "pay". Identifies the caller. */
  key: string
  /** Conditions that must be satisfied */
  conditions: ConditionRef[]
  /**
   * The initiator of this ensure run (typically the page instance that
   * started the controller), passed through opaquely to resolvers via
   * `ResolveContext.owner`. The library attaches no semantics to it.
   */
  owner?: unknown
}
