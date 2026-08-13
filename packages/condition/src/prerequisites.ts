// ============================================================
// @mini-dev/condition - Page-edge prerequisite helpers
// Platform-free sugar over Target + a resume handler that revives
// a deferred flow when the user returns to the originating page.
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
 *  — whether it's the app-level global flow or a page flow with a parent. */
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

/** Build a core `Target` from a page-edge `PrerequisiteRef[]`. */
export function createTarget(key: string, prereqs: PrerequisiteRef[]): Target {
  return {
    key,
    conditions: normalizePrerequisites(prereqs),
  };
}

// ---- Resume handler (start / resume / pause / dispose) ----

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
  /** Called once the flow reaches READY (all prerequisites satisfied). */
  onReady: () => void;
  /**
   * Called when the flow terminates — either a resolver returned CANCEL /
   * FAILED, or a deferred condition was still unsatisfied when the user
   * returned to the page (denied / went back). Optional.
   */
  onCancel?: () => void;
}

/**
 * Lifecycle handlers that run a prerequisite flow and revive it across
 * cross-page side-flows.
 *
 * The contract:
 * - A resolver that can satisfy a condition in-call (modal, API call)
 *   returns SUCCESS / CANCEL / FAILED and the chain proceeds within one
 *   `ensure()`.
 * - A resolver that needs another page triggers the navigation itself and
 *   returns DEFERRED. `ensure()` then returns an outcome with
 *   `result: DEFERRED` and `deferredCondition` identifying which condition
 *   to re-check. When the user returns (resume after pause), the flow
 *   revives: if the deferred condition is now satisfied, the chain
 *   continues; if not, the flow terminates (the user denied / abandoned).
 *
 * The condition library does NOT own navigation or cross-page result
 * relay — the resolver triggers navigation with whatever router the app
 * uses, and the condition's `satisfied()` is the only completion signal.
 *
 * Wire the returned handlers into the page/component lifecycle:
 * ```ts
 * const flow = createPrerequisiteController({ runtime, key, prereqs, onReady });
 * Page({
 *   onLoad: flow.start, onShow: flow.resume,
 *   onHide: flow.pause, onUnload: flow.dispose,
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
  const { runtime, key, prereqs, onReady, onCancel } = opts;
  const target = createTarget(key, prereqs);

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
    } else {
      // CANCEL / FAILED — the chain stopped.
      deferred = null;
      terminated = true;
      onCancel?.();
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
      // after start is skipped — seenHide is still false — so the flow
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
        // side-flow, which would otherwise loop.
        deferred = null;
        terminated = true;
        onCancel?.();
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
