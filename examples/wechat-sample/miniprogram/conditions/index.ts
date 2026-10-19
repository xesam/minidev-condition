// ============================================================
// Demo: Condition & Resolver Index
// Registers the app-level (global) conditions and resolvers with
// the runtime.
//
// Files are organized per business concern:
//   {xxx}.condition.ts — the condition (state check)
//   {xxx}.resolver.ts  — the resolver (what to do when blocked)
//
// agreement — custom in-page overlay (SUCCESS/CANCEL; CANCEL → exit).
// city / login / realname — navigation resolvers: trigger wx.navigateTo
// themselves and return DEFERRED. The originating page revives via onShow
// and re-checks the condition's satisfied().
// ============================================================

import type { ConditionRuntime } from '@mini-dev/condition';
import { AgreementCondition } from './agreement.condition';
import { CityCondition } from './city.condition';
import { LoginCondition } from './login.condition';
import { RealnameCondition } from './realname.condition';
import { AgreementResolver } from './agreement.resolver';
import { CityResolver } from './city.resolver';
import { LoginResolver } from './login.resolver';
import { RealnameResolver } from './realname.resolver';

export function registerAllConditions(runtime: ConditionRuntime): void {
  runtime.registerCondition(new AgreementCondition());
  runtime.registerCondition(new CityCondition());
  runtime.registerCondition(new LoginCondition());
  runtime.registerCondition(new RealnameCondition());
}

export function registerAllResolvers(runtime: ConditionRuntime): void {
  runtime.registerResolver(new AgreementResolver());
  runtime.registerResolver(new CityResolver());
  runtime.registerResolver(new LoginResolver());
  runtime.registerResolver(new RealnameResolver());
}
