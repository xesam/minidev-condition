import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionRuntime } from '../src/runtime';
import { EnsureResult, ResolveResult } from '../src/types';
import type { Condition, Resolver, RuntimeView, Target } from '../src/types';

function makeCondition(
  key: string,
  satisfied: boolean,
  dependsOn?: string[],
): Condition {
  return {
    key,
    satisfied: () => satisfied,
    dependsOn,
  };
}

function makeResolver(
  condition: string,
  result: ResolveResult = ResolveResult.SUCCESS,
): Resolver {
  return {
    condition,
    resolve: async () => result,
  };
}

function homeTarget(): Target {
  return {
    key: 'home',
    conditions: [
      { condition: 'auth' },
      { condition: 'city' },
    ],
  };
}

describe('ConditionRuntime', () => {
  let rt: ConditionRuntime;

  beforeEach(() => {
    rt = new ConditionRuntime();
  });

  it('returns READY immediately when all conditions are satisfied', async () => {
    rt.registerCondition(makeCondition('auth', true));
    rt.registerCondition(makeCondition('city', true));
    rt.registerResolver(makeResolver('auth'));
    rt.registerResolver(makeResolver('city'));

    await expect(rt.ensure(homeTarget())).resolves.toBe(EnsureResult.READY);
  });

  it('runs ensure() without lifecycle events or callbacks', async () => {
    let authSatisfied = false;

    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => {
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.READY);
    expect(authSatisfied).toBe(true);
  });

  it('deduplicates concurrent ensure() calls for the same target', async () => {
    let authSatisfied = false;
    let releaseResolver!: () => void;
    const resolverGate = new Promise<void>((resolve) => {
      releaseResolver = resolve;
    });

    const resolve = vi.fn(async () => {
      await resolverGate;
      authSatisfied = true;
      return ResolveResult.SUCCESS;
    });

    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({ condition: 'auth', resolve });

    const targetA: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };
    const targetB: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    const first = rt.ensure(targetA);
    const second = rt.ensure(targetB);

    await Promise.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);

    releaseResolver();

    await expect(Promise.all([first, second])).resolves.toEqual([
      EnsureResult.READY,
      EnsureResult.READY,
    ]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('passes a runtime view into resolver context', async () => {
    let authSatisfied = false;
    const resolve = vi.fn(async ({ runtime, target, params }) => {
      expect(target.key).toBe('checkout');
      expect(params).toEqual({ source: 'pay' });
      expect(runtime.isSatisfied('auth')).toBe(false);

      authSatisfied = true;

      expect(runtime.isSatisfied('auth')).toBe(true);
      expect('navigateTo' in (runtime as RuntimeView & Record<string, unknown>)).toBe(false);
      expect('dispatch' in (runtime as RuntimeView & Record<string, unknown>)).toBe(false);

      return ResolveResult.SUCCESS;
    });

    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({ condition: 'auth', resolve });

    const target: Target = {
      key: 'checkout',
      conditions: [
        {
          condition: 'auth',
          params: { source: 'pay' },
        },
      ],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.READY);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('returns CANCEL when a resolver cancels', async () => {
    rt.registerCondition(makeCondition('auth', false));
    rt.registerResolver(makeResolver('auth', ResolveResult.CANCEL));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.CANCEL);
  });

  it('returns FAILED when a resolver fails', async () => {
    rt.registerCondition(makeCondition('auth', false));
    rt.registerResolver(makeResolver('auth', ResolveResult.FAILED));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.FAILED);
  });

  it('returns FAILED when a resolver reports SUCCESS but leaves the condition unsatisfied', async () => {
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver(makeResolver('auth', ResolveResult.SUCCESS));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.FAILED);
  });

  it('returns FAILED when a missing condition has no resolver', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    rt.registerCondition(makeCondition('auth', false));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.FAILED);
  });

  it('resolves conditions in dependency order', async () => {
    const resolveOrder: string[] = [];
    let authSatisfied = false;
    let citySatisfied = false;

    rt.registerCondition({
      key: 'auth',
      dependsOn: [],
      satisfied: () => authSatisfied,
    });
    rt.registerCondition({
      key: 'city',
      dependsOn: ['auth'],
      satisfied: () => citySatisfied,
    });

    rt.registerResolver({
      condition: 'auth',
      resolve: async () => {
        authSatisfied = true;
        resolveOrder.push('auth');
        return ResolveResult.SUCCESS;
      },
    });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        citySatisfied = true;
        resolveOrder.push('city');
        return ResolveResult.SUCCESS;
      },
    });

    await expect(rt.ensure(homeTarget())).resolves.toBe(EnsureResult.READY);
    expect(resolveOrder).toEqual(['auth', 'city']);
  });

  it('does not recheck already-satisfied conditions after a resolver succeeds', async () => {
    const checkCount = { auth: 0, city: 0 };
    let authSatisfied = false;

    rt.registerCondition({
      key: 'auth',
      satisfied: () => {
        checkCount.auth += 1;
        return authSatisfied;
      },
    });
    rt.registerCondition({
      key: 'city',
      satisfied: () => {
        checkCount.city += 1;
        return true;
      },
    });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => {
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    await expect(rt.ensure(homeTarget())).resolves.toBe(EnsureResult.READY);
    expect(checkCount.auth).toBe(2);
    expect(checkCount.city).toBe(1);
  });

  it('resolves same-key refs with different params individually', async () => {
    const satisfied = new Set<string>();
    const resolveCalls: unknown[] = [];

    rt.registerCondition({
      key: 'feature_check',
      satisfied: (_params?: Record<string, unknown>) =>
        satisfied.has(String(_params?.feature)),
    });
    rt.registerResolver({
      condition: 'feature_check',
      resolve: async ({ params }) => {
        resolveCalls.push(params);
        satisfied.add(String(params?.feature));
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'pay',
      conditions: [
        { condition: 'feature_check', params: { feature: 'a' } },
        { condition: 'feature_check', params: { feature: 'b' } },
      ],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.READY);
    // Each ref is resolved with its own params — not just the first.
    expect(resolveCalls).toEqual([{ feature: 'a' }, { feature: 'b' }]);
  });

  it('returns DEFERRED and stops the loop when a resolver defers', async () => {
    const resolveOrder: string[] = [];
    let authSatisfied = false;

    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerCondition({ key: 'city', satisfied: () => true });

    rt.registerResolver({
      condition: 'auth',
      resolve: async () => {
        resolveOrder.push('auth');
        return ResolveResult.DEFERRED;
      },
    });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        resolveOrder.push('city');
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'home',
      conditions: [
        { condition: 'auth' },
        { condition: 'city' },
      ],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.DEFERRED);
    // The loop stops at the deferred resolver — city is not yet resolved.
    expect(resolveOrder).toEqual(['auth']);
    // The deferred condition is exposed for the caller to re-check on revive.
    expect(rt.getDeferredCondition()).toEqual({ condition: 'auth' });
  });

  it('resumes the chain after DEFERRED once the condition becomes satisfied', async () => {
    const resolveOrder: string[] = [];
    let authSatisfied = false;

    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerCondition({ key: 'city', satisfied: () => false });

    rt.registerResolver({
      condition: 'auth',
      resolve: async () => {
        resolveOrder.push('auth');
        return ResolveResult.DEFERRED;
      },
    });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        resolveOrder.push('city');
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'home',
      conditions: [
        { condition: 'auth' },
        { condition: 'city' },
      ],
    };

    // First ensure: auth defers.
    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.DEFERRED);
    expect(rt.getDeferredCondition()).toEqual({ condition: 'auth' });

    // Simulate the user satisfying auth out-of-band, then reviving the flow.
    authSatisfied = true;
    // (city's resolver marks city satisfied on resolve.)
    let citySatisfied = false;
    rt.registerCondition({ key: 'city', satisfied: () => citySatisfied });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        resolveOrder.push('city');
        citySatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.READY);
    // auth was skipped (now satisfied); city resolved on the revive.
    expect(resolveOrder).toEqual(['auth', 'city']);
    expect(rt.getDeferredCondition()).toBeUndefined();
  });

  it('clears getDeferredCondition on a non-DEFERRED outcome', async () => {
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => ResolveResult.FAILED,
    });

    const target: Target = {
      key: 'home',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toBe(EnsureResult.FAILED);
    expect(rt.getDeferredCondition()).toBeUndefined();
  });
});
