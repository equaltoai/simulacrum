import { assertEqual, assertOk } from './_harness/assert.mjs';
import { SkipTestError } from './_harness/skip.mjs';

function isDeniedMessage(message) {
	return /(insufficient|forbidden|unauthori|not authorized|not authenticated|missing .*scope|scope.*missing)/i.test(
		String(message ?? '')
	);
}

function isDeniedError(error) {
	if (!error) return false;
	const code = String(error?.extensions?.code ?? '').toUpperCase();
	if (['FORBIDDEN', 'UNAUTHORIZED', 'UNAUTHENTICATED', 'INSUFFICIENT_SCOPE'].includes(code)) return true;
	return isDeniedMessage(error?.message);
}

function assertGraphqlDenied(res, label) {
	if (res.status === 401 || res.status === 403) return;

	assertEqual(res.status, 200, `${label}: expected 401/403 or 200 w/ GraphQL errors`);
	const errors = res.body?.errors;
	assertOk(Array.isArray(errors) && errors.length > 0, `${label}: expected GraphQL errors`);
	assertOk(errors.some(isDeniedError), `${label}: expected authz/scope denial error (got: ${errors[0]?.message ?? 'unknown'})`);
}

function assertGraphqlAllowed(res, label) {
	assertEqual(res.status, 200, `${label}: expected 200`);
	const errors = res.body?.errors;
	if (Array.isArray(errors) && errors.length) {
		const first = errors?.[0]?.message;
		throw new Error(`${label}: expected no GraphQL errors (got ${errors.length}${first ? `: ${first}` : ''})`);
	}
}

const ADMIN_REPORTS_QUERY = `query AdminReportsAuthz($status: AdminReportStatus = OPEN) {
  adminReports(status: $status, first: 1) {
    reports { id }
    nextCursor
  }
}`;

const ADMIN_ACCOUNTS_QUERY = `query AdminAccountsAuthz {
  adminAccounts(first: 1) {
    accounts { id username }
    nextCursor
  }
}`;

const ADMIN_AGENT_POLICY_QUERY = `query AdminAgentPolicyAuthz {
  adminAgentPolicy {
    allowAgents
    updatedAt
  }
}`;

const UPDATE_ADMIN_AGENT_POLICY_MUTATION = `mutation UpdateAdminAgentPolicyAuthz($input: UpdateAdminAgentPolicyInput!) {
  updateAdminAgentPolicy(input: $input) {
    allowAgents
    updatedAt
  }
}`;

const VIEWER_USERNAME_QUERY = `query ViewerUsername {
  viewer { username }
}`;

const AGENTS_LIST_QUERY = `query AgentsList($first: Int = 20) {
  agents(first: $first) {
    edges {
      node {
        username
        agentOwner
      }
    }
  }
}`;

const AGENT_DETAIL_QUERY = `query AgentDetail($username: String!) {
  agent(username: $username) {
    username
    displayName
    bio
    agentType
    agentVersion
    agentOwner
  }
}`;

const UPDATE_AGENT_MUTATION = `mutation UpdateAgentAuthz($username: String!, $input: UpdateAgentInput!) {
  updateAgent(username: $username, input: $input) {
    id
    username
    displayName
  }
}`;

