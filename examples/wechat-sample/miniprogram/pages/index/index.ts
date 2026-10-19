// ============================================================
// Demo: Home Page (realistic journey) — ONE controller, ordered prereqs.
//   prereqs: [agreement, city] — array order is the evaluation order,
//   so agreement resolves first, then city.
//     - agreement (in-page overlay): 同意 → chain continues to city;
//       不同意 → onCancel(cancelledCondition = agreement) → exit.
//     - city: resolver forks on params —
//       启动参数带 city（DevTools 编译模式「外部启动带city参数」）→
//       resolver 消费 params.externalCity，免跳页直接落地（SUCCESS）。
//       无参数 → 跳城市选择页（DEFERRED）；返回未选 →
//       onCancel(cancelledCondition = city) → controller.start() 重置 →
//       自动再跳城市页（"重新执行城市流程"）。
//
// The per-condition failure policies (exit vs retry) live in ONE onCancel
// branch — the outcome identifies which condition terminated the controller, so
// the page does NOT need to split into two chained flows.
//
// The agreement resolver drives page-owned UI through the owner channel:
// the journey below declares `owner: this`, so the resolver receives THIS
// page instance via ResolveContext.owner and calls presentAgreement() —
// a normal method, no globalData registration, no cleanup on unload.
// ============================================================

import {
  createPrerequisiteController,
  EnsureResult,
} from '@mini-dev/condition';
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
      // inject a non-empty launch query's city into the city controller's params
      // — the ConditionRef.params → ResolveContext.params channel. Absent/
      // empty param → bare ref, original navigation path. The param is the
      // DESIRED state: CityCondition.satisfied(params) does an EXACT match,
      // so a local city that differs reads as unsatisfied and the resolver
      // REPLACES it (not just fills the gap) — see conditions/city.condition.ts.
      const externalCity = options?.city || undefined;

      // The journey: agreement first, then city. Failure policies branch
      // per-condition inside onCancel — no controller splitting, no chaining.
      // `owner: this` hands the initiating page to resolvers: the
      // agreement resolver reaches the overlay via this.presentAgreement().
      const journey = createPrerequisiteController({
        runtime: app.globalData.runtime,
        key: 'pages/index/index',
        owner: this,
        prereqs: externalCity
          ? ['agreement', { condition: 'city', params: { externalCity } }]
          : ['agreement', 'city'],
        onReady: () => {
          const city = wx.getStorageSync('__demo_city') || '未知';
          // Annotate when the ready city equals the external launch param —
          // covers both the fill path (D1) and the replace path (D2);
          // a storage-preset city re-entered without the param shows no
          // annotation (D5 — readiness is storage-driven, not param-driven).
          const fromStartup = !!externalCity && city === externalCity;
          this.setData({ ready: true, cityName: city, cityFromStartup: fromStartup });
        },
        onCancel: (outcome) => {
          const blocked =
            outcome.result === EnsureResult.CANCEL
              ? outcome.cancelledCondition.condition
              : outcome.failedCondition?.condition;
          if (blocked === 'agreement') {
            // Agreement denied → exit the mini program.
            try {
              (wx as any).exitMiniProgram({});
            } catch (e) {
              /* exitMiniProgram unavailable in some contexts */
            }
          } else {
            // City not selected on return → re-attempt (auto re-navigate).
            // Safe: the user actively navigated back; satisfied conditions
            // (agreement) are skipped on re-run.
            journey.start();
          }
        },
      });
      (this as any).journey = journey;

      journey.start();
    },

    onShow() {
      logLifecycle('Index', 'onShow');
      (this as any).journey?.resume();
    },

    onReady() {
      logLifecycle('Index', 'onReady');
    },

    onHide() {
      logLifecycle('Index', 'onHide');
      (this as any).journey?.pause();
    },

    onUnload() {
      logLifecycle('Index', 'onUnload');
      // Resolve the pending overlay promise BEFORE disposing: the
      // in-call resolver is still awaiting it — an unhandled pending
      // promise would hang ensure() (and its in-flight dedup entry)
      // forever. The owner of the promise is the owner of its cancel.
      // Note: resolving false walks the resolver's CANCEL path, so
      // onCancel may still fire AFTER dispose — it only branches to
      // exit/retry callbacks, no page state is touched.
      (this as any)._resolveAgreement?.(false);
      (this as any)._resolveAgreement = null;
      (this as any).journey?.dispose();
    },

    // The in-page overlay the agreement resolver drives through the owner
    // channel. Shows the overlay, returns a promise the 同意/不同意
    // buttons (onAgree/onDeny) resolve — the page owns its promise.
    presentAgreement(): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        this.setData({ showAgreement: true });
        (this as any)._resolveAgreement = resolve;
      });
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
