// ============================================================
// Demo: Realname Verification Page
// Opened by RealnameResolver. The user completes or cancels verification.
//
// Not condition-runtime-aware: writes the result to storage and navigates back.
// The originating page revives via onShow and re-checks the realname condition.
// ============================================================

import { logLifecycle } from '../../utils/logger';

Component({
  methods: {
    onLoad(options: Record<string, string | undefined>) {
      logLifecycle('Realname', 'onLoad', options);
    },

    onShow() {
      logLifecycle('Realname', 'onShow');
    },

    onReady() {
      logLifecycle('Realname', 'onReady');
    },

    onHide() {
      logLifecycle('Realname', 'onHide');
    },

    onUnload() {
      logLifecycle('Realname', 'onUnload');
    },

    onVerify() {
      wx.setStorageSync('__demo_realname', true);
      wx.navigateBack();
    },

    onCancel() {
      wx.navigateBack();
    },
  },
});
