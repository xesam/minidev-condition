// ============================================================
// Demo: City Condition
// Checks if the user has selected a city. Realistic flow: after the
// privacy agreement is accepted, the home page checks city. City is
// its own single-condition flow (no dependsOn — the agreement→city
// order is enforced by the home page running two flows in sequence).
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class CityCondition implements Condition {
  key = 'city';

  satisfied(): boolean {
    return !!wx.getStorageSync('__demo_city');
  }
}
