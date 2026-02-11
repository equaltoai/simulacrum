import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

function strip0x(hex: string): string {
	return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

function with0x(hex: string): `0x${string}` {
	return (hex.startsWith('0x') || hex.startsWith('0X') ? hex : `0x${hex}`) as `0x${string}`;
}

export function normalizeDomain(domain: string): string {
	return domain.trim().replace(/\.$/, '').toLowerCase();
}

export function keccak256Utf8(input: string): `0x${string}` {
	const bytes = utf8ToBytes(input);
	const digest = keccak_256(bytes);
	return with0x(bytesToHex(digest));
}

export function hostIdFromDomain(domain: string): `0x${string}` {
	return keccak256Utf8(normalizeDomain(domain));
}

export function isHexBytes32(value: string | null | undefined): value is `0x${string}` {
	if (!value) return false;
	const normalized = strip0x(value);
	return normalized.length === 64 && /^[0-9a-fA-F]+$/.test(normalized);
}

export function isHexAddress(value: string | null | undefined): value is `0x${string}` {
	if (!value) return false;
	const normalized = strip0x(value);
	return normalized.length === 40 && /^[0-9a-fA-F]+$/.test(normalized);
}

function leftPadTo(bytes: Uint8Array, length: number): Uint8Array {
	if (bytes.length > length) {
		throw new Error(`Value is ${bytes.length} bytes; expected <= ${length}`);
	}
	if (bytes.length === length) return bytes;
	const out = new Uint8Array(length);
	out.set(bytes, length - bytes.length);
	return out;
}

function bytes32HexToBytes(value: `0x${string}`): Uint8Array {
	const raw = strip0x(value);
	if (raw.length !== 64) throw new Error('Expected bytes32 hex string');
	return hexToBytes(raw);
}

function addressHexToBytes(value: `0x${string}`): Uint8Array {
	const raw = strip0x(value);
	if (raw.length !== 40) throw new Error('Expected address hex string');
	return hexToBytes(raw);
}

function selector(signature: string): Uint8Array {
	const digest = keccak_256(utf8ToBytes(signature));
	return digest.slice(0, 4);
}

function concatBytes(parts: ReadonlyArray<Uint8Array>): Uint8Array {
	const total = parts.reduce((acc, part) => acc + part.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

export function encodeTipEthCallData({
	hostId,
	actor,
	contentHash,
}: {
	hostId: `0x${string}`;
	actor: `0x${string}`;
	contentHash: `0x${string}`;
}): `0x${string}` {
	if (!isHexBytes32(hostId)) throw new Error('Invalid hostId (expected bytes32 hex)');
	if (!isHexAddress(actor)) throw new Error('Invalid actor address');
	if (!isHexBytes32(contentHash)) throw new Error('Invalid contentHash (expected bytes32 hex)');

	const fnSelector = selector('tipETH(bytes32,address,bytes32)');
	const hostIdBytes = bytes32HexToBytes(hostId);
	const actorBytes = leftPadTo(addressHexToBytes(actor), 32);
	const contentHashBytes = bytes32HexToBytes(contentHash);

	const data = concatBytes([fnSelector, hostIdBytes, actorBytes, contentHashBytes]);
	return with0x(bytesToHex(data));
}

export function parseEtherToWei(input: string): bigint {
	const value = input.trim();
	if (value === '') throw new Error('Amount is required');
	if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid amount format');

	const [whole, frac = ''] = value.split('.');
	if (frac.length > 18) throw new Error('Too many decimal places (max 18)');
	const fracPadded = frac.padEnd(18, '0');

	const wholeWei = BigInt(whole) * 10n ** 18n;
	const fracWei = BigInt(fracPadded);
	return wholeWei + fracWei;
}

export function toHexQuantity(value: bigint): `0x${string}` {
	if (value < 0n) throw new Error('Quantity must be non-negative');
	return with0x(value.toString(16) || '0');
}
