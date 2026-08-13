// ============================================================
// Demo: City Resolver
// Triggers navigation to the city selection page and returns DEFERRED.
// See login.ts for the DEFERRED contract.
// ============================================================

import type { ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';
import type { Resolver } from '@mini-dev/condition';

export class CityResolver implements Resolver {
  condition = 'city';

  async resolve(_ctx: ResolveContext) {
    // 300ms before navigateTo — see login.ts: on revive, an immediate
    // wx.navigateTo is dropped while the back transition is still settling.
    setTimeout(() => wx.navigateTo({ url: '/pages/city/city' }), 300);
    return ResolveResult.DEFERRED;
  }
}
