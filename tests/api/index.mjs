import smoke from './smoke.mjs';
import tokenLifecycle from './token-lifecycle.mjs';

export const tests = [...smoke, ...tokenLifecycle];

export default tests;
