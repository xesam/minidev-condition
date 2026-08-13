// ============================================================
// Demo: Login Resolver
// Triggers navigation to the login page and returns DEFERRED.
//
// The resolver does NOT await a cross-page result. It opens the page
// (the app's own navigation — plain wx.navigateTo) and returns DEFERRED.
// When the user returns to the originating page, onShow revives the
// flow and re-evaluates Condition.satisfied() to decide whether to
// continue. See city.ts / realname.ts for the same DEFERRED contract.
// ============================================================

import type { Resolver, ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';

export class LoginResolver implements Resolver {
  condition = 'login';

  async resolve(_ctx: ResolveContext): Promise<ResolveResult> {
    // 300ms before navigateTo — on revive, an immediate wx.navigateTo
    // is dropped while the back transition is still settling.
    setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 300);
    return ResolveResult.DEFERRED;
  }
}
