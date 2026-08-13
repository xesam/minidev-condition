// ============================================================
// Demo: Privacy Agreement Resolver (custom in-page overlay)
//
// The agreement is presented as a custom in-page overlay (scrollable
// full text), NOT wx.showModal. The resolver therefore must drive
// page-owned UI: the home page registers a `presentAgreement()` hook
// on getApp().globalData (returns Promise<boolean>), and this resolver
// awaits it. The overlay's 同意/不同意 buttons resolve that promise.
//
// condition owns the condition; the page owns the overlay UI.
// ============================================================

import type { Resolver, ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';

export class AgreementResolver implements Resolver {
  condition = 'agreement';

  async resolve(_ctx: ResolveContext): Promise<ResolveResult> {
    const present = getApp().globalData.presentAgreement as
      | (() => Promise<boolean>)
      | undefined;
    if (!present) {
      // No UI hook registered — treat as failure rather than blocking.
      return ResolveResult.FAILED;
    }
    const agreed = await present();
    if (agreed) {
      wx.setStorageSync('__demo_agreement', true);
      return ResolveResult.SUCCESS;
    }
    return ResolveResult.CANCEL;
  }
}
