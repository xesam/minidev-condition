/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo,
    runtime: import('@mini-dev/condition').ConditionRuntime,
    // Hook the home page registers so the agreement resolver can drive
    // a custom in-page overlay (returns Promise<agreed>). See pages/index.
    presentAgreement?: () => Promise<boolean>,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
}