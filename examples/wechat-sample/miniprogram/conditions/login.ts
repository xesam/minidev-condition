// ============================================================
// Demo: Login Condition
// Checks if the user has logged in. Realistic flow: the product page
// requires login on entry (page-edge flow). A separate realname flow
// runs later, triggered by the "支付" button.
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class LoginCondition implements Condition {
  key = 'login';

  satisfied(): boolean {
    return !!wx.getStorageSync('__demo_login');
  }
}
