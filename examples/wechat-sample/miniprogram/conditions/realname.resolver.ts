// ============================================================
// Demo: Realname Resolver
// Triggers navigation to the real-name verification page and returns DEFERRED.
// See login.resolver.ts for the DEFERRED contract.
// ============================================================

import type { ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';
import type { Resolver } from '@mini-dev/condition';
import { deferredNavigateTo } from '../utils/nav';

export class RealnameResolver implements Resolver {
  condition = 'realname';

  async resolve(_ctx: ResolveContext) {
    // Why the helper defers + logs: see utils/nav.ts.
    deferredNavigateTo('/pages/realname/realname');
    return ResolveResult.DEFERRED;
  }
}
