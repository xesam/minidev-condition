// ============================================================
// Demo: Resolver Index
// Registers all resolvers with the runtime.
//
// agreement — custom in-page overlay (SUCCESS/CANCEL; CANCEL → exit).
// city / login / realname — navigation resolvers: trigger wx.navigateTo
// themselves and return DEFERRED. The originating page revives via onShow
// and re-checks the condition's satisfied().
// ============================================================

import type { ConditionRuntime } from '@mini-dev/condition';
import { AgreementResolver } from './agreement';
import { CityResolver } from './city';
import { LoginResolver } from './login';
import { RealnameResolver } from './realname';

export function registerAllResolvers(runtime: ConditionRuntime): void {
  runtime.registerResolver(new AgreementResolver());
  runtime.registerResolver(new CityResolver());
  runtime.registerResolver(new LoginResolver());
  runtime.registerResolver(new RealnameResolver());
}
