// ============================================================
// Demo: City Resolver
// Two completion strategies, forked on ctx.params:
//   - External launch param (params.externalCity, injected by the home
//     page's onLoad via prereqs params — see DevTools custom compile
//     mode「外部启动带city参数」): land it directly — write storage
//     (fills a missing city OR replaces a differing one; which one is
//     decided by CityCondition's param-aware satisfied(), the resolver
//     just lands the desired state), return SUCCESS. No navigation,
//     no DEFERRED.
//   - No param: navigation to the city selection page (DEFERRED).
//     See login.ts for the DEFERRED contract.
// ============================================================

import type { ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';
import type { Resolver } from '@mini-dev/condition';

export class CityResolver implements Resolver {
  condition = 'city';

  async resolve(ctx: ResolveContext) {
    const externalCity = ctx.params?.externalCity as string | undefined;
    if (externalCity) {
      // Startup param completes the condition in-call: land it and report
      // SUCCESS. The runtime's post-resolve verification re-checks
      // isSatisfied() — reading the storage we just wrote — and the chain
      // proceeds without ever leaving the page. satisfied() remains the
      // single completion signal; the param only chose HOW to resolve.
      wx.setStorageSync('__demo_city', externalCity);
      return ResolveResult.SUCCESS;
    }
    // 300ms before navigateTo — see login.ts: on revive, an immediate
    // wx.navigateTo is dropped while the back transition is still settling.
    setTimeout(() => wx.navigateTo({ url: '/pages/city/city' }), 300);
    return ResolveResult.DEFERRED;
  }
}
