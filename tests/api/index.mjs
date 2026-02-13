import smoke from './smoke.mjs';
import tokenLifecycle from './token-lifecycle.mjs';
import mutations from './mutations.mjs';

export const tests = [...smoke, ...tokenLifecycle, ...mutations];

export default tests;
