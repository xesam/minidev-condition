import { describe, expect, it } from 'vitest';
import { EnsureResult, ConditionRuntime, ResolveResult } from '../src';
import { createPrerequisiteController } from '../src';

/** Drain microtasks + one macrotask so async `run()` settles. */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createPrerequisiteController', () => {
  it('revives and continues the chain after a deferred condition is satisfied', async () => {
    const runtime = new ConditionRuntime();
    let authSatisfied = false;
    let citySatisfied = false;
    runtime.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    runtime.registerCondition({ key: 'city', satisfied: () => citySatisfied });
    // "Navigation" resolvers return DEFERRED; they don't satisfy here.
    runtime.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.DEFERRED });
    runtime.registerResolver({
      condition: 'city',
      resolve: async () => { citySatisfied = true; return ResolveResult.SUCCESS; },
    });

    let ready = false;
    const flow = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth', 'city'],
      onReady: () => { ready = true; },
    });

    flow.start();           // kicks ensure → auth defers
    await flush();
    expect(ready).toBe(false);   // not ready: chain paused at auth

    // User satisfies auth out-of-band (e.g. granted on the auth page).
    authSatisfied = true;

    // Initial onShow (no onHide yet) must NOT revive — avoid re-triggering.
    flow.resume();
    await flush();
    expect(ready).toBe(false);

    // User leaves the page and returns.
    flow.pause();
    flow.resume();           // revive: auth satisfied → chain resumes → city
    await flush();
    expect(ready).toBe(true);
  });

  it('terminates when the user returns without satisfying the deferred condition', async () => {
    const runtime = new ConditionRuntime();
    let authSatisfied = false;
    runtime.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    runtime.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.DEFERRED });

    let ready = false;
    let cancelled = false;
    const flow = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => { ready = true; },
      onCancel: () => { cancelled = true; },
    });

    flow.start();
    await flush();
    expect(ready).toBe(false);

    // auth stays unsatisfied (user denied / went back).
    flow.pause();
    flow.resume();
    await flush();
    expect(cancelled).toBe(true);
    expect(ready).toBe(false);
  });

  it('does not re-trigger the deferred resolver on the initial onShow', async () => {
    const runtime = new ConditionRuntime();
    let authResolveCount = 0;
    runtime.registerCondition({ key: 'auth', satisfied: () => false });
    runtime.registerResolver({
      condition: 'auth',
      resolve: async () => { authResolveCount++; return ResolveResult.DEFERRED; },
    });

    const flow = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => {},
    });

    flow.start();
    await flush();
    expect(authResolveCount).toBe(1);

    // The onShow that WeChat fires right after onLoad must not re-run ensure.
    flow.resume();
    await flush();
    expect(authResolveCount).toBe(1);
  });

  it('terminates when a resolver returns CANCEL (modal deny)', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'agreement', satisfied: () => false });
    runtime.registerResolver({ condition: 'agreement', resolve: async () => ResolveResult.CANCEL });

    let ready = false;
    let cancelled = false;
    const flow = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['agreement'],
      onReady: () => { ready = true; },
      onCancel: () => { cancelled = true; },
    });

    flow.start();
    await flush();
    expect(ready).toBe(false);
    expect(cancelled).toBe(true);
  });

  it('is ready immediately when all conditions are already satisfied', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'auth', satisfied: () => true });
    runtime.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.SUCCESS });

    let ready = false;
    const flow = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => { ready = true; },
    });

    flow.start();
    await flush();
    expect(ready).toBe(true);
  });
});
