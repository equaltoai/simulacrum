#!/usr/bin/env node
import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const TARGETS = {
	simulacrum: {
		app: 'simulacrum',
		baseDomain: 'simulacrum.greater.website',
		displayName: 'Simulacrum',
		profiles: {
			dev: 'Sim',
			staging: 'Sim',
		},
	},
	theory: {
		app: 'theory',
		baseDomain: 'theory.greater.website',
		displayName: 'Theory',
		profiles: {
			dev: 'Theory',
			staging: 'Theory',
			live: 'TheoryLive',
		},
		managedState: {
			live: {
				hostProfile: 'Lesser',
				hostRegion: 'us-east-1',
				hostStack: 'lesser-host-live',
				localStatePath: './.deploy/lesser-state/theory-live-state.json',
			},
		},
	},
};

const VALID_STAGES = new Set(['dev', 'staging', 'live']);
const VERIFY_PATHS = ['/l/', '/l/identity', '/auth/login'];

function usage() {
	return [
		'Usage:',
		'  pnpm run deploy -- --target <simulacrum|theory|all> --stage <dev|staging|live> [options]',
		'',
		'Common commands:',
		'  pnpm deploy:dev',
		'  pnpm run deploy -- --target theory --stage dev',
		'  pnpm deploy:theory:live',
		'',
		'Options:',
		'  --target <name>       Install target. Defaults to all for dev/staging.',
		'  --stage <stage>       Install stage. Defaults to dev.',
		'  --aws-profile <name>  Override AWS profile for a single target.',
		'  --state <path>        Override Lesser deployment receipt path for a single target.',
		'  --managed-host-profile <name>',
		'                        Override lesser-host AWS profile for managed live receipt lookup.',
		'  --lesser <path>       Lesser binary path. Defaults to ~/.local/bin/lesser, then PATH.',
		'  --dry-run             Print commands without installing; managed receipt lookup is read-only.',
		'  --skip-install        Skip pnpm install --frozen-lockfile.',
		'  --skip-check          Skip pnpm check.',
		'  --skip-build          Skip pnpm build and install current build artifacts.',
		'  --skip-verify         Skip post-install curl checks.',
		'  -h, --help            Show this help.',
		'',
		'Stage URL mapping:',
		'  dev      -> https://dev.<base-domain>',
		'  staging  -> https://staging.<base-domain>',
		'  live     -> https://<base-domain> (no dev prefix)',
		'',
	].join('\n');
}

function readArgValue(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return null;
	const value = args[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`Missing value for ${name}`);
	}
	return value;
}

function hasFlag(args, name) {
	return args.includes(name);
}

