// MetaMask's native Solana support, reached through the Wallet Standard.
//
// This replaces the Solflare Solana Snap for MetaMask users: that snap keeps an
// origin allowlist and rejects unlisted sites with "Invalid origin (-32603)",
// so it could never work on a self-hosted deployment. `createSolanaClient()`
// registers MetaMask with the Wallet Standard registry, after which the wallet
// exposes the standard connect / signAndSendTransaction features.
import { base58 } from '@scure/base';
import type { Wallet, WalletAccount } from '@wallet-standard/base';

// CAIP-2 identifier for Solana mainnet. The MetaMask docs' examples use devnet
// (solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1); sending mainnet funds with that
// chain id would target the wrong cluster.
export const SOLANA_MAINNET_CHAIN = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const CONNECT_FEATURE = 'standard:connect';
const SIGN_AND_SEND_FEATURE = 'solana:signAndSendTransaction';

// Minimal shapes of the two Wallet Standard features we use. Typed locally so
// this module doesn't depend on @solana/wallet-standard-features at runtime.
type ConnectFeature = {
	connect: () => Promise<{ accounts: readonly WalletAccount[] }>;
};

type SignAndSendFeature = {
	supportedTransactionVersions?: readonly ('legacy' | 0)[];
	signAndSendTransaction: (
		...inputs: readonly {
			account: WalletAccount;
			transaction: Uint8Array;
			chain: string;
		}[]
	) => Promise<readonly { signature: Uint8Array }[]>;
};

export type MetaMaskSolanaSession = {
	wallet: Wallet;
	account: WalletAccount;
};

const getFeature = <T>(wallet: Wallet, name: string): T | undefined =>
	(wallet.features as Record<string, unknown>)[name] as T | undefined;

// Connect to MetaMask's Solana account and return the session needed to sign.
// Throws when MetaMask is missing the feature (e.g. an older version without
// native Solana), so the caller can fall back to another provider.
export const connectMetaMaskSolana = async (): Promise<MetaMaskSolanaSession> => {
	const { createSolanaClient } = await import('@metamask/connect-solana');
	const client = await createSolanaClient({
		dapp: { name: 'AoiTube', url: window.location.origin },
		// Point at the same-origin proxy: the public node 403s browser requests.
		api: { supportedNetworks: { mainnet: `${window.location.origin}/api/solana/rpc` } },
	});

	const wallet = client.getWallet();
	const connect = getFeature<ConnectFeature>(wallet, CONNECT_FEATURE);
	if (!connect) {
		throw new Error('MetaMask does not expose the Wallet Standard connect feature');
	}

	const { accounts } = await connect.connect();
	const account = accounts[0];
	if (!account) {
		throw new Error('MetaMask returned no Solana account');
	}
	return { wallet, account };
};

// Reports whether the connected wallet can sign the given transaction version.
// A `legacy` transaction is what the donation form builds today.
export const supportsLegacyTransactions = (wallet: Wallet): boolean => {
	const feature = getFeature<SignAndSendFeature>(wallet, SIGN_AND_SEND_FEATURE);
	if (!feature) {
		return false;
	}
	// An absent list means the wallet didn't advertise; assume legacy works.
	return !feature.supportedTransactionVersions || feature.supportedTransactionVersions.includes('legacy');
};

// Sign and broadcast a serialized transaction, returning the base58 signature.
//
// The Wallet Standard returns the signature as raw bytes, but the server (and
// every Solana explorer) identifies a transaction by its base58 string — the
// on-chain verification in controllers/solanaVerify.go looks up exactly that.
// Encoding here is what makes the two ends agree.
export const signAndSendWithMetaMask = async (
	session: MetaMaskSolanaSession,
	serializedTransaction: Uint8Array,
): Promise<string> => {
	const feature = getFeature<SignAndSendFeature>(session.wallet, SIGN_AND_SEND_FEATURE);
	if (!feature) {
		throw new Error('MetaMask does not expose solana:signAndSendTransaction');
	}

	const [result] = await feature.signAndSendTransaction({
		account: session.account,
		transaction: serializedTransaction,
		chain: SOLANA_MAINNET_CHAIN,
	});
	if (!result?.signature) {
		throw new Error('MetaMask returned no transaction signature');
	}
	return base58.encode(result.signature);
};
