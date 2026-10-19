// ============================================================
// Demo: Login Resolver
// Triggers navigation to the login page and returns DEFERRED.
//
// The resolver does NOT await a cross-page result. It opens the page
// (the app's own navigation — plain wx.navigateTo) and returns DEFERRED.
// When the user returns to the originating page, onShow revives the
// controller and re-evaluates Condition.satisfied() to decide whether to
// continue. See city.resolver.ts / realname.resolver.ts for the same
// DEFERRED contract.
// ============================================================

import type { Resolver, ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';
import { deferredNavigateTo } from '../utils/nav';

export class LoginResolver implements Resolver {
  condition = 'login';

  async resolve(_ctx: ResolveContext): Promise<ResolveResult> {
    // Why the helper defers + logs: see utils/nav.ts.
    deferredNavigateTo('/pages/login/login');
    return ResolveResult.DEFERRED;
  }
}