export default [
	{
		slug: 'rest.authz.verify_credentials_requires_auth',
		name: 'REST authz: verify_credentials without token returns 401',
		tags: ['policy', 'rest', 'authz'],
		async run({ rest }) {
			const res = await rest('verify_credentials_noauth', {
				path: '/api/v1/accounts/verify_credentials',
				token: null,
			});

			assertEqual(res.status, 401, 'Expected verify_credentials without token to return 401');
		},
	},
	{
		slug: 'gql.authz.viewer_requires_auth',
		name: 'GraphQL authz: viewer without token is denied',
		tags: ['policy', 'graphql', 'authz'],
		async run({ gql }) {
			const res = await gql('viewer_noauth', {
				query: `query ViewerNoAuth { viewer { id } }`,
				operationName: 'ViewerNoAuth',
				token: null,
			});

			assertGraphqlDenied(res, 'viewer without token');
		},
	},
	{
		slug: 'gql.authz.admin_reports_scope',
		name: 'GraphQL authz: adminReports requires admin scope (admin allowed, others denied)',
		tags: ['policy', 'graphql', 'authz', 'admin'],
		requiresAuth: true,
		async run({ gql, profile }) {
			const res = await gql('admin_reports_authz', {
				query: ADMIN_REPORTS_QUERY,
				operationName: 'AdminReportsAuthz',
				variables: { status: 'OPEN' },
			});

			if (profile === 'admin') {
				assertGraphqlAllowed(res, 'adminReports as admin');
				assertOk(Array.isArray(res.body?.data?.adminReports?.reports), 'Expected adminReports.reports array');
				return;
			}

			assertGraphqlDenied(res, 'adminReports as non-admin');
		},
	},
	{
		slug: 'gql.authz.admin_accounts_scope',
		name: 'GraphQL authz: adminAccounts requires admin scope (admin allowed, others denied)',
		tags: ['policy', 'graphql', 'authz', 'admin'],
		requiresAuth: true,
		async run({ gql, profile }) {
			const res = await gql('admin_accounts_authz', {
				query: ADMIN_ACCOUNTS_QUERY,
				operationName: 'AdminAccountsAuthz',
			});

			if (profile === 'admin') {
				assertGraphqlAllowed(res, 'adminAccounts as admin');
				assertOk(Array.isArray(res.body?.data?.adminAccounts?.accounts), 'Expected adminAccounts.accounts array');
				return;
			}

			assertGraphqlDenied(res, 'adminAccounts as non-admin');
		},
	},
	{
		slug: 'gql.authz.admin_agent_policy_scope',
		name: 'GraphQL authz: adminAgentPolicy requires admin scope (admin allowed, others denied)',
		tags: ['policy', 'graphql', 'authz', 'admin'],
		requiresAuth: true,
		async run({ gql, profile }) {
			const res = await gql('admin_agent_policy_authz', {
				query: ADMIN_AGENT_POLICY_QUERY,
				operationName: 'AdminAgentPolicyAuthz',
			});

			if (profile === 'admin') {
				assertGraphqlAllowed(res, 'adminAgentPolicy as admin');
				assertOk(typeof res.body?.data?.adminAgentPolicy?.allowAgents === 'boolean', 'Expected adminAgentPolicy.allowAgents');
				return;
			}

			assertGraphqlDenied(res, 'adminAgentPolicy as non-admin');
		},
	},
	{
		slug: 'gql.authz.admin_policy_mutation_denied_non_admin',
		name: 'GraphQL authz: updateAdminAgentPolicy denied for non-admin profiles',
		tags: ['policy', 'graphql', 'authz', 'admin', 'mutation'],
		requiresAuth: true,
		async run({ gql, profile }) {
			if (profile === 'admin') {
				throw new SkipTestError('Skipping to avoid mutating admin policy; run with user/delegated to assert denial.');
			}

			const input = {
				allowAgents: true,
				allowAgentRegistration: false,
				defaultQuarantineDays: 7,
				maxAgentsPerOwner: 10,
				allowRemoteAgents: false,
				remoteQuarantineDays: 7,
				blockedAgentDomains: [],
				trustedAgentDomains: [],
				agentMaxPostsPerHour: 0,
				verifiedAgentMaxPostsPerHour: 0,
				agentMaxFollowsPerHour: 0,
				verifiedAgentMaxFollowsPerHour: 0,
				hybridRetrievalEnabled: false,
				hybridRetrievalMaxCandidates: 0,
			};

			const res = await gql('update_admin_agent_policy_denied', {
				query: UPDATE_ADMIN_AGENT_POLICY_MUTATION,
				operationName: 'UpdateAdminAgentPolicyAuthz',
				variables: { input },
			});

			assertGraphqlDenied(res, 'updateAdminAgentPolicy as non-admin');
		},
	},
	{
		slug: 'gql.authz.user_cannot_update_other_agent',
		name: 'GraphQL authz: user cannot update another owner’s agent',
		tags: ['policy', 'graphql', 'authz', 'agents', 'mutation'],
		requiresAuth: true,
		async run({ gql, profile, write }) {
			if (profile !== 'user') throw new SkipTestError('Requires user profile');
			if (!write) throw new SkipTestError('Write mode required (pass --write) to attempt a denied mutation safely');

			const viewerRes = await gql('viewer_username', {
				query: VIEWER_USERNAME_QUERY,
				operationName: 'ViewerUsername',
			});
			assertGraphqlAllowed(viewerRes, 'viewer username query');
			const viewerUsername = viewerRes.body?.data?.viewer?.username;
			assertOk(viewerUsername, 'Expected viewer.username');

			const agentsRes = await gql('agents_list', {
				query: AGENTS_LIST_QUERY,
				operationName: 'AgentsList',
				variables: { first: 20 },
			});
			assertGraphqlAllowed(agentsRes, 'agents list query');

			const edges = agentsRes.body?.data?.agents?.edges;
			assertOk(Array.isArray(edges), 'Expected agents.edges array');

			const selfHandle = `@${viewerUsername}`;
			const candidate = edges
				.map((e) => e?.node)
				.filter(Boolean)
				.find((node) => typeof node?.agentOwner === 'string' && !String(node.agentOwner).includes(selfHandle));

			if (!candidate?.username) {
				throw new SkipTestError('No non-owned agent found to test update denial');
			}

			const detailRes = await gql('agent_detail', {
				query: AGENT_DETAIL_QUERY,
				operationName: 'AgentDetail',
				variables: { username: candidate.username },
			});
			assertGraphqlAllowed(detailRes, 'agent detail query');

			const agent = detailRes.body?.data?.agent;
			if (!agent) throw new SkipTestError('Candidate agent not queryable (agent query returned null)');

			const updateRes = await gql('update_agent_denied', {
				query: UPDATE_AGENT_MUTATION,
				operationName: 'UpdateAgentAuthz',
				variables: {
					username: agent.username,
					input: {
						displayName: agent.displayName,
					},
				},
			});

			assertGraphqlDenied(updateRes, 'updateAgent on non-owned agent as user');
		},
	},
];

