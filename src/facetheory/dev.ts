import { resolveWindowAgentHint, resolveWindowPage } from './routing';

export function readClientProps() {
	return {
		initialPage: resolveWindowPage(),
		initialAgentHint: resolveWindowAgentHint(),
	};
}
