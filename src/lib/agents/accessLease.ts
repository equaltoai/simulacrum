import { browser } from '$app/environment';
import { requestAccounts, signTypedDataJson, type EthereumProvider } from '$lib/tips/provider';

export type StoredLeaseSessionKey = {
	publicKey: string;
	privateKeyPkcs8: string;
	createdAt: number;
};

export type StoredLeaseToken = {
	__typename: 'AgentAccessLeaseTokenPayload';
	leaseID: string;
	accessToken: string;
	tokenType: string;
	scope: string;
	createdAt: string;
	expiresIn: number;
};

const STORAGE_PREFIX = {
	sessionKey: 'simulacrum:agent_lease_session_key:',
	token: 'simulacrum:agent_lease_token:',
} as const;

function sessionKeyStorageKey(username: string, leaseID: string): string {
	return `${STORAGE_PREFIX.sessionKey}${username.trim().toLowerCase()}:${leaseID.trim()}`;
}

function tokenStorageKey(username: string, leaseID: string): string {
	return `${STORAGE_PREFIX.token}${username.trim().toLowerCase()}:${leaseID.trim()}`;
}

function leaseTokenExpiresAt(value: StoredLeaseToken): number | null {
	const createdAt = Date.parse(value.createdAt);
	if (!Number.isFinite(createdAt) || !Number.isFinite(value.expiresIn)) return null;
	return createdAt + value.expiresIn * 1000;
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
	const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let binary = '';
	for (const byte of data) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes.buffer.slice(0);
}

export function readStoredLeaseSessionKey(username: string, leaseID: string): StoredLeaseSessionKey | null {
	if (!browser) return null;

	const raw = sessionStorage.getItem(sessionKeyStorageKey(username, leaseID));
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as StoredLeaseSessionKey;
		if (!parsed?.publicKey || !parsed?.privateKeyPkcs8) return null;
		return parsed;
	} catch {
		sessionStorage.removeItem(sessionKeyStorageKey(username, leaseID));
		return null;
	}
}

export function writeStoredLeaseSessionKey(
	username: string,
	leaseID: string,
	value: StoredLeaseSessionKey
): void {
	if (!browser) return;
	sessionStorage.setItem(sessionKeyStorageKey(username, leaseID), JSON.stringify(value));
}

export function clearStoredLeaseSessionKey(username: string, leaseID: string): void {
	if (!browser) return;
	sessionStorage.removeItem(sessionKeyStorageKey(username, leaseID));
}

export async function generateStoredLeaseSessionKey(): Promise<StoredLeaseSessionKey> {
	if (!browser || !globalThis.crypto?.subtle) {
		throw new Error('Session keys require a modern browser with Web Crypto support.');
	}

	const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
	if (!('privateKey' in keyPair) || !('publicKey' in keyPair)) {
		throw new Error('Unable to generate an Ed25519 session key.');
	}

	const [publicKey, privateKeyPkcs8] = await Promise.all([
		crypto.subtle.exportKey('raw', keyPair.publicKey),
		crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
	]);

	return {
		publicKey: bytesToBase64(publicKey),
		privateKeyPkcs8: bytesToBase64(privateKeyPkcs8),
		createdAt: Date.now(),
	};
}

export async function signLeaseSessionMessage(
	sessionKey: StoredLeaseSessionKey,
	message: string
): Promise<string> {
	if (!browser || !globalThis.crypto?.subtle) {
		throw new Error('Session signing requires a modern browser with Web Crypto support.');
	}

	const privateKey = await crypto.subtle.importKey(
		'pkcs8',
		base64ToArrayBuffer(sessionKey.privateKeyPkcs8),
		'Ed25519',
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(message));
	return bytesToBase64(signature);
}

export async function signLeaseTypedDataWithWallet(
	provider: EthereumProvider,
	{
		address,
		typedDataJson,
	}: {
		address: `0x${string}`;
		typedDataJson: string;
	}
): Promise<`0x${string}`> {
	const [connected] = await requestAccounts(provider);
	if (!connected) {
		throw new Error('No wallet account selected.');
	}

	if (connected.toLowerCase() !== address.toLowerCase()) {
		throw new Error(`Switch the connected wallet to ${address} and try again.`);
	}

	return signTypedDataJson(provider, {
		address: connected,
		typedDataJson,
	});
}

export function readStoredLeaseToken(username: string, leaseID: string): StoredLeaseToken | null {
	if (!browser) return null;

	const storageKey = tokenStorageKey(username, leaseID);
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as StoredLeaseToken;
		if (!parsed?.accessToken || !parsed?.tokenType || !parsed?.leaseID) return null;
		if (parsed.leaseID.trim() !== leaseID.trim()) {
			sessionStorage.removeItem(storageKey);
			return null;
		}
		const expiresAt = leaseTokenExpiresAt(parsed);
		if (expiresAt !== null && expiresAt <= Date.now()) {
			sessionStorage.removeItem(storageKey);
			return null;
		}
		return {
			...parsed,
			__typename: 'AgentAccessLeaseTokenPayload',
		};
	} catch {
		sessionStorage.removeItem(storageKey);
		return null;
	}
}

export function writeStoredLeaseToken(username: string, leaseID: string, value: StoredLeaseToken): void {
	if (!browser) return;
	sessionStorage.setItem(
		tokenStorageKey(username, leaseID),
		JSON.stringify({
			...value,
			__typename: 'AgentAccessLeaseTokenPayload',
		} satisfies StoredLeaseToken)
	);
}

export function clearStoredLeaseToken(username: string, leaseID: string): void {
	if (!browser) return;
	sessionStorage.removeItem(tokenStorageKey(username, leaseID));
}
