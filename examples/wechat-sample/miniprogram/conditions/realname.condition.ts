// ============================================================
// Demo: Realname Condition
// Checks if the user has completed real-name verification
// Page-scoped (only needed for payment page)
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class RealnameCondition implements Condition {
  key = 'realname';

  satisfied(): boolean {
    return !!wx.getStorageSync('__demo_realname');
  }
}
