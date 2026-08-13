import { describe, expect, it } from 'vitest';
import { EnsureResult, ConditionRuntime, ResolveResult } from '@mini-dev/condition';
import type { Target } from '@mini-dev/condition';

/**
 * ConditionRuntime parent-child: a runtime constructed with a `parent` routes
 * refs by ownership — refs it registered resolve locally, the rest delegate
 * to the parent — and runs the parent phase to READY before its own
 * (parent-first). Replaces the old `scope` label + `PageRuntime` wrapper.
 */
describe('ConditionRuntime parent-child', () => {
  it('resolves parent-owned refs before own refs (parent-first)', async () => {
    const calls: string[] = [];
    let authSatisfied = false;
    let draftSatisfied = false;

    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    globalFlow.registerResolver({
      condition: 'auth',
      resolve: async () => {
        calls.push('global');
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'draft', satisfied: () => draftSatisfied });
    pageFlow.registerResolver({
      condition: 'draft',
      resolve: async () => {
        calls.push('page');
        draftSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }, { condition: 'draft' }],
    };

    await expect(pageFlow.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(calls).toEqual(['global', 'page']);
  });

  it('exposes parent-resolved conditions through the resolver runtime view', async () => {
    let authSatisfied = false;
    let draftSatisfied = false;

    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => authSatisfied });
    globalFlow.registerResolver({
      condition: 'auth',
      resolve: async () => {
        authSatisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'draft', satisfied: () => draftSatisfied });
    pageFlow.registerResolver({
      condition: 'draft',
      resolve: async ({ runtime }) => {
        // auth was resolved by the parent phase already.
        expect(runtime.isSatisfied('auth')).toBe(true);
        expect(runtime.isSatisfied('draft')).toBe(false);
        draftSatisfied = true;
        expect(runtime.isSatisfied('draft')).toBe(true);
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }, { condition: 'draft' }],
    };

    await expect(pageFlow.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
  });

  it('does not run own resolvers when the parent cancels', async () => {
    let pageResolverCalled = false;

    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => false });
    globalFlow.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.CANCEL });

    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'draft', satisfied: () => false });
    pageFlow.registerResolver({
      condition: 'draft',
      resolve: async () => {
        pageResolverCalled = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }, { condition: 'draft' }],
    };

    await expect(pageFlow.ensure(target)).resolves.toMatchObject({ result: EnsureResult.CANCEL });
    expect(pageResolverCalled).toBe(false);
  });

  it('does not run own resolvers when the parent fails', async () => {
    let pageResolverCalled = false;

    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => false });
    globalFlow.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.FAILED });

    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'draft', satisfied: () => false });
    pageFlow.registerResolver({
      condition: 'draft',
      resolve: async () => {
        pageResolverCalled = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }, { condition: 'draft' }],
    };

    await expect(pageFlow.ensure(target)).resolves.toMatchObject({ result: EnsureResult.FAILED });
    expect(pageResolverCalled).toBe(false);
  });

  it('lets the child override the parent for a same-key condition', async () => {
    const calls: string[] = [];
    let satisfied = false;

    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => satisfied });
    globalFlow.registerResolver({
      condition: 'auth',
      resolve: async () => {
        calls.push('parent');
        return ResolveResult.SUCCESS;
      },
    });

    // Child registers the SAME key — child wins, parent's resolver never runs.
    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'auth', satisfied: () => satisfied });
    pageFlow.registerResolver({
      condition: 'auth',
      resolve: async () => {
        calls.push('child');
        satisfied = true;
        return ResolveResult.SUCCESS;
      },
    });

    const target: Target = { key: 'checkout', conditions: [{ condition: 'auth' }] };

    await expect(pageFlow.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    expect(calls).toEqual(['child']);
  });

  it('returns ERROR when a ref is owned by neither this runtime nor the parent', async () => {
    const globalFlow = new ConditionRuntime();
    const pageFlow = new ConditionRuntime(globalFlow);
    // Neither registers 'missing'.
    const target: Target = { key: 'checkout', conditions: [{ condition: 'missing' }] };

    const outcome = await pageFlow.ensure(target);
    expect(outcome).toMatchObject({ result: EnsureResult.ERROR });
    expect((outcome as { result: EnsureResult.ERROR; message: string }).message).toContain('missing');
  });

  it('resolves a condition registered on a grandparent (3-level chain)', async () => {
    let rootSatisfied = false;
    let midSatisfied = false;
    let leafSatisfied = false;
    const calls: string[] = [];

    const root = new ConditionRuntime();
    root.registerCondition({ key: 'auth', satisfied: () => rootSatisfied });
    root.registerResolver({
      condition: 'auth',
      resolve: async () => { rootSatisfied = true; calls.push('auth'); return ResolveResult.SUCCESS; },
    });

    const mid = new ConditionRuntime(root);
    mid.registerCondition({ key: 'agreement', satisfied: () => midSatisfied });
    mid.registerResolver({
      condition: 'agreement',
      resolve: async () => { midSatisfied = true; calls.push('agreement'); return ResolveResult.SUCCESS; },
    });

    const leaf = new ConditionRuntime(mid);
    leaf.registerCondition({ key: 'draft', satisfied: () => leafSatisfied });
    leaf.registerResolver({
      condition: 'draft',
      resolve: async () => { leafSatisfied = true; calls.push('draft'); return ResolveResult.SUCCESS; },
    });

    const target: Target = {
      key: 'editor',
      conditions: [
        { condition: 'auth' },      // owned by root (grandparent)
        { condition: 'agreement' }, // owned by mid (parent)
        { condition: 'draft' },     // owned by leaf (self)
      ],
    };

    // 'auth' is on the grandparent — partitionRefs must recurse past mid to find it.
    await expect(leaf.ensure(target)).resolves.toMatchObject({ result: EnsureResult.READY });
    // parent-first order: root resolves auth, mid resolves agreement, leaf resolves draft.
    expect(calls).toEqual(['auth', 'agreement', 'draft']);
  });

  it('reports a parent-phase DEFERRED through the outcome deferredCondition', async () => {
    const globalFlow = new ConditionRuntime();
    globalFlow.registerCondition({ key: 'auth', satisfied: () => false });
    globalFlow.registerResolver({ condition: 'auth', resolve: async () => ResolveResult.DEFERRED });

    const pageFlow = new ConditionRuntime(globalFlow);
    pageFlow.registerCondition({ key: 'draft', satisfied: () => false });
    pageFlow.registerResolver({ condition: 'draft', resolve: async () => ResolveResult.SUCCESS });

    const target: Target = {
      key: 'checkout',
      conditions: [{ condition: 'auth' }, { condition: 'draft' }],
    };

    const outcome = await pageFlow.ensure(target);
    expect(outcome).toMatchObject({
      result: EnsureResult.DEFERRED,
      deferredCondition: { condition: 'auth' },
    });
  });
});
