// ============================================================
// Demo: Product Page (realistic journey, two phases)
//   - login controller (prereq [login]) — page-edge, starts on onLoad. After
//     login is satisfied the product is shown with a "支付" button.
//   - realname controller (prereq [realname]) — action-triggered: started on
//     the "支付" tap. If realname is unsatisfied it navigates to the
//     realname page (DEFERRED) and revives via onShow; on ready it
//     reports "支付成功".
// onShow resumes both controllers; the login controller is a no-op once ready.
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

      // realname controller — created first; started later by onPay.
      const realnameController = createPrerequisiteController({
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
      (this as any).realnameController = realnameController;

      // login controller — starts on entry.
      const loginController = createPrerequisiteController({
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
      (this as any).loginController = loginController;

      loginController.start();
    },

    onShow() {
      logLifecycle('Product', 'onShow');
      (this as any).loginController?.resume();
      (this as any).realnameController?.resume();
    },

    onReady() {
      logLifecycle('Product', 'onReady');
    },

    onHide() {
      logLifecycle('Product', 'onHide');
      (this as any).loginController?.pause();
      (this as any).realnameController?.pause();
    },

    onUnload() {
      logLifecycle('Product', 'onUnload');
      (this as any).loginController?.dispose();
      (this as any).realnameController?.dispose();
    },

    // 支付 → action-triggered realname check.
    onPay() {
      this.setData({ payCancelled: false });
      (this as any).realnameController?.start();
    },

    retryLogin() {
      (this as any).loginController?.start();
    },
  },
});
