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
   * A programmer error was detected: a condition or resolver was not registered.
   * Distinct from FAILED (which is a resolver-level runtime result) so callers
   * can tell misconfiguration apart from a user action (cancel/deny).
   * The `message` field describes what was missing.
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
 * When `result` is `ERROR`, the `message` field describes the misconfiguration
 * (unregistered condition or resolver). This is always a programmer error —
 * a condition or resolver that was expected to be registered was not.
 *
 * For all other results, only `result` is present.
 */
export type EnsureOutcome =
  | { result: EnsureResult.READY | EnsureResult.CANCEL | EnsureResult.FAILED }
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
   * There is no cycle detection; if two pending conditions mutually depend on
   * each other, the runtime falls back to array order and continues.
   */
  dependsOn?: string[]
}

/** Minimal runtime surface exposed to resolvers. */
export interface RuntimeView {
  /** Query whether another condition is currently satisfied. */
  isSatisfied(key: string, params?: Record<string, unknown>): boolean
}

/** Context passed to a Resolver when it is invoked */
export interface ResolveContext {
  /** The target being ensured */
  target: Target
  /** Dynamic parameters from the ConditionRef (e.g. { orderId: '123' }) */
  params?: Record<string, unknown>
  /** Minimal runtime view for querying other conditions */
  runtime: RuntimeView
}

/**
 * A Resolver knows how to satisfy a specific condition.
 * It may navigate to a page, show a dialog, make an API call, etc.
 * How it resolves is its own concern — the runtime only calls resolve() and awaits.
 */
export interface Resolver {
  /** The condition key this resolver handles */
  condition: string
  /** Attempt to satisfy the condition. Resolves when done. */
  resolve(ctx: ResolveContext): Promise<ResolveResult>
}

/** A reference to a condition within a target */
export interface ConditionRef {
  /** Condition key */
  condition: string
  /** Optional dynamic parameters passed to Condition.satisfied() and ResolveContext */
  params?: Record<string, unknown>
}

/**
 * A Target represents a page/feature that needs certain conditions met before it can proceed.
 */
export interface Target {
  /** Unique key for this target, e.g. "home", "pay" */
  key: string
  /** Conditions that must be satisfied */
  conditions: ConditionRef[]
}
