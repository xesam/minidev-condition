// ============================================================
// Demo: City Selection Page
// Opened by CityResolver. The user selects a city or goes back.
//
// Not condition-runtime-aware: writes the choice to storage and navigates back.
// The originating page revives via onShow and re-checks the city condition.
// ============================================================

import { logLifecycle } from '../../utils/logger';

Component({
  data: {
    cities: ['北京', '上海', '深圳', '广州', '杭州'],
  },

  methods: {
    onLoad(options: Record<string, string | undefined>) {
      logLifecycle('City', 'onLoad', options);
    },

    onShow() {
      logLifecycle('City', 'onShow');
    },

    onReady() {
      logLifecycle('City', 'onReady');
    },

    onHide() {
      logLifecycle('City', 'onHide');
    },

    onUnload() {
      logLifecycle('City', 'onUnload');
    },

    onSelect(e: any) {
      const city = e.currentTarget.dataset.city;
      wx.setStorageSync('__demo_city', city);
      wx.navigateBack();
    },

    onBack() {
      wx.navigateBack();
    },
  },
});
