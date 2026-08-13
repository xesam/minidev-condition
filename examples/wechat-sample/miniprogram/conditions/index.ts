// ============================================================
// Demo: Condition Index
// Registers the app-level (global) conditions with the runtime.
// The realistic flow uses four single-condition flows, each driven
// by the page that needs it (home: agreement, city; product: login,
// realname). All conditions are registered globally here.
// ============================================================

import type { ConditionRuntime } from '@mini-dev/condition';
import { AgreementCondition } from './agreement';
import { CityCondition } from './city';
import { LoginCondition } from './login';
import { RealnameCondition } from './realname';

export function registerAllConditions(runtime: ConditionRuntime): void {
  runtime.registerCondition(new AgreementCondition());
  runtime.registerCondition(new CityCondition());
  runtime.registerCondition(new LoginCondition());
  runtime.registerCondition(new RealnameCondition());
}
