import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function usage() {
	return [
		'Usage:',
		'  node scripts/write-lesser-receipt.mjs \\',
		'    --app <slug> \\',
		'    --base-domain <example.com> \\',
		'    --aws-profile <profile> \\',
		'    --region <aws-region> \\',
		'    --stage <dev|staging|live> \\',
		'    --stack-name <cloudformation-stack> \\',
		'    [--out <path>]',
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

function defaultReceiptPath(app, baseDomain) {
	return path.join(os.homedir(), '.lesser', app, baseDomain, 'state.json');
}

async function awsCli(argv, { profile, region }) {
	const globalArgs = [];
	if (profile) {
		globalArgs.push('--profile', profile);
	}
	if (region) {
		globalArgs.push('--region', region);
	}

	const { stdout } = await execFileAsync('aws', [...globalArgs, ...argv], {
		env: { ...process.env, AWS_PROFILE: profile ?? process.env.AWS_PROFILE ?? '' },
		maxBuffer: 10 * 1024 * 1024,
	});
	return stdout.trim();
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log(usage());
	process.exit(0);
}

const app = readArgValue(args, '--app');
const baseDomain = readArgValue(args, '--base-domain');
const awsProfile = readArgValue(args, '--aws-profile');
const region =
	readArgValue(args, '--region') ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const stage = readArgValue(args, '--stage') ?? 'dev';
const stackName = readArgValue(args, '--stack-name');
const outPath = readArgValue(args, '--out') ?? (app && baseDomain ? defaultReceiptPath(app, baseDomain) : null);

if (!app || !baseDomain || !awsProfile || !stackName || !outPath) {
	console.error(usage());
	process.exit(1);
}

const accountId = await awsCli(['sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'], {
	profile: awsProfile,
	region,
});

const outputsRaw = await awsCli(
	['cloudformation', 'describe-stacks', '--stack-name', stackName, '--query', 'Stacks[0].Outputs', '--output', 'json'],
	{ profile: awsProfile, region }
);
const outputs = JSON.parse(outputsRaw);

const stackOutputs = Object.fromEntries(
	(outputs ?? [])
		.map((entry) => [String(entry?.OutputKey ?? ''), String(entry?.OutputValue ?? '')])
		.filter(([key, value]) => key && value)
);

if (!stackOutputs.FrontendDistributionId) {
	throw new Error(`Missing FrontendDistributionId in stack outputs for ${stackName}`);
}

const receipt = {
	version: 1,
	app,
	base_domain: baseDomain,
	aws_profile: awsProfile,
	account_id: accountId,
	region,
	stages: {
		[stage]: {
			stage,
			stack_outputs: {
				ClientBucketName: stackOutputs.ClientBucketName ?? '',
				FrontendDistributionId: stackOutputs.FrontendDistributionId,
			},
		},
	},
};

await mkdir(path.dirname(outPath), { recursive: true, mode: 0o700 });
await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`write-lesser-receipt: wrote ${outPath}`);

