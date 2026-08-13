// ============================================================
// Demo: Product Page (realistic flow, two phases)
//   - login flow (prereq [login]) — page-edge, starts on onLoad. After
//     login is satisfied the product is shown with a "支付" button.
//   - realname flow (prereq [realname]) — action-triggered: started on
//     the "支付" tap. If realname is unsatisfied it navigates to the
//     realname page (DEFERRED) and revives via onShow; on ready it
//     reports "支付成功".
// onShow resumes both flows; the login flow is a no-op once ready.
// ============================================================

import { createPrerequisiteController } from '@mini-dev/condition';
import { logLifecycle } from '../../utils/logger';

Component({
  data: {
    loginReady: false,
    loginCancelled: false,
    paySuccess: false,
    payCancelled: false,
  },

  methods: {
    onLoad(options: Record<string, string | undefined>) {
      logLifecycle('Product', 'onLoad', options);
      const app = getApp();

      // realname flow — created first; started later by onPay.
      const realnameFlow = createPrerequisiteController({
        runtime: app.globalData.runtime,
        key: 'pages/product/product#realname',
        prereqs: ['realname'],
        onReady: () => {
          this.setData({ paySuccess: true, payCancelled: false });
        },
        onCancel: () => {
          this.setData({ payCancelled: true });
        },
      });
      (this as any).realnameFlow = realnameFlow;

      // login flow — starts on entry.
      const loginFlow = createPrerequisiteController({
        runtime: app.globalData.runtime,
        key: 'pages/product/product#login',
        prereqs: ['login'],
        onReady: () => {
          this.setData({ loginReady: true, loginCancelled: false });
        },
        onCancel: () => {
          this.setData({ loginCancelled: true });
        },
      });
      (this as any).loginFlow = loginFlow;

      loginFlow.start();
    },

    onShow() {
      logLifecycle('Product', 'onShow');
      (this as any).loginFlow?.resume();
      (this as any).realnameFlow?.resume();
    },

    onReady() {
      logLifecycle('Product', 'onReady');
    },

    onHide() {
      logLifecycle('Product', 'onHide');
      (this as any).loginFlow?.pause();
      (this as any).realnameFlow?.pause();
    },

    onUnload() {
      logLifecycle('Product', 'onUnload');
      (this as any).loginFlow?.dispose();
      (this as any).realnameFlow?.dispose();
    },

    // 支付 → action-triggered realname check.
    onPay() {
      this.setData({ payCancelled: false });
      (this as any).realnameFlow?.start();
    },

    retryLogin() {
      (this as any).loginFlow?.start();
    },
  },
});
