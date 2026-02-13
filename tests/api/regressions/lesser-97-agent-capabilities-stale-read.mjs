import { assertEqual, assertOk } from '../_harness/assert.mjs';
import { SkipTestError } from '../_harness/skip.mjs';

function assertGraphqlOk(res, label) {
	assertEqual(res.status, 200, `${label}: expected 200`);
	if (Array.isArray(res.body?.errors) && res.body.errors.length) {
		const first = res.body.errors?.[0]?.message ?? 'unknown';
		throw new Error(`${label}: GraphQL returned errors (${res.body.errors.length}): ${first}`);
	}
}

function shouldSkipAgents(res) {
	if (!Array.isArray(res.body?.errors)) return false;
	return res.body.errors.some((e) => typeof e?.message === 'string' && e.message.toLowerCase().includes('agents are disabled'));
}

const MY_AGENTS_QUERY = `query MyAgentsForRegression {
  myAgents {
    username
    displayName
    agentCapabilities {
      canPost
      canReply
      canBoost
      canFollow
      canDM
      maxPostsPerHour
      requiresApproval
      restrictedDomains
    }
  }
}`;

const AGENT_CAPS_QUERY = `query AgentCapsForRegression($username: String!) {
  agent(username: $username) {
    username
    agentCapabilities {
      canPost
      canReply
      canBoost
      canFollow
      canDM
      maxPostsPerHour
      requiresApproval
      restrictedDomains
    }
  }
}`;

const UPDATE_AGENT_MUTATION = `mutation UpdateAgentCapsRegression($username: String!, $input: UpdateAgentInput!) {
  updateAgent(username: $username, input: $input) {
    username
    agentCapabilities { canDM }
  }
}`;

export default [
	{
		slug: 'regression.lesser-97.agent-capabilities-read-your-writes',
		name: "Regression (lesser#97): agent(username) should be read-your-writes after updateAgent",
		issue: { repo: 'equaltoai/lesser', number: 97 },
		tags: ['regression', 'graphql', 'agents', 'mutation', 'lesser-97'],
		requiresAuth: true,
		async run({ gql, evidence, profile, write }) {
			if (!write) throw new SkipTestError('Write mode required (pass --write)');
			if (profile !== 'user') throw new SkipTestError('Requires user profile (agent owner)');

			const listRes = await gql('my_agents_regression', {
				query: MY_AGENTS_QUERY,
				operationName: 'MyAgentsForRegression',
			});

			if (shouldSkipAgents(listRes)) throw new SkipTestError('agents are disabled');
			assertGraphqlOk(listRes, 'myAgents');

			const agents = listRes.body?.data?.myAgents;
			assertOk(Array.isArray(agents), 'Expected myAgents array');

			const agent = agents[0];
			if (!agent?.username) throw new SkipTestError('No agents exist for this user');

			const username = agent.username;
			const original = agent.agentCapabilities;
			assertOk(original && typeof original === 'object', 'Expected agentCapabilities in myAgents');

			const updated = { ...original, canDM: !Boolean(original.canDM) };
			const inputCaps = {
				canPost: Boolean(updated.canPost),
				canReply: Boolean(updated.canReply),
				canBoost: Boolean(updated.canBoost),
				canFollow: Boolean(updated.canFollow),
				canDM: Boolean(updated.canDM),
				maxPostsPerHour: Number(updated.maxPostsPerHour ?? 0),
				requiresApproval: Boolean(updated.requiresApproval),
				restrictedDomains: updated.restrictedDomains ?? null,
			};

			evidence.note(`target agent: ${username}`);
			evidence.note(`toggle canDM: ${original.canDM} -> ${updated.canDM}`);

			let didUpdate = false;

			try {
				const updateRes = await gql('update_agent_caps_regression', {
					query: UPDATE_AGENT_MUTATION,
					operationName: 'UpdateAgentCapsRegression',
					variables: {
						username,
						input: {
							agentCapabilities: inputCaps,
						},
					},
				});
				assertGraphqlOk(updateRes, 'updateAgent');
				didUpdate = true;

				const reads = [];
				for (let i = 0; i < 3; i++) {
					const readRes = await gql(`agent_caps_read_${i + 1}`, {
						query: AGENT_CAPS_QUERY,
						operationName: 'AgentCapsForRegression',
						variables: { username },
					});
					assertGraphqlOk(readRes, `agent read ${i + 1}`);

					const canDM = Boolean(readRes.body?.data?.agent?.agentCapabilities?.canDM);
					reads.push(canDM);
				}

				evidence.note(`reads canDM: ${reads.join(', ')}`);

				const allMatch = reads.every((v) => v === Boolean(updated.canDM));
				if (!allMatch) {
					throw new Error(`Read-your-writes violated: expected canDM=${Boolean(updated.canDM)}, got reads=[${reads.join(', ')}]`);
				}
			} finally {
				if (didUpdate) {
					try {
						await gql('revert_agent_caps_regression', {
							query: UPDATE_AGENT_MUTATION,
							operationName: 'UpdateAgentCapsRegression',
							variables: {
								username,
								input: {
									agentCapabilities: {
										canPost: Boolean(original.canPost),
										canReply: Boolean(original.canReply),
										canBoost: Boolean(original.canBoost),
										canFollow: Boolean(original.canFollow),
										canDM: Boolean(original.canDM),
										maxPostsPerHour: Number(original.maxPostsPerHour ?? 0),
										requiresApproval: Boolean(original.requiresApproval),
										restrictedDomains: original.restrictedDomains ?? null,
									},
								},
							},
						});
						evidence.note('cleanup: revert updateAgent: ok');
					} catch (error) {
						evidence.note(`cleanup: revert updateAgent: failed (${error?.message ?? String(error)})`);
					}
				}
			}
		},
	},
];

