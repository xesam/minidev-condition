// ============================================================
// Demo: Agreement Condition
// Checks if user has agreed to the terms of service
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class AgreementCondition implements Condition {
  key = 'agreement';

  satisfied(): boolean {
    return !!wx.getStorageSync('__demo_agreement');
  }
}
