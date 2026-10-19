// ============================================================
// Demo helper: navigation triggered by DEFERRED resolvers.
//
// Two platform realities live here:
// 1. The 300ms delay — on revive (resume after back), an immediate
//    wx.navigateTo is dropped while the back transition is still
//    settling, so the navigation must be deferred slightly.
// 2. fail logging — a silent nav failure (stack overflow at 10 pages,
//    bad route) leaves the controller parked in the deferred state until the
//    next resume terminates; the only place it becomes observable is
//    this callback.
// ============================================================

export function deferredNavigateTo(url: string): void {
  setTimeout(() => {
    wx.navigateTo({
      url,
      fail: (err) => {
        console.error(`[nav] navigateTo failed: ${url}`, err);
      },
    });
  }, 300);
}
