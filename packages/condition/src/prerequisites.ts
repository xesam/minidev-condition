// ============================================================
// @mini-dev/condition - Page-edge prerequisite helpers
// Platform-free sugar over Target + a resume handler that revives
// a deferred controller when the user returns to the originating page.
//
// Pure core has no concept of page lifecycle (onLoad/onShow/onHide).
// These helpers translate page lifecycle into explicit ensure() calls
// — they are still platform-free; the page wires start/resume/pause/
// dispose to its own lifecycle itself.
// ============================================================

import type { ConditionRef, Target } from './types';
import { EnsureResult, ResolveResult } from './types';
import type { EnsureOutcome } from './types';

/**
 * A prerequisite as accepted at the page edge. A bare string is treated as
 * `{ condition: <string> }`. Core's `Target.conditions` is strictly
 * `ConditionRef[]` — use {@link normalizePrerequisites} / {@link createTarget}
 * to bridge to a core `Target`.
 */
export type PrerequisiteRef = string | ConditionRef;

/** Runtime surface a page-edge helper needs. A {@link ConditionRuntime} satisfies it
 *  — whether it's the app-level global runtime or a page-scoped runtime with a parent. */
export interface PrerequisiteRuntime {
  ensure(target: Target): Promise<EnsureOutcome>;
  isSatisfied(key: string, params?: Record<string, unknown>): boolean;
}

/** Normalize page-edge `PrerequisiteRef[]` to core's strict `ConditionRef[]`. */
export function normalizePrerequisites(
  prereqs: PrerequisiteRef[],
): ConditionRef[] {
  return prereqs.map((prereq) =>
    typeof prereq === 'string' ? { condition: prereq } : prereq,
  );
}

/** Build a core `Target` from page-edge prereqs and (optionally) the controller owner. */
export function createTarget(
  key: string,
  prereqs: PrerequisiteRef[],
  owner?: unknown,
): Target {
  return {
    key,
    conditions: normalizePrerequisites(prereqs),
    owner,
  };
}

// ---- Resume handler (start / resume / pause / dispose) ----

/**
 * The outcome passed to {@link PrerequisiteControllerOptions.onCancel} when
 * the controller terminates. Mirrors core `EnsureOutcome`'s CANCEL/FAILED branches:
 * the `cancelledCondition`/`failedCondition` field identifies which condition
 * the controller terminated on, so a page with multiple prerequisites can branch
 * per-condition failure policies without splitting into multiple controllers.
 */
export type CancelOutcome =
  | { result: EnsureResult.CANCEL; cancelledCondition: ConditionRef }
  | { result: EnsureResult.FAILED; failedCondition?: ConditionRef };

/**
 * Options for {@link createPrerequisiteController}.
 */
export interface PrerequisiteControllerOptions {
  /** The runtime that resolves the conditions. */
  runtime: PrerequisiteRuntime;
  /** Target key — typically the page route. Used for single-flight dedup. */
  key: string;
  /** Prerequisites the page needs satisfied before it is ready. */
  prereqs: PrerequisiteRef[];
  /**
   * The initiator of this controller — usually `this` (the page/component
   * instance that owns the controller's lifecycle). Passed through opaquely to
   * resolvers via `ResolveContext.owner`, so an in-call resolver that
   * drives page-owned UI (overlay, custom dialog) reaches the initiating
   * page through typed context instead of global state. Optional;
   * resolvers should handle a missing owner explicitly (e.g. FAILED).
   */
  owner?: unknown;
  /** Called once the controller reaches READY (all prerequisites satisfied). */
  onReady: () => void;
  /**
   * Called when the controller terminates — either a resolver returned CANCEL /
   * FAILED, or a deferred condition was still unsatisfied when the user
   * returned to the page (denied / went back). Optional.
   *
   * The outcome identifies which condition the controller terminated on, e.g.
   * ```ts
   * onCancel: (outcome) => {
   *   if (outcome.result === EnsureResult.CANCEL
   *       && outcome.cancelledCondition.condition === 'agreement') {
   *     wx.exitMiniProgram({});
   *   } else {
   *     controller.start(); // re-attempt a retryable condition
   *   }
   * }
   * ```
   * NOTE: calling `start()` from `onCancel` re-runs the controller from the top;
   * satisfied conditions are skipped, so this is the per-condition retry
   * path. Loop protection is the caller's responsibility — a resolver that
   * immediately re-defers would otherwise loop.
   */
  onCancel?: (outcome: CancelOutcome) => void;
}

