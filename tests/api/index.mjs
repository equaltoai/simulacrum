import smoke from './smoke.mjs';
import tokenLifecycle from './token-lifecycle.mjs';
import mutations from './mutations.mjs';
import authz from './authz.mjs';
import regressions from './regressions/index.mjs';

export const tests = [...smoke, ...tokenLifecycle, ...mutations, ...authz, ...regressions];

export default tests;
