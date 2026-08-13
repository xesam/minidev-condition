// ============================================================
// Demo: Login Page
// Opened by LoginResolver. The user logs in or cancels.
//
// Not condition-runtime-aware: writes the result to storage and navigates
// back. The originating page revives via onShow and re-checks the
// login condition's satisfied() (reads the storage).
// ============================================================

import { logLifecycle } from '../../utils/logger';

Component({
  methods: {
    onLoad(options: Record<string, string | undefined>) {
      logLifecycle('Login', 'onLoad', options);
    },

    onShow() {
      logLifecycle('Login', 'onShow');
    },

    onReady() {
      logLifecycle('Login', 'onReady');
    },

    onHide() {
      logLifecycle('Login', 'onHide');
    },

    onUnload() {
      logLifecycle('Login', 'onUnload');
    },

    onLogin() {
      wx.setStorageSync('__demo_login', true);
      wx.navigateBack();
    },

    onCancel() {
      wx.navigateBack();
    },
  },
});
