// ============================================================
// Demo: Home Page (realistic flow)
// Two flows run in sequence:
//   1. agreement flow (prereq [agreement]) — custom in-page overlay.
//      - 同意 → onReady → start the city flow.
//      - 不同意 → onCancel → wx.exitMiniProgram.
//   2. city flow (prereq [city]) — resolver forks on params:
//      - 启动参数带 city（DevTools 编译模式「外部启动带city参数」）→
//        resolver 消费 params.externalCity，免跳页直接落地（SUCCESS）。
//      - 无参数 → 跳城市选择页（DEFERRED）；返回未选 → onCancel →
//        flow.start() 重置 → 自动再跳城市页（"重新执行城市流程"）。
//
// The agreement resolver drives page-owned UI via the
// globalData.presentAgreement() hook the home page registers here.
// ============================================================

import { createPrerequisiteController } from '@mini-dev/condition';
import { logLifecycle } from '../../utils/logger';

Component({
  data: {
    showAgreement: false,
    ready: false,
    cityName: '',
    cityFromStartup: false,
    agreementText:
      '《隐私协议》\n\n感谢使用本示例应用。为了向您提供服务，我们需要收集和处理必要的用户信息，包括您选择的城市、登录状态及实名认证状态（均为本地存储模拟）。\n\n本应用不收集任何真实个人隐私数据，所有状态仅保存在小程序本地存储中，用于演示前置条件编排引擎的能力。\n\n您可以在小程序设置中随时清除本地存储以撤回授权。点击「同意」表示您已阅读并同意上述协议；点击「不同意」将退出小程序。\n\n（以上为示例文本，仅用于演示自定义弹层与可滚动协议正文。）',
  },

  methods: {
    onLoad(options: Record<string, string | undefined>) {
      logLifecycle('Index', 'onLoad', options);
      const app = getApp();

      // External launch param (custom compile mode「外部启动带city参数」):
      // inject a non-empty launch query's city into the city flow's params
      // — the ConditionRef.params → ResolveContext.params channel. Absent/
      // empty param → bare ref, original navigation path. The param is the
      // DESIRED state: CityCondition.satisfied(params) does an EXACT match,
      // so a local city that differs reads as unsatisfied and the resolver
      // REPLACES it (not just fills the gap) — see conditions/city.ts.
      const externalCity = options?.city || undefined;

      // Register the overlay hook the agreement resolver awaits.
      // The resolver calls presentAgreement(); the page shows the overlay
      // and the 同意/不同意 buttons resolve the returned promise.
      app.globalData.presentAgreement = () =>
        new Promise<boolean>((resolve) => {
          this.setData({ showAgreement: true });
          (this as any)._resolveAgreement = resolve;
        });

      // 2. city flow — created first so the agreement flow's onReady can
      // start it. On cancel (returned without selecting) it re-attempts,
      // which re-navigates to the city page automatically.
      const cityFlow = createPrerequisiteController({
        runtime: app.globalData.runtime,
        key: 'pages/index/index#city',
        // Parameterized ref when the launch query carries a city; bare
        // string otherwise — normalizePrerequisites bridges both to core's
        // strict ConditionRef[].
        prereqs: externalCity
          ? [{ condition: 'city', params: { externalCity } }]
          : ['city'],
        onReady: () => {
          const city = wx.getStorageSync('__demo_city') || '未知';
          // Annotate when the ready city equals the external launch param —
          // covers both the fill path (D1) and the replace path (D2);
          // a storage-preset city re-entered without the param shows no
          // annotation (D5 — readiness is storage-driven, not param-driven).
          const fromStartup = !!externalCity && city === externalCity;
          this.setData({ ready: true, cityName: city, cityFromStartup: fromStartup });
        },
        onCancel: () => {
          // City not selected on return → re-attempt (auto re-navigate).
          cityFlow.start();
        },
      });
      (this as any).cityFlow = cityFlow;

      // 1. agreement flow — runs first. On ready, kicks off the city flow.
      const agreementFlow = createPrerequisiteController({
        runtime: app.globalData.runtime,
        key: 'pages/index/index#agreement',
        prereqs: ['agreement'],
        onReady: () => {
          cityFlow.start();
        },
        onCancel: () => {
          // Agreement denied → exit the mini program.
          try {
            (wx as any).exitMiniProgram({});
          } catch (e) {
            /* exitMiniProgram unavailable in some contexts */
          }
        },
      });
      (this as any).agreementFlow = agreementFlow;

      agreementFlow.start();
    },

    onShow() {
      logLifecycle('Index', 'onShow');
      (this as any).agreementFlow?.resume();
      (this as any).cityFlow?.resume();
    },

    onReady() {
      logLifecycle('Index', 'onReady');
    },

    onHide() {
      logLifecycle('Index', 'onHide');
      (this as any).agreementFlow?.pause();
      (this as any).cityFlow?.pause();
    },

    onUnload() {
      logLifecycle('Index', 'onUnload');
      (this as any).agreementFlow?.dispose();
      (this as any).cityFlow?.dispose();
      delete getApp().globalData.presentAgreement;
    },

    onAgree() {
      this.setData({ showAgreement: false });
      (this as any)._resolveAgreement?.(true);
      (this as any)._resolveAgreement = null;
    },

    onDeny() {
      this.setData({ showAgreement: false });
      (this as any)._resolveAgreement?.(false);
      (this as any)._resolveAgreement = null;
    },

    goToProduct() {
      wx.navigateTo({ url: '/pages/product/product' });
    },
  },
});
