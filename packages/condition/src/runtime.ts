// ============================================================
// @mini-dev/condition - ConditionRuntime
// Core prerequisite runtime engine
// ============================================================

import type {
  Condition,
  ConditionRef,
  EnsureOutcome,
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
  private inFlightEnsures: Map<string, Promise<EnsureOutcome>> = new Map();

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
   *
   * Returns an `EnsureOutcome` whose `result` is one of:
   * - `READY`    — all conditions satisfied
   * - `CANCEL`   — a resolver explicitly cancelled
   * - `FAILED`   — a resolver failed, threw, or reported success but left the
   *                condition unsatisfied
   * - `DEFERRED` — a resolver kicked off a cross-page side-flow; the
   *                `deferredCondition` field names the condition to re-check
   *                on the next `ensure()` call (e.g. on the originating
   *                page's next onShow / resume)
   */
  async ensure(target: Target): Promise<EnsureOutcome> {
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
   *
   * **Warning**: This clears *all* registered conditions and resolvers on this
   * runtime. Intended for page-scoped runtimes (those constructed with a
   * `parent`) that are discarded when the page unloads. Calling it on an
   * app-global (root) runtime wipes the shared registration and breaks all
   * subsequent `ensure()` calls until conditions are re-registered.
   */
  dispose(): void {
    this.conditions.clear();
    this.resolvers.clear();
    this.inFlightEnsures.clear();
  }

  /**
   * Parent-first orchestration: route refs by ownership, resolve the
   * parent-owned subset via the parent to READY, then resolve this
   * runtime's own subset. A ref is "owned" by whichever runtime in the
   * chain has its condition registered — this runtime takes precedence
   * over the parent (child overrides parent). A ref owned by neither is
   * a programmer error.
   */
  private async runEnsureWithParent(target: Target): Promise<EnsureOutcome> {
    const { parentOwned, selfOwned, neither } = this.partitionRefs(target.conditions);

    if (neither.length > 0) {
      return {
        result: EnsureResult.ERROR,
        message:
          `条件 "${neither[0].condition}" 未在任何 runtime 上注册。` +
          `请通过 registerCondition() 在当前 runtime 或其 parent 上注册该条件。`,
      };
    }

    if (parentOwned.length > 0 && this.parent) {
      const parentOutcome = await this.parent.ensure({
        key: target.key,
        conditions: parentOwned,
      });
      if (parentOutcome.result !== EnsureResult.READY) {
        // Propagate the parent's outcome (including deferredCondition when DEFERRED).
        return parentOutcome;
      }
    }

    if (selfOwned.length === 0) {
      return { result: EnsureResult.READY };
    }

    return this.runEnsure({ key: target.key, conditions: selfOwned });
  }

  /**
   * Split refs by ownership. A ref registered on this runtime is
   * self-owned (child overrides parent); otherwise it delegates to the
   * parent chain if any ancestor owns it; otherwise it is owned by no one.
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
      } else if (this.parent?.deepHasCondition(ref.condition) ?? false) {
        parentOwned.push(ref);
      } else {
        neither.push(ref);
      }
    }
    return { parentOwned, selfOwned, neither };
  }

  /** Whether this runtime or any ancestor has `key` registered. */
  private deepHasCondition(key: string): boolean {
    return this.conditions.has(key) || (this.parent?.deepHasCondition(key) ?? false);
  }

  private async runEnsure(target: Target): Promise<EnsureOutcome> {
    try {
      // Work at the ConditionRef level so that a target may legitimately
      // contain the same condition key with different params (e.g. two
      // `feature_check` refs with different feature flags). Each ref is
      // resolved with its own params; same-key siblings stay pending for
      // their own resolution rather than being dropped together.
      let pending = this.findUnsatisfiedRefs(target.conditions);
      // runtimeView is stateless beyond `this` — create once per ensure call.
      const runtimeView = this.createRuntimeView();

      while (pending.length > 0) {
        // Pick the next ref to resolve. A ref is "ready" when none of its
        // declared `dependsOn` are also pending — so a condition whose
        // dependency is in the same target resolves after that dependency,
        // while dependencies outside the target are ignored for ordering.
        // Falls back to the first pending ref when none is ready (a real
        // dependency cycle, or an unsatisfiable external dep); the re-check
        // loop + post-resolve verification still keep the result correct.
        const readyRef = pending.find((ref) => this.isReady(ref, pending));
        if (!readyRef) {
          const keys = pending.map((r) => r.condition).join(', ');
          console.warn(
            `[ConditionRuntime] 检测到条件依赖循环: [${keys}]，将回退到数组顺序执行。`,
          );
        }
        const condRef = readyRef ?? pending[0];
        const condKey = condRef.condition;
        const resolver = this.resolvers.get(condKey);

        if (!resolver) {
          return {
            result: EnsureResult.ERROR,
            message:
              `条件 "${condKey}" 未注册 resolver。` +
              `请通过 runtime.registerResolver() 注册对应的 resolver。`,
          };
        }

        const ctx: ResolveContext = {
          target,
          params: condRef.params,
          runtime: runtimeView,
        };

        const result = await resolver.resolve(ctx);

        if (result === ResolveResult.CANCEL) {
          return { result: EnsureResult.CANCEL };
        }

        if (result === ResolveResult.FAILED) {
          return { result: EnsureResult.FAILED };
        }

        if (result === ResolveResult.DEFERRED) {
          // The resolver kicked off a side-flow (e.g. navigated to a page)
          // and returned without satisfying the condition yet. Return the
          // deferred condition inline so the caller never needs a separate
          // getDeferredCondition() call — eliminating shared mutable state.
          return { result: EnsureResult.DEFERRED, deferredCondition: condRef };
        }

        if (!this.isSatisfied(condKey, condRef.params)) {
          return { result: EnsureResult.FAILED };
        }

        // SUCCESS — drop ONLY the ref just resolved (by identity) and
        // re-check the still-pending refs. Already-satisfied refs that
        // were never pending are NOT re-checked, and same-key siblings
        // with different params are preserved for their own resolution.
        pending = this.findUnsatisfiedRefs(
          pending.filter((ref) => ref !== condRef),
        );
      }

      return { result: EnsureResult.READY };
    } catch (err) {
      return this.failedOutcome(err);
    }
  }

  /** Log the error and return a FAILED outcome. Used by both catch blocks. */
  private failedOutcome(err: unknown): EnsureOutcome {
    console.error('[ConditionRuntime] 条件编排失败:', err);
    return { result: EnsureResult.FAILED };
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
