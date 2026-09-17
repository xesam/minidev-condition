/**
 * E2E: External launch param completes city (ACCEPTANCE.md Group D)
 *
 * Simulates the DevTools custom compile mode「外部启动带city参数」by
 * re-launching the home page with a query param — the same onLoad options
 * the compile mode produces in DevTools.
 * - D1 param + no local city: resolver lands it in-call (SUCCESS), no
 *   navigation to the city page, storage persisted, UI annotated.
 * - D2 param + local city DIFFERS: desired ≠ actual → resolver REPLACES
 *   the local city in-place (SUCCESS), no navigation.
 * - D3 regression, no param: original DEFERRED path — lands on city page.
 * - D4 param + agreement missing: overlay first (param never bypasses the
 *   agreement flow); after agreeing, city completes without leaving home.
 * - D5 after landing, re-enter without param: ready from storage, no
 *   annotation — the landed storage, not the transient param, is the signal.
 *
 * Core-level guarantees (params → ResolveContext passthrough, post-resolve
 * verification) are covered by the package's unit tests; this group only
 * asserts end-to-end observable behavior.
 */
import automator from 'miniprogram-automator';
import {
  clearAllState, reLaunchTo, setStorage, sleep,
} from './helpers';

type MiniProgram = Awaited<ReturnType<typeof automator.launch>>;
let mp: MiniProgram;

beforeAll(async () => {
  mp = await automator.launch({
    projectPath: __dirname + '/..',
    timeout: 120_000,
  });
}, 180_000);
afterAll(async () => { await mp?.close(); });
beforeEach(async () => {
  await clearAllState(mp);
});

/** Text of the home page's ready-card info line ('' when not ready). */
async function infoText(): Promise<string> {
  const page = await mp.currentPage();
  const el = page ? await page.$('.info') : null;
  return (await el?.text()) || '';
}

/** Current value of __demo_city ('' when unset). */
async function cityInStorage(): Promise<string> {
  return mp.evaluate(() => (wx.getStorageSync('__demo_city') as string) || '');
}

describe('D. 外部启动参数补齐城市（编译模式演示）', () => {
  it('D1 启动带 city、本地缺失 — 免跳页直接落地就绪', async () => {
    await setStorage(mp, { __demo_agreement: true });
    const page = await reLaunchTo(mp, '/pages/index/index?city=杭州');
    await sleep(500);

    // Resolver returned SUCCESS — the flow never left the home page.
    expect(page.path).toBe('pages/index/index');
    const after = await mp.currentPage();
    expect(after?.path).toBe('pages/index/index');

    // Ready card shows the landed city + its source annotation.
    const info = await infoText();
    expect(info).toContain('杭州');
    expect(info).toContain('来自启动参数');

    // The param was landed into storage — the only completion signal.
    expect(await cityInStorage()).toBe('杭州');
  });

  it('D2 本地已有其他城市 — 启动参数替换本地', async () => {
    await setStorage(mp, { __demo_agreement: true, __demo_city: '北京' });
    await reLaunchTo(mp, '/pages/index/index?city=杭州');

    // Param-aware evaluation: local(北京) ≠ desired(杭州) → unsatisfied
    // → the resolver runs and REPLACES the local city, still in-call.
    const info = await infoText();
    expect(info).toContain('杭州');
    expect(info).toContain('来自启动参数');

    // The replacement converged into storage — the single fact source.
    expect(await cityInStorage()).toBe('杭州');
  });

  it('D3 回归 — 无启动参数仍走跳城市页路径', async () => {
    await setStorage(mp, { __demo_agreement: true });
    await reLaunchTo(mp, '/pages/index/index');
    await sleep(2000); // resolver's setTimeout(300) + navigation settle

    const page = await mp.currentPage();
    expect(page?.path).toBe('pages/city/city');
  });

  it('D4 参数不绕过协议 — 同意后免跳页完成城市', async () => {
    await reLaunchTo(mp, '/pages/index/index?city=杭州');
    await sleep(500);

    // Agreement overlay first — the launch param does not shortcut it.
    let page = await mp.currentPage();
    expect(page?.path).toBe('pages/index/index');
    const overlay = await page?.$('.overlay');
    expect(overlay).not.toBeNull();

    const btns = await page?.$$('.sheet-actions button');
    await btns[1]?.tap(); // 同意
    await sleep(1500);

    // Agreement completed in-overlay, then city landed from the launch
    // param — the city page was never pushed onto the stack.
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/index/index');
    const info = await infoText();
    expect(info).toContain('杭州');
    expect(info).toContain('来自启动参数');
  });

  it('D5 落地后无参再入 — 就绪不依赖启动参数', async () => {
    // Simulate a previous D1 landing: city persisted in storage.
    await setStorage(mp, { __demo_agreement: true, __demo_city: '杭州' });
    await reLaunchTo(mp, '/pages/index/index'); // no param this time

    // Ready straight from storage; annotation gone with the param — the
    // landed state, not the transient launch query, drives readiness.
    const info = await infoText();
    expect(info).toContain('杭州');
    expect(info).not.toContain('来自启动参数');
    expect(await cityInStorage()).toBe('杭州');
  });
});
