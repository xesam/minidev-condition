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

    await expect(rt.ensure(homeTarget())).resolves.toMatchObject({ result: EnsureResult.READY });
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

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
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

    const [a, b] = await Promise.all([first, second]);
    expect(a).toMatchObject({ result: EnsureResult.READY });
    expect(b).toMatchObject({ result: EnsureResult.READY });
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

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('returns CANCEL when a resolver cancels', async () => {
    rt.registerCondition(makeCondition('auth', false));
    rt.registerResolver(makeResolver('auth', ResolveResult.CANCEL));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.CANCEL });
  });

  it('returns FAILED when a resolver fails', async () => {
    rt.registerCondition(makeCondition('auth', false));
    rt.registerResolver(makeResolver('auth', ResolveResult.FAILED));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.FAILED });
  });

  it('returns FAILED when a resolver reports SUCCESS but leaves the condition unsatisfied', async () => {
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver(makeResolver('auth', ResolveResult.SUCCESS));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.FAILED });
  });

  it('returns ERROR (not FAILED) when a condition has no resolver registered', async () => {
    rt.registerCondition(makeCondition('auth', false));
    // No resolver registered for 'auth' — programmer error.

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({ result: EnsureResult.ERROR });
    expect((outcome as { result: EnsureResult.ERROR; message: string }).message).toContain('auth');
  });

  it('returns ERROR when a condition is not registered on any runtime', async () => {
    // No registerCondition call at all — 'missing' is unknown.
    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'missing' }],
    };

    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({ result: EnsureResult.ERROR });
    expect((outcome as { result: EnsureResult.ERROR; message: string }).message).toContain('missing');
  });

  it('warns on console when dependsOn forms a cycle and falls back to array order', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolveOrder: string[] = [];
    let aSatisfied = false;
    let bSatisfied = false;

    // a depends on b, b depends on a — mutual cycle.
    rt.registerCondition({ key: 'a', dependsOn: ['b'], satisfied: () => aSatisfied });
    rt.registerCondition({ key: 'b', dependsOn: ['a'], satisfied: () => bSatisfied });
    rt.registerResolver({
      condition: 'a',
      resolve: async () => { aSatisfied = true; resolveOrder.push('a'); return ResolveResult.SUCCESS; },
    });
    rt.registerResolver({
      condition: 'b',
      resolve: async () => { bSatisfied = true; resolveOrder.push('b'); return ResolveResult.SUCCESS; },
    });

    const target: Target = { key: 'home', conditions: [{ condition: 'a' }, { condition: 'b' }] };
    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('循环'));
    // Both resolved despite the cycle (array order fallback).
    expect(resolveOrder).toHaveLength(2);
    warnSpy.mockRestore();
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

    await expect(rt.ensure(homeTarget())).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(resolveOrder).toEqual(['auth', 'city']);
  });

  it('does not block a resolver when dependsOn points to a condition absent from the target', async () => {
    // 'city' declares dependsOn: ['auth'], but 'auth' is NOT in this target.
    // The dependency is outside the pending set — city should resolve immediately.
    let citySatisfied = false;

    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerCondition({
      key: 'city',
      dependsOn: ['auth'],
      satisfied: () => citySatisfied,
    });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        citySatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'home',
      conditions: [{ condition: 'city' }], // 'auth' not in target
    };

    // auth absent from target → city's dependsOn has no effect → city resolves
    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(citySatisfied).toBe(true);
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

    await expect(rt.ensure(homeTarget())).resolves.toMatchObject({ result: EnsureResult.READY });
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

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
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

    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({
      result: EnsureResult.DEFERRED,
      deferredCondition: { condition: 'auth' },
    });
    // The loop stops at the deferred resolver — city is not yet resolved.
    expect(resolveOrder).toEqual(['auth']);
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
    const firstOutcome = await rt.ensure(target);
    expect(firstOutcome).toMatchObject({
      result: EnsureResult.DEFERRED,
      deferredCondition: { condition: 'auth' },
    });

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

    const secondOutcome = await rt.ensure(target);
    expect(secondOutcome).toMatchObject({ result: EnsureResult.READY });
    // auth was skipped (now satisfied); city resolved on the revive.
    expect(resolveOrder).toEqual(['auth', 'city']);
  });

  it('returns FAILED (no deferredCondition) on a non-DEFERRED outcome', async () => {
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => ResolveResult.FAILED,
    });

    const target: Target = {
      key: 'home',
      conditions: [{ condition: 'auth' }],
    };

    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({ result: EnsureResult.FAILED });
    expect('deferredCondition' in outcome).toBe(false);
  });

  it('each concurrent ensure call returns its own deferredCondition independently', async () => {
    let releaseLogin!: () => void;
    let releaseRealname!: () => void;
    const loginGate = new Promise<void>((r) => { releaseLogin = r; });
    const realnameGate = new Promise<void>((r) => { releaseRealname = r; });

    rt.registerCondition({ key: 'login', satisfied: () => false });
    rt.registerCondition({ key: 'realname', satisfied: () => false });
    rt.registerResolver({
      condition: 'login',
      resolve: async () => { await loginGate; return ResolveResult.DEFERRED; },
    });
    rt.registerResolver({
      condition: 'realname',
      resolve: async () => { await realnameGate; return ResolveResult.DEFERRED; },
    });

    const a = rt.ensure({ key: 'p#login', conditions: [{ condition: 'login' }] });
    const b = rt.ensure({ key: 'p#realname', conditions: [{ condition: 'realname' }] });

    releaseLogin();
    const aOutcome = await a;

    releaseRealname();
    const bOutcome = await b;

    // Each caller gets its own deferred condition — no shared state race.
    expect(aOutcome).toMatchObject({ result: EnsureResult.DEFERRED, deferredCondition: { condition: 'login' } });
    expect(bOutcome).toMatchObject({ result: EnsureResult.DEFERRED, deferredCondition: { condition: 'realname' } });
  });
});
