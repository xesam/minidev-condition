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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.READY);
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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.READY);
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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.CANCEL);
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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.FAILED);
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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.READY);
    expect(calls).toEqual(['child']);
  });

  it('fails when a ref is owned by neither this runtime nor the parent', async () => {
    const globalFlow = new ConditionRuntime();
    const pageFlow = new ConditionRuntime(globalFlow);
    // Neither registers 'missing'.
    const target: Target = { key: 'checkout', conditions: [{ condition: 'missing' }] };

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.FAILED);
  });

  it('reports a parent-phase DEFERRED through getDeferredCondition', async () => {
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

    await expect(pageFlow.ensure(target)).resolves.toBe(EnsureResult.DEFERRED);
    expect(pageFlow.getDeferredCondition()?.condition).toBe('auth');
  });
});