/**
 * Lifecycle handlers that run a prerequisite controller and revive it across
 * cross-page side-flows.
 *
 * The contract:
 * - A resolver that can satisfy a condition in-call (modal, API call)
 *   returns SUCCESS / CANCEL / FAILED and the chain proceeds within one
 *   `ensure()`.
 * - A resolver that needs another page triggers the navigation itself and
 *   returns DEFERRED. `ensure()` then returns an outcome with
 *   `result: DEFERRED` and `deferredCondition` identifying which condition
 *   to re-check. When the user returns (resume after pause), the controller
 *   revives: if the deferred condition is now satisfied, the chain
 *   continues; if not, the controller terminates (the user denied / abandoned).
 *
 * The condition library does NOT own navigation or cross-page result
 * relay — the resolver triggers navigation with whatever router the app
 * uses, and the condition's `satisfied()` is the only completion signal.
 *
 * Wire the returned handlers into the page/component lifecycle:
 * ```ts
 * const controller = createPrerequisiteController({
 *   runtime, key, prereqs, owner: this, onReady,
 * });
 * Page({
 *   onLoad: controller.start, onShow: controller.resume,
 *   onHide: controller.pause, onUnload: controller.dispose,
 * });
 * ```
 */
export function createPrerequisiteController(
  opts: PrerequisiteControllerOptions,
): {
  start: () => void;
  resume: () => void;
  pause: () => void;
  dispose: () => void;
} {
  const { runtime, key, prereqs, owner, onReady, onCancel } = opts;
  const target = createTarget(key, prereqs, owner);

  // Per-page-instance state. A fresh page instance (start) resets these,
  // so a re-launched page always gets a fresh attempt — no stale "denied"
  // state carried across page instances, and no runtime-global state needed.
  let deferred: { condition: string; params?: Record<string, unknown> } | null = null;
  let seenHide = false;
  let terminated = false;

  async function run() {
    const outcome = await runtime.ensure(target);
    if (outcome.result === EnsureResult.READY) {
      deferred = null;
      terminated = false;
      onReady();
    } else if (outcome.result === EnsureResult.DEFERRED) {
      // The deferred condition is returned inline — no separate
      // getDeferredCondition() call needed, and no shared-state race.
      deferred = outcome.deferredCondition;
    } else if (outcome.result === EnsureResult.ERROR) {
      // Programmer error (unregistered condition/resolver, dependency
      // cycle) — not a user action. Surface it and terminate; onCancel is
      // for user-driven/controller outcomes only.
      deferred = null;
      terminated = true;
      console.error(
        `[PrerequisiteController] Controller "${key}" terminated on a programmer error: ${outcome.message}`,
      );
    } else {
      // CANCEL / FAILED — the chain stopped. The outcome identifies which
      // condition terminated the controller (mirrors the DEFERRED branch's
      // deferredCondition) so callers can branch per-condition policies.
      deferred = null;
      terminated = true;
      onCancel?.(outcome);
    }
  }

  return {
    start() {
      deferred = null;
      seenHide = false;
      terminated = false;
      void run();
    },
    resume() {
      // Revive only when awaiting a deferred condition AND we genuinely left
      // the page (a prior pause) since deferring. The initial resume right
      // after start is skipped — seenHide is still false — so the controller
      // started in start is not re-triggered.
      if (!deferred || terminated) return;
      if (!seenHide) return;
      seenHide = false;
      if (runtime.isSatisfied(deferred.condition, deferred.params)) {
        deferred = null;
        void run(); // chain resumes — next unsatisfied condition
      } else {
        // User returned without satisfying the deferred condition
        // (denied / went back). Terminate rather than re-triggering the
        // side-flow, which would otherwise loop. Report the deferred ref
        // as the cancelledCondition so per-condition policies work here too.
        const cancelledCondition: ConditionRef = deferred;
        deferred = null;
        terminated = true;
        onCancel?.({
          result: EnsureResult.CANCEL,
          cancelledCondition,
        });
      }
    },
    pause() {
      seenHide = true;
    },
    dispose() {
      deferred = null;
      seenHide = false;
      terminated = false;
    },
  };
}

// Re-exported for resolvers that report modal/API results.
export { ResolveResult };
