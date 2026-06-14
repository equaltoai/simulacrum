import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(relativePath) {
	return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('M7.4 Sim consumes Greater hosted soul-bootstrap facade as the default API lane', async () => {
	const apiSource = await source('../../../src/lib/api/soulBootstrap.ts');
	assert.match(apiSource, /createHostedSoulBootstrapClient/);
	assert.match(apiSource, /createProject44HostedSoulBootstrapClient/);
	assert.match(apiSource, /fetchSoulBootstrapSurface[\s\S]+createProject44HostedSoulBootstrapClient/);
	assert.match(apiSource, /startHostedSoulBootstrap/);
	assert.match(apiSource, /sendHostedSoulGenesisMessage/);
	assert.match(apiSource, /completeHostedSoulGenesis/);
	assert.match(apiSource, /publishHostedSoul/);
	assert.match(apiSource, /restartSoulBootstrap/);
	assert.match(apiSource, /never asks the browser for wallets/);
	assert.doesNotMatch(apiSource, /hostToken|hostBaseUrl|instanceKey|lesserHostToken|walletAddress:\s*normalize/i);
});

test('M7.4 hosted default panel has no wallet provider or signing imports', async () => {
	const panelSource = await source('../../../src/facetheory/components/HostedSoulBootstrapPanel.svelte');
	assert.match(panelSource, /hosted\/off-chain soul definition/i);
	assert.match(panelSource, /data-testid="hosted-soul-default-action"/);
	assert.match(panelSource, /Start Hosted Definition/);
	assert.match(panelSource, /Publish Hosted Soul/);
	assert.match(panelSource, /Mutable\/revocable/);
	assert.doesNotMatch(panelSource, /getInjectedProvider|personalSign|requestAccounts|eth_requestAccounts|window\.ethereum/);
	assert.doesNotMatch(panelSource, /beginSoulBootstrap|verifySoulBootstrapWallet|verifySoulBootstrapPrincipalDeclaration|finalizeSoulBootstrap/);
	assert.doesNotMatch(panelSource, /walletAddress|principalSignature|boundarySignaturesJson|selfAttestation/);
	assert.doesNotMatch(panelSource, /hostToken|hostBaseUrl|instanceKey|lesserHostToken|soulWorkflowHost/);
});

test('M7.4 vendored Greater hosted facade guards browser Host config and wallet-era inputs', async () => {
	const hostedAdapterSource = await source('../../../src/lib/greater/adapters/soul/hostedBootstrap.ts');
	assert.match(hostedAdapterSource, /StartHostedSoulBootstrapDocument/);
	assert.match(hostedAdapterSource, /SendHostedSoulGenesisMessageDocument/);
	assert.match(hostedAdapterSource, /CompleteHostedSoulGenesisDocument/);
	assert.match(hostedAdapterSource, /PublishHostedSoulDocument/);
	assert.match(hostedAdapterSource, /RestartSoulBootstrapDocument/);
	assert.match(hostedAdapterSource, /DISALLOWED_BROWSER_HOST_CONFIG_KEYS/);
	assert.match(hostedAdapterSource, /DISALLOWED_HOSTED_INPUT_KEYS/);
	assert.match(hostedAdapterSource, /walletAddress/);
	assert.match(hostedAdapterSource, /hostToken/);
	assert.match(hostedAdapterSource, /instanceKey/);
});
