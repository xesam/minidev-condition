/**
 * E2E: Product page realistic flow (ACCEPTANCE.md Group B)
 *
 * Two phases: login (page-edge) + realname (action-triggered by 支付).
 * - B1 all satisfied: ready, 支付 → success immediately.
 * - B2 all missing: login page → realname page → 支付成功.
 * - B3 login set, realname missing: 支付 → realname page → success.
 * - B4 login cancelled: 未登录 card.
 * - B5 realname cancelled: 实名未通过.
 */
import automator from 'miniprogram-automator';
import {
  clearAllState, presetProductReady, reLaunchTo,
  restoreModalMock, setStorage, sleep,
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
});

describe('B. 商品页：登录 + 支付(实名)', () => {
  it('B1 全满足 — 就绪，支付直接成功', async () => {
    await presetProductReady(mp);
    const page = await reLaunchTo(mp, '/pages/product/product');
    expect(page.path).toBe('pages/product/product');
    expect(await (await page.$('.title'))?.text()).toBe('商品详情');
    const payBtn = await page.$('button');
    await payBtn?.tap();
    await sleep(500);
    expect(await (await page.$('.status'))?.text()).toContain('支付成功');
  });

  it('B2 全缺失 — 登录页 → 实名页 → 支付成功', async () => {
    await reLaunchTo(mp, '/pages/product/product');
    await sleep(2000);
    let page = await mp.currentPage();
    expect(page?.path).toBe('pages/login/login');
    const loginBtn = await page!.$('button');
    await loginBtn?.tap();
    await sleep(2000);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/product/product');
    const payBtn = await page!.$('button');
    await payBtn?.tap();
    await sleep(2000);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/realname/realname');
    const verifyBtn = await page!.$('button');
    await verifyBtn?.tap();
    await sleep(2000);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/product/product');
    expect(await (await page!.$('.status'))?.text()).toContain('支付成功');
  });

  it('B3 已登录、缺实名 — 支付跳实名页', async () => {
    await setStorage(mp, { __demo_login: true });
    const page = await reLaunchTo(mp, '/pages/product/product');
    expect(await (await page.$('.title'))?.text()).toBe('商品详情');
    const payBtn = await page.$('button');
    await payBtn?.tap();
    await sleep(2000);
    const rnPage = await mp.currentPage();
    expect(rnPage?.path).toBe('pages/realname/realname');
    const verifyBtn = await rnPage!.$('button');
    await verifyBtn?.tap();
    await sleep(2000);
    const back = await mp.currentPage();
    expect(back?.path).toBe('pages/product/product');
    expect(await (await back!.$('.status'))?.text()).toContain('支付成功');
  });

  it('B4 登录取消 — 未登录卡片', async () => {
    await reLaunchTo(mp, '/pages/product/product');
    await sleep(2000);
    let page = await mp.currentPage();
    expect(page?.path).toBe('pages/login/login');
    const cancelBtn = (await page!.$$('button'))[1]; // 暂不登录
    await cancelBtn?.tap();
    await sleep(1500);
    page = await mp.currentPage();
    expect(page?.path).toBe('pages/product/product');
    expect(await (await page!.$('.title'))?.text()).toContain('未登录');
  });

  it('B5 实名取消 — 支付未成功', async () => {
    await setStorage(mp, { __demo_login: true });
    const page = await reLaunchTo(mp, '/pages/product/product');
    const payBtn = await page.$('button');
    await payBtn?.tap();
    await sleep(2000);
    let rnPage = await mp.currentPage();
    expect(rnPage?.path).toBe('pages/realname/realname');
    const cancelBtn = (await rnPage!.$$('button'))[1]; // 取消
    await cancelBtn?.tap();
    await sleep(1500);
    const back = await mp.currentPage();
    expect(back?.path).toBe('pages/product/product');
    expect(await (await back!.$('.status'))?.text()).toContain('实名未通过');
  });
});
