<script lang="ts">
	import type { ActivityPubActor, ActivityPubTag, GenericStatus, GenericTimelineItem } from '$lib/generics';
	import type { ProfileData } from '$lib/components/Profile/context.js';
	import TimelineRoot from '$lib/components/Timeline/Root.svelte';
	import TimelineItem from '$lib/components/Timeline/Item.svelte';
	import StatusRoot from '$lib/components/Status/Root.svelte';
	import StatusHeader from '$lib/components/Status/Header.svelte';
	import StatusContent from '$lib/components/Status/Content.svelte';
	import StatusMedia from '$lib/components/Status/Media.svelte';
	import StatusActions from '$lib/components/Status/Actions.svelte';
	import ProfileRoot from '$lib/components/Profile/Root.svelte';
	import ProfileHeader from '$lib/components/Profile/Header.svelte';
	import ProfileStats from '$lib/components/Profile/Stats.svelte';

	const now = new Date();
	const baseUrl = 'https://dev.simulacrum.greater.website';

	const primaryAccount: ActivityPubActor = {
		id: `${baseUrl}/@sim`,
		type: 'Person',
		name: 'Simulacrum',
		preferredUsername: 'sim',
		displayName: 'Simulacrum',
		username: 'sim',
		acct: 'sim',
		summary: 'Prototype instance for testing the greater social client.',
		url: `${baseUrl}/@sim`,
		avatar: '',
		header: '',
		followersCount: 241,
		followingCount: 88,
		statusesCount: 42,
		bot: false,
	};

	const mentions: ActivityPubTag[] = [
		{
			type: 'Mention',
			name: '@lesser',
			username: 'lesser',
			acct: 'lesser@greater.website',
			url: 'https://greater.website/@lesser',
		},
	];

	const tags: ActivityPubTag[] = [
		{
			type: 'Hashtag',
			name: '#simulacrum',
			href: `${baseUrl}/tags/simulacrum`,
			url: `${baseUrl}/tags/simulacrum`,
		},
		{
			type: 'Hashtag',
			name: '#greater',
			href: `${baseUrl}/tags/greater`,
			url: `${baseUrl}/tags/greater`,
		},
	];

	const statusOne: GenericStatus = {
		id: 'status-1',
		activityPubObject: {
			id: `${baseUrl}/statuses/1`,
			type: 'Note',
			attributedTo: primaryAccount.id,
			content: 'Hello simulacrum.',
			published: now,
			url: `${baseUrl}/statuses/1`,
		},
		account: primaryAccount,
		content:
			'<p>Welcome to <strong>dev.simulacrum</strong>. This instance is our integration sandbox for the Greater social client. Say hi to @lesser and tag #simulacrum to join the thread.</p>',
		contentWarning: '',
		spoilerText: '',
		sensitive: false,
		mediaAttachments: [],
		mentions,
		hashtags: tags,
		tags,
		emojis: [],
		createdAt: now,
		repliesCount: 4,
		reblogsCount: 2,
		favouritesCount: 12,
		reblogged: false,
		favourited: false,
		bookmarked: false,
		visibility: 'public',
		url: `${baseUrl}/statuses/1`,
	};

	const statusTwo: GenericStatus = {
		id: 'status-2',
		activityPubObject: {
			id: `${baseUrl}/statuses/2`,
			type: 'Note',
			attributedTo: primaryAccount.id,
			content: 'Roadmap update.',
			published: now,
			url: `${baseUrl}/statuses/2`,
		},
		account: primaryAccount,
		content:
			'<p>Shipping the first Greater-powered client. Next up: moderation tooling, trust indicators, and the provisioning control surface.</p>',
		contentWarning: 'Roadmap notes',
		spoilerText: 'Roadmap notes',
		sensitive: false,
		mediaAttachments: [],
		mentions: [],
		hashtags: tags,
		tags,
		emojis: [],
		createdAt: now,
		repliesCount: 1,
		reblogsCount: 0,
		favouritesCount: 6,
		reblogged: false,
		favourited: false,
		bookmarked: true,
		visibility: 'public',
		url: `${baseUrl}/statuses/2`,
	};

	const timelineItems: GenericTimelineItem[] = [
		{ id: 'item-1', type: 'status', status: statusOne, timestamp: now },
		{ id: 'item-2', type: 'status', status: statusTwo, timestamp: now },
	];

	const profile: ProfileData = {
		id: 'profile-1',
		username: 'sim',
		displayName: 'Simulacrum',
		bio: 'Prototype instance for validating the greater.social client stack.',
		avatar: primaryAccount.avatar,
		header: primaryAccount.header,
		url: primaryAccount.url,
		followersCount: primaryAccount.followersCount ?? 0,
		followingCount: primaryAccount.followingCount ?? 0,
		statusesCount: primaryAccount.statusesCount ?? 0,
		fields: [
			{ name: 'Role', value: 'Prototype instance' },
			{ name: 'Region', value: 'us-east-1' },
		],
		createdAt: now.toISOString(),
	};
</script>

<svelte:head>
	<title>Simulacrum</title>
</svelte:head>

