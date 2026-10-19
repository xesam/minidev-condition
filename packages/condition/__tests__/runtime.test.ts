import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionRuntime } from '../src/runtime';
import { EnsureResult, ResolveResult } from '../src/types';
import type { Condition, ResolveContext, Resolver, RuntimeView, Target } from '../src/types';

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

  it('returns READY immediately when all conditions are satisfied, without invoking any resolver', async () => {
    const authResolve = vi.fn(async () => ResolveResult.SUCCESS);
    const cityResolve = vi.fn(async () => ResolveResult.SUCCESS);
    rt.registerCondition(makeCondition('auth', true));
    rt.registerCondition(makeCondition('city', true));
    rt.registerResolver({ condition: 'auth', resolve: authResolve });
    rt.registerResolver({ condition: 'city', resolve: cityResolve });

    await expect(rt.ensure(homeTarget())).resolves.toMatchObject({ result: EnsureResult.READY });

    // "Immediately" means no resolver ran — all conditions were already true.
    expect(authResolve).not.toHaveBeenCalled();
    expect(cityResolve).not.toHaveBeenCalled();
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
      // RuntimeView surface lock: the only capability is isSatisfied —
      // no navigation sugar (the library wires no such APIs).
      expect(typeof (runtime as RuntimeView).isSatisfied).toBe('function');
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

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.CANCEL,
      cancelledCondition: { condition: 'auth' },
    });
  });

  it('identifies which condition the chain cancelled on', async () => {
    rt.registerCondition(makeCondition('agreement', false));
    rt.registerCondition(makeCondition('city', true));
    rt.registerResolver(makeResolver('agreement', ResolveResult.CANCEL));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'agreement' }, { condition: 'city' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.CANCEL,
      cancelledCondition: { condition: 'agreement' },
    });
  });

  it('identifies which condition resolved to params on cancel', async () => {
    rt.registerCondition(makeCondition('city', false));
    rt.registerResolver(makeResolver('city', ResolveResult.CANCEL));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'city', params: { externalCity: 'sz' } }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.CANCEL,
      cancelledCondition: { condition: 'city', params: { externalCity: 'sz' } },
    });
  });

  it('returns FAILED when a resolver fails', async () => {
    rt.registerCondition(makeCondition('auth', false));
    rt.registerResolver(makeResolver('auth', ResolveResult.FAILED));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.FAILED,
      failedCondition: { condition: 'auth' },
    });
  });

  it('identifies which condition the chain failed on', async () => {
    rt.registerCondition(makeCondition('agreement', false));
    rt.registerCondition(makeCondition('city', true));
    rt.registerResolver(makeResolver('agreement', ResolveResult.FAILED));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'agreement' }, { condition: 'city' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.FAILED,
      failedCondition: { condition: 'agreement' },
    });
  });

  it('returns FAILED when a resolver reports SUCCESS but leaves the condition unsatisfied', async () => {
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver(makeResolver('auth', ResolveResult.SUCCESS));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({
      result: EnsureResult.FAILED,
      failedCondition: { condition: 'auth' },
    });
  });

  it('distinguishes a SUCCESS-but-unsatisfied failure from a resolver-reported FAILED in the console', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver(makeResolver('auth', ResolveResult.SUCCESS));

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth', params: { source: 'pay' } }],
    };

    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.FAILED });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain('Resolver reported SUCCESS');
    expect(message).toContain('"auth"');
    errorSpy.mockRestore();
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

  it('returns ERROR when dependsOn forms a cycle, instead of falling back to array order', async () => {
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
    const outcome = await rt.ensure(target);

    // A cycle is a programmer error — surfaced as ERROR, not executed in
    // arbitrary order.
    expect(outcome).toMatchObject({ result: EnsureResult.ERROR });
    const message = (outcome as { result: EnsureResult.ERROR; message: string }).message;
    expect(message).toContain('a');
    expect(message).toContain('b');
    // No resolver ran — the loop aborted before any side effect.
    expect(resolveOrder).toHaveLength(0);
  });

  it('does not treat a dependsOn entry that names no registered condition as a cycle', async () => {
    // Mutex for the cycle→ERROR change, distinct from the "registered but
    // absent from target" case above: 'city' depends on a ghost key that is
    // not registered anywhere. The ghost is never in the pending set, so
    // city is ready immediately — this must not surface as ERROR.
    let citySatisfied = false;

    rt.registerCondition({ key: 'city', dependsOn: ['ghost'], satisfied: () => citySatisfied });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => {
        citySatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = { key: 'home', conditions: [{ condition: 'city' }] };
    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(citySatisfied).toBe(true);
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
    // NOTE: no city resolver yet — the chain never reaches city before auth
    // is satisfied, and the city registration happens below when it becomes
    // reachable, mirroring how the page's controller would actually proceed.

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

    // Simulate the user satisfying auth out-of-band, then reviving the controller.
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

    // Each caller gets its own deferred condition — no shared state race:
    // distinct outcome objects, never the same shared promise/in-flight entry.
    expect(aOutcome).toMatchObject({ result: EnsureResult.DEFERRED, deferredCondition: { condition: 'login' } });
    expect(bOutcome).toMatchObject({ result: EnsureResult.DEFERRED, deferredCondition: { condition: 'realname' } });
    expect(aOutcome).not.toBe(bOutcome);
  });

  it('returns DEFERRED with the ref params preserved in deferredCondition', async () => {
    rt.registerCondition({ key: 'feature_check', satisfied: () => false });
    rt.registerResolver({ condition: 'feature_check', resolve: async () => ResolveResult.DEFERRED });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'feature_check', params: { feature: 'fancy-pay', orderId: '123' } }],
    };

    // Params flow through to deferredCondition so the revive check can use them.
    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({
      result: EnsureResult.DEFERRED,
      deferredCondition: { condition: 'feature_check', params: { feature: 'fancy-pay', orderId: '123' } },
    });
  });

  it('returns FAILED when a resolver throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    rt.registerCondition({ key: 'auth', satisfied: () => false });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => { throw new Error('boom'); },
    });

    const target: Target = { key: 'checkout', conditions: [{ condition: 'auth' }] };

    // A throwing resolver is caught and downgraded to FAILED — never a rejection.
    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.FAILED });
    expect(errorSpy).toHaveBeenCalledWith('[ConditionRuntime] Condition orchestration failed:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('dedupes concurrent ensures only when target key AND serialized params match', async () => {
    const resolveCalls: unknown[] = [];
    const satisfiedParams = new Set<string>();
    rt.registerCondition({
      key: 'feature_check',
      satisfied: (params?: Record<string, unknown>) => satisfiedParams.has(String(params?.feature)),
    });
    rt.registerResolver({
      condition: 'feature_check',
      resolve: async ({ params }) => {
        resolveCalls.push(params);
        satisfiedParams.add(String(params?.feature));
        return ResolveResult.SUCCESS;
      },
    });

    // Same target key, same condition key, DIFFERENT params → different
    // single-flight keys → two real runs (stableSerialize keeps them apart).
    const targetA: Target = {
      key: 'pay',
      conditions: [{ condition: 'feature_check', params: { feature: 'a', nested: { x: 1, y: [2] } } }],
    };
    const targetB: Target = {
      key: 'pay',
      conditions: [{ condition: 'feature_check', params: { feature: 'b', nested: { x: 1, y: [2] } } }],
    };

    const [a, b] = await Promise.all([rt.ensure(targetA), rt.ensure(targetB)]);
    expect(a).toMatchObject({ result: EnsureResult.READY });
    expect(b).toMatchObject({ result: EnsureResult.READY });
    expect(resolveCalls).toHaveLength(2);
  });

  it('clears registrations on dispose() so subsequent ensure() reports ERROR', async () => {
    let authSatisfied = false;
    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({
      condition: 'auth',
      resolve: async () => { authSatisfied = true; return ResolveResult.SUCCESS; },
    });

    const target: Target = { key: 'checkout', conditions: [{ condition: 'auth' }] };
    await expect(rt.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });

    rt.dispose();
    authSatisfied = false; // also drop the out-of-band state

    // After dispose the condition registration is gone → programmer error,
    // matching the documented "root runtime wipe" warning.
    const outcome = await rt.ensure(target);
    expect(outcome).toMatchObject({ result: EnsureResult.ERROR });
    expect((outcome as { result: EnsureResult.ERROR; message: string }).message).toContain('auth');
  });

  it('passes target.owner through to the resolver ctx, uninterpreted', async () => {
    let seenOwner: unknown = 'unset';
    let authSatisfied = false;
    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({
      condition: 'auth',
      resolve: async (ctx) => {
        seenOwner = ctx.owner;
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const page = { tag: 'index-page' };
    await rt.ensure({ key: 'home', conditions: [{ condition: 'auth' }], owner: page });

    expect(seenOwner).toBe(page);
  });

  it('owner is typed on the resolver side: Resolver<TOwner> narrows ctx.owner', async () => {
    interface AgreementOwner { presentAgreement(): Promise<boolean> }
    let called = false;
    let authSatisfied = false;
    rt.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    rt.registerResolver({
      condition: 'auth',
      resolve: async (ctx: ResolveContext<AgreementOwner>) => {
        called = true;
        ctx.owner?.presentAgreement; // narrowing works at the type level (tsc)
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    } as Resolver<AgreementOwner>);

    const outcome = await rt.ensure({ key: 'home', conditions: [{ condition: 'auth' }] });
    // Runtime half: the resolver actually ran (READY requires SUCCESS,
    // which requires the post-verify of the satisfied flag it flipped).
    expect(outcome).toMatchObject({ result: EnsureResult.READY });
    expect(called).toBe(true);
  });

  it('omits owner from the dedup key: identical key+conditions with different owners dedupe to one run', async () => {
    // The target key identifies the caller; owner is the caller's substance —
    // so concurrent ensures with same key/conditions but different owners
    // share the in-flight promise and the resolver runs once.
    let resolveCalls = 0;
    rt.registerCondition({ key: 'city', satisfied: () => false });
    rt.registerResolver({
      condition: 'city',
      resolve: async () => { resolveCalls++; return ResolveResult.CANCEL; },
    });

    const [a, b] = await Promise.all([
      rt.ensure({ key: 'home', conditions: [{ condition: 'city' }], owner: { tag: 'A' } }),
      rt.ensure({ key: 'home', conditions: [{ condition: 'city' }], owner: { tag: 'B' } }),
    ]);

    expect(resolveCalls).toBe(1);
    // The in-flight promise is literally the same object — single-flight
    // dedup shares the promise, not just the outcome value.
    expect(a).toBe(b);
    expect(a).toMatchObject({ result: EnsureResult.CANCEL });
    expect(b).toMatchObject({ result: EnsureResult.CANCEL });
  });
});
