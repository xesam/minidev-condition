// ============================================================
// @mini-dev/condition - ConditionRuntime
// Core prerequisite runtime engine
// ============================================================

import type {
  Condition,
  ConditionRef,
  ResolveContext,
  Resolver,
  RuntimeView,
  Target,
} from './types';
import { EnsureResult, ResolveResult } from './types';

/**
 * ConditionRuntime is the core engine that ensures all prerequisite conditions
 * are satisfied before a page is considered ready.
 *
 * It guarantees:
 * - ensure() is the orchestration entry point
 * - Resolvers execute sequentially within a single ensure() call
 *
 * A runtime may declare a `parent` runtime. `ensure()` then routes each
 * condition ref by ownership — refs whose condition is registered on this
 * runtime resolve locally, the rest delegate to the parent — and runs the
 * parent phase to READY before the local phase (parent-first). This replaces
 * a scope label: where a condition is registered *is* its scope.
 */
export class ConditionRuntime {
  private conditions: Map<string, Condition> = new Map();
  private resolvers: Map<string, Resolver> = new Map();
  private inFlightEnsures: Map<string, Promise<EnsureResult>> = new Map();
  /**
   * The condition a resolver deferred during the most recent `ensure()`.
   * Set when a resolver returns DEFERRED, cleared on every other outcome.
   * Read by the caller after `ensure()` resolves DEFERRED, to know which
   * condition to re-check when reviving the flow.
   */
  private deferredCondition: { condition: string; params?: Record<string, unknown> } | undefined;

  /**
   * @param parent Optional parent runtime. Refs whose condition is not
   * registered on this runtime are delegated to the parent, which runs to
   * READY before this runtime's own phase. A runtime with no parent treats
   * every ref as local.
   */
  constructor(private readonly parent?: ConditionRuntime) {}

  // ---- Public API ----

  /**
   * Ensure all conditions in `target` are satisfied.
   * Returns READY when all are satisfied, or CANCEL/FAILED.
   */
  async ensure(target: Target): Promise<EnsureResult> {
    const targetKey = this.createEnsureKey(target);
    const inFlight = this.inFlightEnsures.get(targetKey);
    if (inFlight) {
      return inFlight;
    }

    const run = this.runEnsureWithParent(target).finally(() => {
      if (this.inFlightEnsures.get(targetKey) === run) {
        this.inFlightEnsures.delete(targetKey);
      }
    });
    this.inFlightEnsures.set(targetKey, run);

    return run;
  }

  /**
   * Register a condition with the runtime.
   */
  registerCondition(condition: Condition): void {
    this.conditions.set(condition.key, condition);
  }

  /**
   * Register a resolver with the runtime.
   */
  registerResolver(resolver: Resolver): void {
    this.resolvers.set(resolver.condition, resolver);
  }

  /**
   * Check if a condition is currently satisfied.
   * Falls through to the parent for conditions this runtime doesn't own.
   */
  isSatisfied(key: string, params?: Record<string, unknown>): boolean {
    const cond = this.conditions.get(key);
    if (cond) return cond.satisfied(params);
    return this.parent?.isSatisfied(key, params) ?? false;
  }

  /** Whether this runtime has a condition registered for `key`. */
  private hasCondition(key: string): boolean {
    return this.conditions.has(key);
  }

  /**
   * Reset runtime registrations.
   */
  dispose(): void {
    this.conditions.clear();
    this.resolvers.clear();
    this.inFlightEnsures.clear();
    this.deferredCondition = undefined;
  }

  /**
   * Which condition a resolver deferred during the most recent `ensure()`.
   * `undefined` unless the last `ensure()` returned DEFERRED. Falls through
   * to the parent if the parent phase was the one that deferred. Read by the
   * caller (e.g. a page resume handler) to know what to re-check on revive.
   */
  getDeferredCondition(): { condition: string; params?: Record<string, unknown> } | undefined {
    return this.deferredCondition ?? this.parent?.getDeferredCondition();
  }

  /**
   * Parent-first orchestration: route refs by ownership, resolve the
   * parent-owned subset via the parent to READY, then resolve this
   * runtime's own subset. A ref is "owned" by whichever runtime in the
   * chain has its condition registered — this runtime takes precedence
   * over the parent (child overrides parent). A ref owned by neither is
   * a programmer error.
   */
  private async runEnsureWithParent(target: Target): Promise<EnsureResult> {
    try {
      // Clear any deferred condition from a prior call on this runtime.
      // If the parent phase defers below, this runtime's phase never runs,
      // and getDeferredCondition() must fall through to the parent — so the
      // local field must not hold a stale value from an earlier ensure().
      this.deferredCondition = undefined;

      const { parentOwned, selfOwned, neither } = this.partitionRefs(target.conditions);

      if (neither.length > 0) {
        throw new Error(
          `No runtime owns condition "${neither[0].condition}". ` +
          `Register it on this runtime or a parent via registerCondition().`,
        );
      }

      if (parentOwned.length > 0 && this.parent) {
        const result = await this.parent.ensure({
          key: target.key,
          conditions: parentOwned,
        });
        if (result !== EnsureResult.READY) {
          return result;
        }
      }

      if (selfOwned.length === 0) {
        return EnsureResult.READY;
      }

      return this.runEnsure({ key: target.key, conditions: selfOwned });
    } catch (err) {
      console.error('[ConditionRuntime] ensure failed:', err);
      return EnsureResult.FAILED;
    }
  }