<div class="app">
	<header class="app__header">
		<div class="app__brand">
			<div class="app__mark">S</div>
			<div>
				<p class="app__title">Simulacrum</p>
				<p class="app__subtitle">Greater client sandbox</p>
			</div>
		</div>
		<nav class="app__header-actions">
			<a class="app__header-link" href={`${baseUrl}/auth`}>Sign in</a>
			<a class="app__header-link app__header-link--accent" href={`${baseUrl}/auth`}>
				Connect wallet
			</a>
		</nav>
	</header>

	<div class="app__body">
		<aside class="app__nav">
			<a class="app__nav-item app__nav-item--active" href={`${baseUrl}/l`}>Home</a>
			<a class="app__nav-item" href={`${baseUrl}/l/explore`}>Explore</a>
			<a class="app__nav-item" href={`${baseUrl}/l/notifications`}>Notifications</a>
			<a class="app__nav-item" href={`${baseUrl}/l/messages`}>Messages</a>
			<a class="app__nav-item" href={`${baseUrl}/l/admin`}>Admin</a>
		</aside>

		<main class="app__main">
			<section class="app__section">
				<h1 class="app__section-title">Live timeline</h1>
				<p class="app__section-description">
					This feed is seeded data until the API wiring is connected.
				</p>
			</section>

			<div class="app__timeline">
				<TimelineRoot
					items={timelineItems}
					config={{ virtualized: false, infiniteScroll: false }}
					initialState={{ hasMore: false }}
				>
					{#each timelineItems as item, index (item.id)}
						<TimelineItem {item} {index}>
							<StatusRoot status={item.status ?? statusOne} config={{ density: 'comfortable' }}>
								<StatusHeader />
								<StatusContent />
								<StatusMedia />
								<StatusActions />
							</StatusRoot>
						</TimelineItem>
					{/each}
				</TimelineRoot>
			</div>
		</main>

		<aside class="app__aside">
			<ProfileRoot profile={profile} isOwnProfile={true}>
				<ProfileHeader />
				<ProfileStats />
			</ProfileRoot>

			<section class="app__card">
				<h2>Launch checklist</h2>
				<ul>
					<li>Wire GraphQL adapter for live timelines.</li>
					<li>Enable moderation tooling for admins.</li>
					<li>Ship wallet + passkey onboarding.</li>
				</ul>
			</section>
		</aside>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		max-width: none;
		background: radial-gradient(circle at 20% 20%, #1b2434 0%, #0b0f17 55%, #07090e 100%);
		color: #f8fafc;
		font-family: 'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(a) {
		color: inherit;
		text-decoration: none;
	}

	.app {
		min-height: 100vh;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 32px;
		padding: 28px 40px 48px;
	}

	.app__header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 20px 24px;
		border-radius: 20px;
		background: rgba(15, 23, 42, 0.85);
		border: 1px solid rgba(148, 163, 184, 0.2);
		backdrop-filter: blur(18px);
	}

	.app__brand {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.app__mark {
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: linear-gradient(135deg, #38bdf8 0%, #4f46e5 100%);
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 20px;
	}

	.app__title {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.app__subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: rgba(226, 232, 240, 0.7);
	}

	.app__header-actions {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.app__header-link {
		padding: 10px 16px;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		font-size: 13px;
		font-weight: 600;
		background: rgba(15, 23, 42, 0.7);
	}

	.app__header-link--accent {
		background: linear-gradient(135deg, #38bdf8 0%, #4f46e5 100%);
		border-color: transparent;
		color: #0b1020;
	}

	.app__body {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr) 320px;
		gap: 28px;
	}

	.app__nav {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px;
		border-radius: 18px;
		background: rgba(15, 23, 42, 0.65);
		border: 1px solid rgba(148, 163, 184, 0.15);
		height: fit-content;
	}

	.app__nav-item {
		padding: 12px 14px;
		border-radius: 12px;
		font-weight: 600;
		font-size: 14px;
		color: rgba(226, 232, 240, 0.75);
		background: transparent;
	}

	.app__nav-item--active,
	.app__nav-item:hover {
		color: #0b1020;
		background: #38bdf8;
	}

	.app__main {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.app__section {
		padding: 16px 20px;
		border-radius: 18px;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.15);
	}

	.app__section-title {
		margin: 0;
		font-size: 18px;
	}

	.app__section-description {
		margin: 8px 0 0;
		font-size: 14px;
		color: rgba(226, 232, 240, 0.7);
	}

	.app__timeline {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.app__aside {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.app__card {
		padding: 18px 20px;
		border-radius: 18px;
		background: rgba(15, 23, 42, 0.7);
		border: 1px solid rgba(148, 163, 184, 0.2);
	}

	.app__card h2 {
		margin: 0 0 12px;
		font-size: 16px;
	}

	.app__card ul {
		margin: 0;
		padding-left: 18px;
		color: rgba(226, 232, 240, 0.7);
		font-size: 13px;
		line-height: 1.5;
	}

	@media (max-width: 1100px) {
		.app__body {
			grid-template-columns: 180px minmax(0, 1fr);
		}

		.app__aside {
			display: none;
		}
	}

	@media (max-width: 840px) {
		.app {
			padding: 20px;
		}

		.app__body {
			grid-template-columns: 1fr;
		}

		.app__nav {
			flex-direction: row;
			flex-wrap: wrap;
			justify-content: space-between;
		}
	}
</style>
