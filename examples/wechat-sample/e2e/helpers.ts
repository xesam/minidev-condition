/**
 * Shared helpers for condition wechat-sample e2e tests.
 */
import automator from 'miniprogram-automator';

/** Type of MiniProgram returned by automator.launch(). */
type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;

/** Simple delay helper (MiniProgram lacks waitFor, Page has it). */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** All demo storage keys cleared/set by helpers. */
export const STORAGE_KEYS = [
  '__demo_agreement',
  '__demo_city',
  '__demo_login',
  '__demo_realname',
] as const;

// ---- State helpers (via evaluate) ----

/** Remove all demo storage keys and clear single-flight dedup cache. */
export async function clearAllState(mp: MiniProgram): Promise<void> {
  await mp.evaluate((keys: string[]) => {
    keys.forEach((k: string) => {
      try { wx.removeStorageSync(k); } catch { /* ignore */ }
    });
  }, STORAGE_KEYS as unknown as string[]);
  // Clear the runtime's in-flight dedup map so re-running the same page's
  // ensure() doesn't return a stale unresolved promise from a prior run.
  await mp.evaluate(() => {
    try {
      const rt = (getApp() as any).globalData.runtime;
      // ConditionRuntime stores pending ensures in inFlightEnsures (a Map).
      // Access & clear it to prevent single-flight dedup from blocking re-runs.
      const inflight = (rt as any).inFlightEnsures;
      if (inflight && typeof inflight.clear === 'function') {
        inflight.clear();
      }
    } catch { /* runtime not initialized yet — fine */ }
  });
}

/** Set multiple storage keys at once. */
export async function setStorage(
  mp: MiniProgram,
  entries: Record<string, unknown>,
): Promise<void> {
  await mp.evaluate((data: Record<string, unknown>) => {
    Object.entries(data).forEach(([key, value]) => {
      wx.setStorageSync(key, value);
    });
  }, entries);
}

/** Home page is ready when agreement + city are both set. */
export async function presetHomeReady(mp: MiniProgram): Promise<void> {
  await setStorage(mp, {
    __demo_agreement: true,
    __demo_city: 'Beijing',
  });
}

/** Product page is ready when login + realname are both set. */
export async function presetProductReady(mp: MiniProgram): Promise<void> {
  await setStorage(mp, {
    __demo_login: true,
    __demo_realname: true,
  });
}

// ---- Navigation helpers ----

/** Navigate to a page and wait for it to load. */
export async function navigateTo(
  mp: MiniProgram,
  url: string,
) {
  await mp.navigateTo(url);
  await sleep(500);
  const page = await mp.currentPage();
  if (!page) throw new Error('Page not found after navigateTo: ' + url);
  return page;
}

/** Re-launch to the given page, returns the page (guaranteed non-null after launch). */
export async function reLaunchTo(
  mp: MiniProgram,
  url: string,
) {
  const page = await mp.reLaunch(url);
  if (!page) throw new Error('Page not found after reLaunch: ' + url);
  await sleep(800);
  return page;
}

// ---- Modal helpers ----
// mockWxMethod does not reliably intercept callback-based APIs like wx.showModal.
// We patch wx.showModal directly via evaluate() to auto-resolve the callbacks.

/** Patch wx.showModal to auto-confirm (calls success callback with confirm:true). */
export async function mockModalConfirm(mp: MiniProgram): Promise<void> {
  await mp.evaluate(() => {
    (wx as any).__originalShowModal = wx.showModal;
    (wx as any).showModal = (options: any) => {
      if (options.success) {
        options.success({ confirm: true, cancel: false });
      }
      if (options.complete) {
        options.complete({ confirm: true, cancel: false });
      }
    };
  });
}

/** Patch wx.showModal to auto-cancel (calls success callback with confirm:false). */
export async function mockModalCancel(mp: MiniProgram): Promise<void> {
  await mp.evaluate(() => {
    (wx as any).__originalShowModal = wx.showModal;
    (wx as any).showModal = (options: any) => {
      if (options.success) {
        options.success({ confirm: false, cancel: true });
      }
      if (options.complete) {
        options.complete({ confirm: false, cancel: true });
      }
    };
  });
}

/** Restore the original wx.showModal. */
export async function restoreModalMock(mp: MiniProgram): Promise<void> {
  await mp.evaluate(() => {
    if ((wx as any).__originalShowModal) {
      wx.showModal = (wx as any).__originalShowModal;
      delete (wx as any).__originalShowModal;
    }
  });
}

// ---- exitMiniProgram mock ----
// The home page calls wx.exitMiniProgram when the privacy agreement is
// denied. In the automator that would tear down the session, so we patch
// it to record the call into storage instead.

/** Patch wx.exitMiniProgram to record the call into __demo_exit_called. */
export async function mockExitMiniProgram(mp: MiniProgram): Promise<void> {
  await mp.evaluate(() => {
    (wx as any).__originalExitMiniProgram = wx.exitMiniProgram;
    (wx as any).exitMiniProgram = (_options?: any) => {
      wx.setStorageSync('__demo_exit_called', true);
      if ((wx as any).__originalExitMiniProgram) {
        // do NOT actually call the original — would close the session
      }
    };
  });
}

/** Whether wx.exitMiniProgram was called since the mock was installed. */
export async function wasExitCalled(mp: MiniProgram): Promise<boolean> {
  return mp.evaluate(() => !!wx.getStorageSync('__demo_exit_called'));
}

/** Restore the original wx.exitMiniProgram. */
export async function restoreExitMock(mp: MiniProgram): Promise<void> {
  await mp.evaluate(() => {
    if ((wx as any).__originalExitMiniProgram) {
      wx.exitMiniProgram = (wx as any).__originalExitMiniProgram;
      delete (wx as any).__originalExitMiniProgram;
    }
    wx.removeStorageSync('__demo_exit_called');
  });
}

// ---- Element / assertion helpers ----

/** Get an element's text content. */
export async function getElementText(
  page: NonNullable<Awaited<ReturnType<MiniProgram['currentPage']>>>,
  selector: string,
): Promise<string> {
  const el = await page.$(selector);
  if (!el) return '';
  return (await el.text()) || '';
}
