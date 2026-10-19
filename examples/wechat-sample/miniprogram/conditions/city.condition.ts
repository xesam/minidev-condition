// ============================================================
// Demo: City Condition
// satisfied() answers one question: does the local city config match
// the expectation?
//   - No params (normal entry / DEFERRED revive): existence check —
//     satisfied iff a local city is configured.
//   - With params.externalCity (external launch): EXACT match — the
//     param is the DESIRED state, so a local city that differs is an
//     "actual ≠ desired" mismatch → unsatisfied → the resolver runs
//     and REPLACES the local city (not just fills the gap).
// The completion signal stays single-sourced: once the resolver lands
// the desired city, every evaluation (with or without params) agrees.
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class CityCondition implements Condition {
  key = 'city';

  satisfied(params?: Record<string, unknown>): boolean {
    const local = wx.getStorageSync('__demo_city');
    const desired = params?.externalCity as string | undefined;
    if (desired) {
      return local === desired;   // exact match — mismatch → resolver replaces
    }
    return !!local;               // existence check
  }
}
