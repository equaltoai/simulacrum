import {
	resolveProfileActorId,
	resolveProfileIdentifier,
	resolveStatusId,
	resolveWindowAgentHint,
	resolveWindowPage,
} from './routing';

export function readClientProps() {
	return {
		initialPage: resolveWindowPage(),
		initialAgentHint: resolveWindowAgentHint(),
		initialStatusId: resolveStatusId(window.location.pathname),
		initialProfileIdentifier: resolveProfileIdentifier(window.location.pathname),
		initialProfileActorId: resolveProfileActorId(new URLSearchParams(window.location.search)),
	};
}