function shellQuote(value) {
	if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function commandLine(command, args) {
	return [command, ...args].map(shellQuote).join(' ');
}

function stageOrigin(stage, baseDomain) {
	if (stage === 'live') return `https://${baseDomain}`;
	return `https://${stage}.${baseDomain}`;
}

function resolveTargets(targetName, stage) {
	if (targetName === 'all') {
		if (stage === 'live') {
			throw new Error('Live deploys require an explicit single --target; refusing --target all.');
		}
		return Object.values(TARGETS);
	}
	const target = TARGETS[targetName];
	if (!target) {
		throw new Error(`Unknown target ${targetName}. Expected one of ${Object.keys(TARGETS).join(', ')}, all.`);
	}
	return [target];
}

async function existsExecutable(file) {
	try {
		await access(file, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function defaultLesserBinary() {
	const local = path.join(process.env.HOME ?? '', '.local/bin/lesser');
	if (process.env.HOME && (await existsExecutable(local))) return local;
	return 'lesser';
}

function run(command, args, { dryRun = false } = {}) {
	console.log(`$ ${commandLine(command, args)}`);
	if (dryRun) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: 'inherit' });
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

function runCapture(command, args, { dryRun = false, firstLines = 40 } = {}) {
	console.log(`$ ${commandLine(command, args)}`);
	if (dryRun) return Promise.resolve('');
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (stderr.trim()) process.stderr.write(stderr);
			const preview = stdout.split('\n').slice(0, firstLines).join('\n');
			if (preview.trim()) console.log(preview);
			if (code === 0) resolve(stdout);
			else reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

function parseJSON(stdout, label) {
	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error(`Failed to parse ${label} JSON: ${error.message}`);
	}
}

function stackOutput(outputs, key) {
	const match = outputs.find((output) => output.OutputKey === key);
	return match?.OutputValue ?? '';
}

function dynamoString(item, name) {
	return item?.[name]?.S ?? '';
}

function managedReceiptKey(slug, jobKind, jobId) {
	if (jobKind === 'update') return `managed/updates/${slug}/${jobId}/state.json`;
	if (jobKind === 'provisioning') return `managed/provisioning/${slug}/${jobId}/state.json`;
	throw new Error(`Unknown managed receipt job kind: ${jobKind}`);
}

function selectManagedReceiptJob(target, stage, instanceItem) {
	const slug = target.app;
	const lesserUpdateStatus = dynamoString(instanceItem, 'lesserUpdateStatus');
	const lesserUpdateJobId = dynamoString(instanceItem, 'lesserUpdateJobId');
	const provisionStatus = dynamoString(instanceItem, 'provisionStatus');
	const provisionJobId = dynamoString(instanceItem, 'provisionJobId');

	if (lesserUpdateStatus === 'ok' && lesserUpdateJobId) {
		return {
			kind: 'update',
			id: lesserUpdateJobId,
			key: managedReceiptKey(slug, 'update', lesserUpdateJobId),
		};
	}

	if (provisionStatus === 'ok' && provisionJobId) {
		return {
			kind: 'provisioning',
			id: provisionJobId,
			key: managedReceiptKey(slug, 'provisioning', provisionJobId),
		};
	}

	throw new Error(
		`Managed ${target.app} ${stage} has no successful lesser/provisioning receipt job in lesser-host state.`,
	);
}

function validateManagedReceipt(receipt, target, stage) {
	if (receipt.app !== target.app) {
		throw new Error(`Managed receipt app mismatch: got ${receipt.app}, expected ${target.app}.`);
	}
	if (receipt.base_domain !== target.baseDomain) {
		throw new Error(
			`Managed receipt base_domain mismatch: got ${receipt.base_domain}, expected ${target.baseDomain}.`,
		);
	}

	const stageReceipt = receipt.stages?.[stage];
	if (!stageReceipt) {
		throw new Error(`Managed receipt is missing stage "${stage}".`);
	}

	if (stage === 'live') {
		const stageNames = Object.keys(receipt.stages ?? {});
		const nonLiveStages = stageNames.filter((name) => name !== 'live');
		if (nonLiveStages.length) {
			throw new Error(`Refusing managed live receipt that also contains non-live stages: ${nonLiveStages.join(', ')}`);
		}

		const domain = String(stageReceipt.domain ?? '');
		const clientURL = String(stageReceipt.urls?.client ?? '');
		if (domain.startsWith('dev.') || clientURL.includes('://dev.')) {
			throw new Error(`Refusing managed live receipt with dev domain: ${domain || clientURL}`);
		}
	}

	const outputs = stageReceipt.stack_outputs ?? {};
	const requiredOutputs = [
		'ClientBucketName',
		'ClientArtifactBucketName',
		'ClientInstallManifestKey',
		'FrontendDistributionId',
	];
	const missing = requiredOutputs.filter((key) => !outputs[key]);
	if (missing.length) {
		throw new Error(`Managed receipt stage "${stage}" is missing required outputs: ${missing.join(', ')}`);
	}
}

async function resolveManagedStatePath(target, stage, options) {
	const managed = target.managedState?.[stage];
	if (!managed) return null;

	const hostProfile = options.managedHostProfileOverride ?? managed.hostProfile;
	const hostRegion = managed.hostRegion;
	const hostStack = managed.hostStack;
	const localStatePath = managed.localStatePath;

	console.log(
		`deploy-client: ${target.app} ${stage} uses lesser-host managed receipt state from ${hostStack} (${hostProfile})`,
	);

	const stackJSON = await runCapture(
		'aws',
		[
			'cloudformation',
			'describe-stacks',
			'--profile',
			hostProfile,
			'--region',
			hostRegion,
			'--stack-name',
			hostStack,
			'--output',
			'json',
		],
		{ firstLines: 0 },
	);
	const stack = parseJSON(stackJSON, 'lesser-host stack');
	const outputs = stack.Stacks?.[0]?.Outputs ?? [];
	const tableName = stackOutput(outputs, 'StateTableName');
	const artifactsBucket = stackOutput(outputs, 'ArtifactsBucketName');
	if (!tableName || !artifactsBucket) {
		throw new Error(`Could not resolve StateTableName/ArtifactsBucketName from ${hostStack}.`);
	}

	const instanceJSON = await runCapture(
		'aws',
		[
			'dynamodb',
			'get-item',
			'--profile',
			hostProfile,
			'--region',
			hostRegion,
			'--table-name',
			tableName,
			'--key',
			JSON.stringify({
				PK: { S: `INSTANCE#${target.app}` },
				SK: { S: 'METADATA' },
			}),
			'--projection-expression',
			'slug,#st,provisionStatus,provisionJobId,lesserUpdateStatus,lesserUpdateJobId,hostedAccountId,hostedBaseDomain,hostedRegion,lesserVersion',
			'--expression-attribute-names',
			JSON.stringify({ '#st': 'status' }),
			'--output',
			'json',
		],
		{ firstLines: 0 },
	);
	const instance = parseJSON(instanceJSON, 'lesser-host instance');
	if (!instance.Item) {
		throw new Error(`lesser-host ${hostStack} has no instance record for ${target.app}.`);
	}

	const hostedAccountId = dynamoString(instance.Item, 'hostedAccountId');
	const hostedBaseDomain = dynamoString(instance.Item, 'hostedBaseDomain');
	if (hostedBaseDomain && hostedBaseDomain !== target.baseDomain) {
		throw new Error(
			`lesser-host instance base domain mismatch: got ${hostedBaseDomain}, expected ${target.baseDomain}.`,
		);
	}

	const receiptJob = selectManagedReceiptJob(target, stage, instance.Item);
	const receiptURI = `s3://${artifactsBucket}/${receiptJob.key}`;
	const receiptJSON = await runCapture(
		'aws',
		['s3', 'cp', '--profile', hostProfile, '--region', hostRegion, receiptURI, '-'],
		{ firstLines: 0 },
	);
	const receipt = parseJSON(receiptJSON, 'managed Lesser receipt');
	validateManagedReceipt(receipt, target, stage);

	if (options.dryRun) {
		console.log(`deploy-client: dry-run resolved ${receiptURI}`);
		console.log(`deploy-client: dry-run would write managed receipt to ${localStatePath}`);
		return localStatePath;
	}

	const localPath = path.resolve(localStatePath);
	await mkdir(path.dirname(localPath), { recursive: true, mode: 0o700 });
	await writeFile(localPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
	try {
		await chmod(localPath, 0o600);
	} catch {
		// Best-effort on filesystems that do not support chmod.
	}

	console.log(
		`deploy-client: wrote managed ${target.app} ${stage} receipt (${receiptJob.kind} ${receiptJob.id}, account ${hostedAccountId || receipt.account_id}) to ${localStatePath}`,
	);
	return localStatePath;
}

async function assertBuildArtifacts({ dryRun }) {
	const required = [
		'build/server/handler.mjs',
		'build/server/client-manifest.json',
		'build/client/.vite/manifest.json',
		'facetheory.lesser.json',
	];
	for (const file of required) {
		console.log(`$ test -f ${shellQuote(file)}`);
		if (dryRun) continue;
		await access(file, constants.R_OK);
	}
}

async function main() {
	const args = process.argv.slice(2);
	if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
		console.log(usage());
		return;
	}

	const stage = readArgValue(args, '--stage') ?? 'dev';
	if (!VALID_STAGES.has(stage)) {
		throw new Error(`Invalid --stage ${stage}. Expected dev, staging, or live.`);
	}

	const targetName = readArgValue(args, '--target') ?? (stage === 'live' ? 'theory' : 'all');
	const targets = resolveTargets(targetName, stage);
	const awsProfileOverride = readArgValue(args, '--aws-profile');
	if (awsProfileOverride && targets.length !== 1) {
		throw new Error('--aws-profile override is only allowed with a single --target.');
	}
	const statePathOverride = readArgValue(args, '--state');
	if (statePathOverride && targets.length !== 1) {
		throw new Error('--state override is only allowed with a single --target.');
	}
	const managedHostProfileOverride = readArgValue(args, '--managed-host-profile');
	if (managedHostProfileOverride && targets.length !== 1) {
		throw new Error('--managed-host-profile override is only allowed with a single --target.');
	}

	const dryRun = hasFlag(args, '--dry-run');
	const skipInstall = hasFlag(args, '--skip-install');
	const skipCheck = hasFlag(args, '--skip-check');
	const skipBuild = hasFlag(args, '--skip-build');
	const skipVerify = hasFlag(args, '--skip-verify');
	const lesser = readArgValue(args, '--lesser') ?? (await defaultLesserBinary());

	console.log(`deploy-client: stage=${stage} target=${targetName} dryRun=${dryRun ? 'yes' : 'no'}`);
	if (stage === 'live') {
		console.log('deploy-client: live stage uses apex/base-domain URLs; dev.* domains are forbidden for live verification.');
	}

	if (!skipInstall) await run('pnpm', ['install', '--frozen-lockfile'], { dryRun });
	if (!skipCheck) await run('pnpm', ['check'], { dryRun });
	if (!skipBuild) await run('pnpm', ['build'], { dryRun });
	await assertBuildArtifacts({ dryRun });

	for (const target of targets) {
		const awsProfile = awsProfileOverride ?? target.profiles[stage];
		if (!awsProfile) {
			throw new Error(
				`No default AWS profile configured for ${target.app} ${stage}. Pass --aws-profile after documenting the target in docs/runbook.md.`,
			);
		}

		const manifest = `./facetheory.${target.app}.lesser.json`;
		const origin = stageOrigin(stage, target.baseDomain);
		const statePath =
			statePathOverride ??
			(await resolveManagedStatePath(target, stage, {
				dryRun,
				managedHostProfileOverride,
			}));
		if (stage === 'live' && origin.includes('://dev.')) {
			throw new Error(`Refusing live verification against dev domain: ${origin}`);
		}

		console.log(`\ndeploy-client: rendering manifest for ${target.app}`);
		await run(
			'node',
			[
				'scripts/render-install-manifest.mjs',
				'--app',
				target.app,
				'--display-name',
				target.displayName,
				'--out',
				manifest,
			],
			{ dryRun },
		);

		console.log(`\ndeploy-client: installing ${target.app} ${stage}`);
		const installArgs = [
			'client',
			'install',
			'--app',
			target.app,
			'--base-domain',
			target.baseDomain,
			'--aws-profile',
			awsProfile,
			'--stage',
			stage,
			'--config',
			manifest,
			'--skip-build',
		];
		if (statePath) installArgs.push('--state', statePath);
		await run(lesser, installArgs, { dryRun });

		if (!skipVerify) {
			console.log(`\ndeploy-client: verifying ${target.app} ${stage} at ${origin}`);
			for (const verifyPath of VERIFY_PATHS) {
				await runCapture('curl', ['-i', '-sS', '-f', `${origin}${verifyPath}`], { dryRun });
			}
		}
	}

	console.log('\ndeploy-client: complete');
}

main().catch((error) => {
	console.error(`deploy-client: ${error.message}`);
	process.exit(1);
});
