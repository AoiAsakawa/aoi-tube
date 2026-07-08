// Bitcoin helpers for the donation form: extended-key conversion, Native
// SegWit (P2WPKH) address derivation, and balance lookup via mempool.space.
import * as bitcoin from 'bitcoinjs-lib';
import { HDKey } from '@scure/bip32';
import { base58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { MEMPOOL_API } from './constants';

// Extended key version bytes for conversion
const XPUB_VERSION = 0x0488b21e; // BIP32 mainnet public (xpub)
const ZPUB_VERSION = 0x04b24746; // BIP84 mainnet public (zpub) - Native SegWit

// Convert zpub to xpub format for compatibility
export const convertToXpub = (extendedKey: string): string => {
	try {
		const decoded = base58check(sha256).decode(extendedKey);
		const version = (decoded[0] << 24) | (decoded[1] << 16) | (decoded[2] << 8) | decoded[3];

		if (version === XPUB_VERSION) return extendedKey;

		if (version === ZPUB_VERSION) {
			const newData = new Uint8Array(decoded.length);
			newData.set(decoded);
			newData[0] = (XPUB_VERSION >> 24) & 0xff;
			newData[1] = (XPUB_VERSION >> 16) & 0xff;
			newData[2] = (XPUB_VERSION >> 8) & 0xff;
			newData[3] = XPUB_VERSION & 0xff;
			return base58check(sha256).encode(newData);
		}
		return extendedKey;
	} catch {
		return extendedKey;
	}
};

// Derive Bitcoin address and public key from xpub for Native SegWit (P2WPKH)
// chain: 0 = receive addresses, 1 = change addresses
export const deriveFromXpub = (
	extendedKey: string,
	index: number = 0,
	chain: number = 0,
): { address: string; pubkey: Buffer } => {
	const xpub = convertToXpub(extendedKey);
	const node = HDKey.fromExtendedKey(xpub);
	const child = node.derive(`m/${chain}/${index}`);
	if (!child.publicKey) {
		throw new Error('公開鍵の導出に失敗しました');
	}
	const pubkey = Buffer.from(child.publicKey);
	const { address } = bitcoin.payments.p2wpkh({
		pubkey,
		network: bitcoin.networks.bitcoin,
	});
	return { address: address || '', pubkey };
};

// Legacy function for address only
export const deriveAddressFromXpub = (extendedKey: string, index: number = 0): string =>
	deriveFromXpub(extendedKey, index).address;

// Find Bitcoin address with balance from xpub (try multiple indices).
// Change addresses (m/1/x) are marked with index >= 100.
export const findAddressWithBalance = async (
	extendedKey: string,
): Promise<{ address: string; index: number } | null> => {
	// Try first 10 receive addresses
	for (let index = 0; index < 10; index++) {
		const address = deriveAddressFromXpub(extendedKey, index);

		try {
			 
			const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
			if (response.ok) {
				 
				const utxos = (await response.json()) as Array<{ value: number }>;
				if (utxos.length > 0) {
					return { address, index };
				}
			}
		} catch {
			// Failed to check address, continue to next
		}
	}

	// Also check change addresses (m/1/index)
	for (let index = 0; index < 10; index++) {
		try {
			const { address } = deriveFromXpub(extendedKey, index, 1);
			if (!address) continue;

			 
			const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
			if (response.ok) {
				 
				const utxos = (await response.json()) as Array<{ value: number }>;
				if (utxos.length > 0) {
					return { address, index: 100 + index }; // Mark as change address
				}
			}
		} catch {
			// Failed to check change address, continue to next
		}
	}

	return null;
};
