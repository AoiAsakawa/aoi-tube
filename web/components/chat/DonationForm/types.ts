// Shared types for the donation form (crypto wallets and payment providers).
import { ScreenEffectType } from '../../../interfaces/donation.model';

// What the viewer is purchasing: a superchat message, a screen effect, or a
// coin top-up (charging the prepaid wallet).
export type DonationItemType = 'superchat' | 'effect' | 'coin';

// The itemType/effectType fields sent with every payment creation request.
// Superchats and coin top-ups never include an effectType.
export type PurchaseItem =
	| { itemType: 'superchat' }
	| { itemType: 'effect'; effectType: ScreenEffectType }
	| { itemType: 'coin' };

export interface MetamaskConfig {
	enabled: boolean;
	walletAddress: string;
	bitcoinAddress?: string; // Destination address for Bitcoin donations
	networkId: number;
	networkName: string;
	chainCurrency: string;
	useCustomToken: boolean;
	tokenAddress: string;
	tokenSymbol: string;
	tokenDecimals: number;
	coinGeckoId: string;
	showJpyPrice: boolean;
}

export interface NetworkOption {
	id: number;
	name: string;
	currency: string;
	coinGeckoId: string;
	hexChainId: string;
	rpcUrl: string;
	blockExplorerUrl?: string;
	isNonEvm?: boolean; // For Bitcoin, Solana etc.
	chainType?: 'evm' | 'bitcoin' | 'solana';
}

export interface TokenOption {
	symbol: string;
	name: string;
	decimals: number;
	coinGeckoId: string;
	address: string;
	balance?: string; // User's balance
}

export interface EthereumProvider {
	isMetaMask?: boolean;
	isTrust?: boolean;
	isTrustWallet?: boolean;
	request: (args: {
		method: string;
		params?: unknown[] | Record<string, unknown>;
	}) => Promise<unknown>;
	on: (event: string, callback: (...args: unknown[]) => void) => void;
	removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
}

// Solana Provider interface for Phantom / Trust Wallet
export interface SolanaProvider {
	isPhantom?: boolean;
	isTrust?: boolean;
	publicKey?: { toString: () => string };
	connect: () => Promise<{ publicKey: { toString: () => string } }>;
	disconnect: () => Promise<void>;
	signTransaction?: (transaction: unknown) => Promise<unknown>;
	signAndSendTransaction?: (transaction: unknown) => Promise<{ signature: string }>;
}

declare global {
	interface Window {
		ethereum?: EthereumProvider;
		solana?: SolanaProvider;
		trustwallet?: {
			solana?: SolanaProvider;
		};
	}
}

export interface DoneruConfig {
	enabled: boolean;
	creatorUrl: string;
	displayName: string;
}

export interface KofiConfig {
	enabled: boolean;
	pageUrl: string;
	displayName: string;
}

export interface PayPalConfig {
	enabled: boolean;
	currencyCode: string;
	isSandbox: boolean;
}

export interface StripeConfig {
	enabled: boolean;
	currencyCode: string;
	isTestMode: boolean;
	publishableKey: string;
}
