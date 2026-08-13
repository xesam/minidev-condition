// ============================================================
// @mini-dev/condition - Public API
// ============================================================

// Types
export type {
  Condition,
  ConditionRef,
  ResolveContext,
  Resolver,
  RuntimeView,
  Target,
} from './types';

export {
  EnsureResult,
  ResolveResult,
} from './types';

// Core engine
export { ConditionRuntime } from './runtime';

// Page-edge helpers — translate page lifecycle into explicit ensure() calls.
// Still platform-free; the page wires start/resume/pause/dispose itself.
export {
  createPrerequisiteController,
  createTarget,
  normalizePrerequisites,
} from './prerequisites';
export type {
  PrerequisiteControllerOptions,
  PrerequisiteRef,
  PrerequisiteRuntime,
} from './prerequisites';