  /**
   * Split refs by ownership. A ref registered on this runtime is
   * self-owned (child overrides parent); otherwise it delegates to the
   * parent if the parent owns it; otherwise it is owned by no one.
   */
  private partitionRefs(refs: ConditionRef[]): {
    parentOwned: ConditionRef[];
    selfOwned: ConditionRef[];
    neither: ConditionRef[];
  } {
    const parentOwned: ConditionRef[] = [];
    const selfOwned: ConditionRef[] = [];
    const neither: ConditionRef[] = [];
    for (const ref of refs) {
      if (this.hasCondition(ref.condition)) {
        selfOwned.push(ref);
      } else if (this.parent?.hasCondition(ref.condition) ?? false) {
        parentOwned.push(ref);
      } else {
        neither.push(ref);
      }
    }
    return { parentOwned, selfOwned, neither };
  }

  private async runEnsure(target: Target): Promise<EnsureResult> {
    try {
      // A non-DEFERRED outcome clears any previously deferred condition.
      this.deferredCondition = undefined;

      // Work at the ConditionRef level so that a target may legitimately
      // contain the same condition key with different params (e.g. two
      // `feature_check` refs with different feature flags). Each ref is
      // resolved with its own params; same-key siblings stay pending for
      // their own resolution rather than being dropped together.
      let pending = this.findUnsatisfiedRefs(target.conditions);

      while (pending.length > 0) {
        // Pick the next ref to resolve. A ref is "ready" when none of its
        // declared `dependsOn` are also pending — so a condition whose
        // dependency is in the same target resolves after that dependency,
        // while dependencies outside the target are ignored for ordering.
        // Falls back to the first pending ref when none is ready (a real
        // dependency cycle, or an unsatisfiable external dep); the re-check
        // loop + post-resolve verification still keep the result correct.
        const condRef =
          pending.find((ref) => this.isReady(ref, pending)) ?? pending[0];
        const condKey = condRef.condition;
        const resolver = this.resolvers.get(condKey);

        if (!resolver) {
          throw new Error(
            `No resolver registered for condition "${condKey}". ` +
            `Register one with runtime.registerResolver().`
          );
        }

        const ctx: ResolveContext = {
          target,
          params: condRef.params,
          runtime: this.createRuntimeView(),
        };

        const result = await resolver.resolve(ctx);

        if (result === ResolveResult.CANCEL) {
          return EnsureResult.CANCEL;
        }

        if (result === ResolveResult.FAILED) {
          return EnsureResult.FAILED;
        }

        if (result === ResolveResult.DEFERRED) {
          // The resolver kicked off a side-flow (e.g. navigated to a page)
          // and returned without satisfying the condition yet. Record which
          // condition is pending so the caller can re-check it on revive,
          // and stop the loop — the chain resumes on the next `ensure()`.
          this.deferredCondition = { condition: condKey, params: condRef.params };
          return EnsureResult.DEFERRED;
        }

        if (!this.isSatisfied(condKey, condRef.params)) {
          return EnsureResult.FAILED;
        }

        // SUCCESS — drop ONLY the ref just resolved (by identity) and
        // re-check the still-pending refs. Already-satisfied refs that
        // were never pending are NOT re-checked, and same-key siblings
        // with different params are preserved for their own resolution.
        pending = this.findUnsatisfiedRefs(
          pending.filter((ref) => ref !== condRef),
        );
      }

      return EnsureResult.READY;
    } catch (err) {
      console.error('[ConditionRuntime] ensure failed:', err);
      return EnsureResult.FAILED;
    }
  }

  /**
   * A ref is ready when none of its declared dependencies are also pending
   * (i.e. unsatisfied within this target). Dependencies outside the target
   * set don't block — they're resolved elsewhere or already satisfied.
   */
  private isReady(ref: ConditionRef, pending: ConditionRef[]): boolean {
    const deps = this.conditions.get(ref.condition)?.dependsOn ?? [];
    return !pending.some(
      (other) => other !== ref && deps.includes(other.condition),
    );
  }

  /**
   * Find ConditionRefs that are not yet satisfied (preserves duplicates
   * and params so same-key refs are tracked individually).
   */
  private findUnsatisfiedRefs(refs: ConditionRef[]): ConditionRef[] {
    return refs.filter((ref) => !this.isSatisfied(ref.condition, ref.params));
  }

  private createRuntimeView(): RuntimeView {
    return {
      isSatisfied: (key, params) => this.isSatisfied(key, params),
    };
  }

  private createEnsureKey(target: Target): string {
    const conditionsKey = target.conditions
      .map((ref) => `${ref.condition}:${this.stableSerialize(ref.params)}`)
      .join('|');

    return `${target.key}#${conditionsKey}`;
  }

  private stableSerialize(value: unknown): string {
    if (value == null) {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      );
      return `{${entries
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableSerialize(item)}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
