// ============================================================
// condition wechat-sample: app.ts
// Initializes the app-level ConditionRuntime on launch.
//
// condition does NOT own navigation or cross-page result relay —
// resolvers trigger navigation themselves (with whatever router the app
// uses) and return DEFERRED; the originating page revives via onShow.
// So there is no navigator singleton to wire here. Likewise the library
// wires no page-UI bridge: in-call resolvers reach the controller's initiating
// page through the owner channel (see pages/index + agreement resolver).
// ============================================================

import { ConditionRuntime } from '@mini-dev/condition';
import { registerAllConditions, registerAllResolvers } from './conditions/index';

// Create the app-level runtime instance. Register all conditions and
// resolvers, then expose it via globalData so pages can reach it through
// getApp() — the library owns no singleton; the app owns its runtime.
const runtime = new ConditionRuntime();
registerAllConditions(runtime);
registerAllResolvers(runtime);

App({
  globalData: { runtime },
});
