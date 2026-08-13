/**
 * E2E: Resolver target pages (ACCEPTANCE.md Group C)
 *
 * city / login / realname target pages are NOT condition-runtime-aware: they
 * only write storage + navigateBack. The originating page revives via
 * onShow and re-checks the condition's satisfied().
 */
import automator from 'miniprogram-automator';
import {
  clearAllState, navigateTo, restoreModalMock, sleep,
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

describe('C. Resolver 目标页（写 storage + navigateBack）', () => {
  it('C1 城市页 — 选第一个城市', async () => {
    const page = await navigateTo(mp, '/pages/city/city');
    const cityItem = await page.$('.item');
    await cityItem?.tap();
    await sleep(1000);
    const city = await mp.evaluate(() => wx.getStorageSync('__demo_city'));
    expect(city).toBeTruthy();
  });

  it('C2 城市页 — 返回不写', async () => {
    const page = await navigateTo(mp, '/pages/city/city');
    const back = await page.$('.back');
    await back?.tap();
    await sleep(1000);
    const city = await mp.evaluate(() => wx.getStorageSync('__demo_city'));
    expect(city).toBeFalsy();
  });

  it('C3 登录页 — 登录写入', async () => {
    const page = await navigateTo(mp, '/pages/login/login');
    const loginBtn = await page.$('button');
    await loginBtn?.tap();
    await sleep(1000);
    const logged = await mp.evaluate(() => !!wx.getStorageSync('__demo_login'));
    expect(logged).toBe(true);
  });

  it('C4 登录页 — 暂不登录不写', async () => {
    const page = await navigateTo(mp, '/pages/login/login');
    const cancelBtn = (await page.$$('button'))[1];
    await cancelBtn?.tap();
    await sleep(1000);
    const logged = await mp.evaluate(() => !!wx.getStorageSync('__demo_login'));
    expect(logged).toBe(false);
  });

  it('C5 实名页 — 完成认证写入', async () => {
    const page = await navigateTo(mp, '/pages/realname/realname');
    const verifyBtn = await page.$('button');
    await verifyBtn?.tap();
    await sleep(1000);
    const verified = await mp.evaluate(() => !!wx.getStorageSync('__demo_realname'));
    expect(verified).toBe(true);
  });

  it('C6 实名页 — 取消不写', async () => {
    const page = await navigateTo(mp, '/pages/realname/realname');
    const cancelBtn = (await page.$$('button'))[1];
    await cancelBtn?.tap();
    await sleep(1000);
    const verified = await mp.evaluate(() => !!wx.getStorageSync('__demo_realname'));
    expect(verified).toBe(false);
  });
});
