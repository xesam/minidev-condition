import { describe, expect, it, vi } from 'vitest';
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
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth', 'city'],
      onReady: () => { ready = true; },
    });

    controller.start();           // kicks ensure → auth defers
    await flush();
    expect(ready).toBe(false);   // not ready: chain paused at auth

    // User satisfies auth out-of-band (e.g. granted on the auth page).
    authSatisfied = true;

    // Initial onShow (no onHide yet) must NOT revive — avoid re-triggering.
    controller.resume();
    await flush();
    expect(ready).toBe(false);

    // User leaves the page and returns.
    controller.pause();
    controller.resume();           // revive: auth satisfied → chain resumes → city
    await flush();
    expect(ready).toBe(true);
  });

  it('terminates when the user returns without satisfying the deferred condition', async () => {
    const runtime = new ConditionRuntime();
    let authSatisfied = false;
    let resolveCount = 0;
    runtime.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    runtime.registerResolver({
      condition: 'auth',
      resolve: async () => { resolveCount++; return ResolveResult.DEFERRED; },
    });

    let ready = false;
    let cancelled = false;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => { ready = true; },
      onCancel: () => { cancelled = true; },
    });

    controller.start();
    await flush();
    expect(ready).toBe(false);
    expect(resolveCount).toBe(1);

    // auth stays unsatisfied (user denied / went back).
    controller.pause();
    controller.resume();
    await flush();
    expect(cancelled).toBe(true);
    expect(ready).toBe(false);
    // Termination is terminal: a stray resume must NOT re-trigger the
    // side-controller (no re-navigation loop).
    controller.resume();
    await flush();
    expect(resolveCount).toBe(1);
  });

  it('reports the deferred condition as cancelledCondition when the user returns unsatisfied', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'auth', satisfied: () => false });
    runtime.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.DEFERRED });

    let outcome: unknown = null;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: [{ condition: 'auth', params: { source: 'settings' } }],
      onReady: () => {},
      onCancel: (o) => { outcome = o; },
    });

    controller.start();
    await flush();
    controller.pause();
    controller.resume();
    await flush();

    expect(outcome).toMatchObject({
      result: EnsureResult.CANCEL,
      cancelledCondition: { condition: 'auth', params: { source: 'settings' } },
    });
  });

  it('does not re-trigger the deferred resolver on the initial onShow', async () => {
    const runtime = new ConditionRuntime();
    let authResolveCount = 0;
    runtime.registerCondition({ key: 'auth', satisfied: () => false });
    runtime.registerResolver({
      condition: 'auth',
      resolve: async () => { authResolveCount++; return ResolveResult.DEFERRED; },
    });

    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => {},
    });

    controller.start();
    await flush();
    expect(authResolveCount).toBe(1);

    // The onShow that WeChat fires right after onLoad must not re-run ensure.
    controller.resume();
    await flush();
    expect(authResolveCount).toBe(1);
  });

  it('terminates when a resolver returns CANCEL (modal deny)', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'agreement', satisfied: () => false });
    runtime.registerResolver({ condition: 'agreement', resolve: async () => ResolveResult.CANCEL });

    let ready = false;
    let cancelled = false;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['agreement'],
      onReady: () => { ready = true; },
      onCancel: () => { cancelled = true; },
    });

    controller.start();
    await flush();
    expect(ready).toBe(false);
    expect(cancelled).toBe(true);
  });

  it('passes the terminating condition identity through onCancel (per-condition policies)', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'agreement', satisfied: () => false });
    runtime.registerCondition({ key: 'city', satisfied: () => true });
    runtime.registerResolver({ condition: 'agreement', resolve: async () => ResolveResult.CANCEL });

    let outcome: unknown = null;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['agreement', 'city'],
      onReady: () => {},
      onCancel: (o) => { outcome = o; },
    });

    controller.start();
    await flush();

    // A single controller can now branch per-condition: pages no longer need to
    // split into multiple flows just to express different failure policies.
    expect(outcome).toMatchObject({
      result: EnsureResult.CANCEL,
      cancelledCondition: { condition: 'agreement' },
    });
  });

  it('is ready immediately when all conditions are already satisfied', async () => {
    const runtime = new ConditionRuntime();
    runtime.registerCondition({ key: 'auth', satisfied: () => true });
    // "Immediately" means no resolver ran: the ready path must go straight
    // through findUnsatisfiedRefs (already-satisfied filter).
    const resolve = vi.fn(async () => ResolveResult.SUCCESS);
    runtime.registerResolver({ condition: 'auth', resolve });

    let ready = false;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => { ready = true; },
    });

    controller.start();
    await flush();
    expect(ready).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('revives with the ref params: resume re-checks the deferred condition by its params', async () => {
    const runtime = new ConditionRuntime();
    const satisfiedFeatures = new Set<string>();
    runtime.registerCondition({
      key: 'feature_check',
      // Satisfied per-params — the deferred revive must pass params through.
      satisfied: (params?: Record<string, unknown>) => satisfiedFeatures.has(String(params?.feature)),
    });
    runtime.registerResolver({ condition: 'feature_check', resolve: async () => ResolveResult.DEFERRED });

    let ready = false;
    const controller = createPrerequisiteController({
      runtime,
      key: 'pay',
      prereqs: [{ condition: 'feature_check', params: { feature: 'fancy-pay' } }],
      onReady: () => { ready = true; },
    });

    controller.start();
    await flush();
    expect(ready).toBe(false);

    // Satisfy THIS feature's ref out-of-band. If the controller dropped the
    // ref params on resume (re-checking with undefined), the per-params
    // condition would stay unsatisfied and the controller would terminate instead
    // of reviving — so reaching ready proves params survived the round-trip.
    satisfiedFeatures.add('fancy-pay');
    controller.pause();
    controller.resume();
    await flush();
    expect(ready).toBe(true);
  });

  it('dispose() discards the deferred state: a later resume does not revive the controller', async () => {
    const runtime = new ConditionRuntime();
    let authSatisfied = false;
    let resolveCount = 0;
    runtime.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    runtime.registerResolver({
      condition: 'auth',
      resolve: async () => { resolveCount++; return ResolveResult.DEFERRED; },
    });

    let ready = false;
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['auth'],
      onReady: () => { ready = true; },
    });

    controller.start();
    await flush();
    expect(resolveCount).toBe(1);

    controller.dispose(); // page unloaded — controller state must not outlive the page
    authSatisfied = true;
    controller.pause();
    controller.resume();  // stray onShow after unload: must be a no-op
    await flush();
    expect(ready).toBe(false);
    expect(resolveCount).toBe(1);

    // A fresh page instance (start) re-enters the controller from scratch.
    controller.start();
    await flush();
    expect(ready).toBe(true);
    expect(resolveCount).toBe(1); // auth already satisfied at the fresh start
  });

  it('passes opts.owner to the resolver on every controller (re)entry', async () => {
    const runtime = new ConditionRuntime();
    const owners: unknown[] = [];
    runtime.registerCondition({ key: 'city', satisfied: () => false });
    runtime.registerResolver({
      condition: 'city',
      resolve: async (ctx) => {
        owners.push(ctx.owner);
        return ResolveResult.DEFERRED;
      },
    });

    const page = { tag: 'home-page' };
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['city'],
      owner: page,
      onReady: () => {},
    });

    controller.start();
    await flush();
    expect(owners).toEqual([page]); // first call carries the owner

    // User returns unsatisfied → the deferred branch terminates (no
    // re-trigger). A FRESH start (page re-attempt) re-enters the controller
    // and the resolver sees the SAME owner again — the owner lives in
    // the controller's closure, not in any per-call registration.
    controller.pause();
    controller.resume();
    await flush();

    controller.start();
    await flush();
    expect(owners).toEqual([page, page]);
  });

  it('supports an in-call resolver driving page UI through owner (overlay pattern)', async () => {
    const runtime = new ConditionRuntime();
    let agreed = false;
    runtime.registerCondition({ key: 'agreement', satisfied: () => agreed });
    // The overlay resolver: reach the initiating page via the typed owner —
    // no global state, no registration hook; missing owner → FAILED.
    runtime.registerResolver({
      condition: 'agreement',
      resolve: async (ctx) => {
        const page = ctx.owner as { presentAgreement(): Promise<boolean> } | undefined;
        if (!page?.presentAgreement) return ResolveResult.FAILED;
        agreed = await page.presentAgreement();
        return agreed ? ResolveResult.SUCCESS : ResolveResult.CANCEL;
      },
    });

    let ready = false;
    let overlayShown = false;
    const page = {
      presentAgreement: () => {
        overlayShown = true;
        return Promise.resolve(true); // user agreed
      },
    };
    const controller = createPrerequisiteController({
      runtime,
      key: 'home',
      prereqs: ['agreement'],
      owner: page,
      onReady: () => { ready = true; },
    });

    controller.start();
    await flush();
    expect(overlayShown).toBe(true); // the page's UI got driven by the resolver
    expect(ready).toBe(true);        // agreement satisfied → journey ready
  });
});
