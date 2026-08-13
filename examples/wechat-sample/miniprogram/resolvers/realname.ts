// ============================================================
// Demo: Realname Resolver
// Triggers navigation to the real-name verification page and returns DEFERRED.
// See auth.ts for the DEFERRED contract.
// ============================================================

import type { ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';
import type { Resolver } from '@mini-dev/condition';

export class RealnameResolver implements Resolver {
  condition = 'realname';

  async resolve(_ctx: ResolveContext) {
    // 300ms before navigateTo — see auth.ts: on revive, an immediate
    // wx.navigateTo is dropped while the back transition is still settling.
    setTimeout(() => wx.navigateTo({ url: '/pages/realname/realname' }), 300);
    return ResolveResult.DEFERRED;
  }
}
