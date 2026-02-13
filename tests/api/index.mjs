import smoke from './smoke.mjs';
import tokenLifecycle from './token-lifecycle.mjs';
import mutations from './mutations.mjs';
import authz from './authz.mjs';

export const tests = [...smoke, ...tokenLifecycle, ...mutations, ...authz];

export default tests;
