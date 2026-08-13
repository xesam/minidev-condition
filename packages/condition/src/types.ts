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
}

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
  /** Optional dependencies: these condition keys must be satisfied first */
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
