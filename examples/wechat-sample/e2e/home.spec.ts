/**
 * E2E: Home page realistic flow (ACCEPTANCE.md Group A)
 *
 * Tests privacy agreement (custom overlay) → city orchestration.
 * - A1 all satisfied: no overlay, ready immediately.
 * - A2 all missing: agree → city page → select → ready.
 * - A3 deny agreement: wx.exitMiniProgram called, no city nav.
 * - A4 agreement set, city missing: skip overlay → city page.
 * - A5 city page back without selecting: auto re-navigate to city page.
 */
import automator from 'miniprogram-automator';
import {
  clearAllState, mockExitMiniProgram, presetHomeReady, reLaunchTo,
  restoreExitMock, restoreModalMock, setStorage, sleep, wasExitCalled,
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
  await restoreModalMock(mp);
  await restoreExitMock(mp);
});

describe('A. 首页：隐私协议 + 城市', () => {
  it('A1 全部满足 — 不弹协议、直接就绪', async () => {
    await presetHomeReady(mp);
    const page = await reLaunchTo(mp, '/pages/index/index');
    expect(await page.$('.overlay')).toBeNull();
    expect(await page.$('.loading')).toBeNull();
    const info = await page.$('.info');
    expect(await info?.text()).toContain('当前城市');
    const btn = await page.$('button');
    expect(await btn?.text()).toBe('去商品页');
    expect(page.path).toBe('pages/index/index');
  });

  it('A2 全缺失 — 协议(同意) → 城市页 → 选城市 → 就绪', async () => {
    await reLaunchTo(mp, '/pages/index/index');
    await sleep(500);
    let page = await mp.currentPage();
    expect(await page!.$('.overlay')).not.toBeNull();
    const btns = await page!.$$('.sheet-actions button');
    await btns[1]?.tap(); // 同意
    await sleep(2000);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/city/city');
    const cityItem = await page!.$('.item');
    await cityItem?.tap();
    await sleep(1500);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/index/index');
    expect(await page!.$('.loading')).toBeNull();
    expect(await (await page!.$('.info'))?.text()).toContain('北京');
  });

  it('A3 拒绝协议 — 调用退出，不跳城市页', async () => {
    await mockExitMiniProgram(mp);
    await reLaunchTo(mp, '/pages/index/index');
    await sleep(500);
    const page = await mp.currentPage();
    const btns = await page!.$$('.sheet-actions button');
    await btns[0]?.tap(); // 不同意
    await sleep(1000);
    expect(await wasExitCalled(mp)).toBe(true);
    const after = await mp.currentPage();
    expect(after?.path).toBe('pages/index/index');
  });

  it('A4 协议已同意、缺城市 — 跳过协议直接跳城市页', async () => {
    await setStorage(mp, { __demo_agreement: true });
    await reLaunchTo(mp, '/pages/index/index');
    await sleep(2000);
    let page = await mp.currentPage();
    expect(page?.path).toBe('pages/city/city');
    expect(await page!.$('.overlay')).toBeNull(); // overlay is on home, not city
    const cityItem = await page!.$('.item');
    await cityItem?.tap();
    await sleep(1500);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/index/index');
    expect(await (await page!.$('.info'))?.text()).toContain('北京');
  });

  it('A5 城市页返回不选 — 自动再跳城市页', async () => {
    await setStorage(mp, { __demo_agreement: true });
    await reLaunchTo(mp, '/pages/index/index');
    await sleep(2000);
    let page = await mp.currentPage();
    expect(page?.path).toBe('pages/city/city');
    const back = await page!.$('.back');
    await back?.tap();
    await sleep(2000);
    page = await mp.currentPage();
    // onCancel → start() → re-navigate to city page
    expect(page?.path).toBe('pages/city/city');
  });
});
