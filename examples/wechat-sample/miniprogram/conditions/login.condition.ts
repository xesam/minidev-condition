// ============================================================
// Demo: Login Condition
// Checks if the user has logged in. Realistic path: the product page
// requires login on entry (page-edge controller). A separate realname controller
// runs later, triggered by the "支付" button.
// ============================================================

import type { Condition } from '@mini-dev/condition';

export class LoginCondition implements Condition {
  key = 'login';

  satisfied(): boolean {
    return !!wx.getStorageSync('__demo_login');
  }
}
