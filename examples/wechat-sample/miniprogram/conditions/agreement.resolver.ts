// ============================================================
// Demo: Privacy Agreement Resolver (custom in-page overlay)
//
// The agreement is presented as a custom in-page overlay (scrollable
// full text), NOT wx.showModal. The resolver therefore must drive
// page-owned UI — it reaches the controller's initiating page through the
// owner channel: the page declares `owner: this` on its journey controller,
// and implements `presentAgreement()` as a normal method (no global
// state, no registration hook, no cleanup). The overlay's buttons
// resolve that promise.
//
// The resolver declares the OWNER SHAPE it needs (Resolver<AgreementOwner>).
// Any page initiating an agreement controller satisfies it structurally by
// having a presentAgreement() method; a page with a different UI shape
// would pass an adapter object as `owner` instead of `this`.
//
// condition owns the condition; the page owns the overlay UI; the
// library transports the owner, uninterpreted.
// ============================================================

import type { Resolver, ResolveContext } from '@mini-dev/condition';
import { ResolveResult } from '@mini-dev/condition';

/** The owner shape this resolver requires: an in-page agreement overlay. */
export interface AgreementOwner {
  presentAgreement(): Promise<boolean>;
}

export class AgreementResolver implements Resolver<AgreementOwner> {
  condition = 'agreement';

  async resolve(ctx: ResolveContext<AgreementOwner>): Promise<ResolveResult> {
    const page = ctx.owner;
    if (!page?.presentAgreement) {
      // Controller started without a capable owner — explicit failure, no crash.
      return ResolveResult.FAILED;
    }
    const agreed = await page.presentAgreement();
    if (agreed) {
      wx.setStorageSync('__demo_agreement', true);
      return ResolveResult.SUCCESS;
    }
    return ResolveResult.CANCEL;
  }
}
