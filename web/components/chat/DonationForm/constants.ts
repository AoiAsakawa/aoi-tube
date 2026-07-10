// Static configuration for the donation form: supported networks/tokens,
// preset amounts, provider endpoints, and fiat currency symbols.
import { NetworkOption, TokenOption } from './types';

// Bitcoin Snap ID (btcsnap supports btc_signPsbt)
export const LEGACY_BITCOIN_SNAP_ID = 'npm:btcsnap';

// Solana Snap ID
export const SOLANA_SNAP_ID = 'npm:@solflare-wallet/solana-snap';

// SPL Token / Associated Token Account program IDs (https://spl.solana.com/token)
export const SOLANA_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOLANA_ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

// Mempool.space API endpoint
export const MEMPOOL_API = 'https://mempool.space/api';

// Solana RPC endpoint — always the same-origin proxy, never the chain directly.
// Solana's public node answers browser-origin requests with HTTP 403 ("Access
// forbidden"), and a private node's URL carries an API key that must stay
// server-side. The server forwards only the JSON-RPC methods this form needs
// (see controllers/solanaRPC.go). @solana/web3.js requires an absolute URL.
export const SOLANA_RPC =
	typeof window === 'undefined'
		? 'http://localhost/api/solana/rpc'
		: `${window.location.origin}/api/solana/rpc`;

// Safety margin added on top of a screen effect's JPY price when it is paid
// in crypto. The server verifies the on-chain amount converts to at least 95%
// of the effect price, so +2% absorbs market movement between quoting the
// amount here and the server-side confirmation.
export const EFFECT_CRYPTO_MARGIN_PERCENT = 2;

// Standard JPY tier buttons shared by every JPY provider (PayPay, PayPal,
// Stripe) and the crypto JPY input mode.
export const PRESET_AMOUNTS_JPY_TIERS = [300, 500, 1000, 3000, 5000, 10000];
export const PRESET_AMOUNTS_VBC = [100, 500, 1000, 5000, 10000]; // VBC/VBCG/VBCAT
export const PRESET_AMOUNTS_CRYPTO = [0.1, 0.5, 1, 5, 10]; // For AVAX, etc.
export const PRESET_AMOUNTS_BNB = [0.01, 0.05, 0.1, 0.5, 1]; // For BNB
export const PRESET_AMOUNTS_ETH = [0.005, 0.01, 0.05, 0.1]; // For ETH (higher value)
export const PRESET_AMOUNTS_STABLECOIN = [1, 5, 10, 50, 100];
export const PRESET_AMOUNTS_BTC = [0.0001, 0.0005, 0.001, 0.005]; // For Bitcoin (minimum 0.0001 due to fees)
export const PRESET_AMOUNTS_ALTCOIN = [1, 5, 10, 50, 100]; // For SEI, JOE, PNG, ARB, MAGIC, POL, CAKE, OP

// Currency display symbols for fiat providers (PayPal / Stripe supported currencies)
const CURRENCY_SYMBOLS: Record<string, string> = {
	USD: '$',
	EUR: '€',
	GBP: '£',
	JPY: '¥',
	CAD: 'CA$',
	AUD: 'A$',
	CNY: 'CN¥',
	HKD: 'HK$',
	SGD: 'S$',
	TWD: 'NT$',
	KRW: '₩',
	THB: '฿',
	PHP: '₱',
	MYR: 'RM ',
	INR: '₹',
	BRL: 'R$',
	MXN: 'MX$',
	CHF: 'CHF ',
	SEK: 'kr ',
	NOK: 'kr ',
	DKK: 'kr ',
	PLN: 'zł ',
	CZK: 'Kč ',
	NZD: 'NZ$',
};

export const getFiatSymbol = (currencyCode?: string): string => {
	const code = currencyCode || 'USD';
	return CURRENCY_SYMBOLS[code] ?? `${code} `;
};

// ERC-20 transfer function signature
export const ERC20_TRANSFER_ABI = '0xa9059cbb';

// ERC-20 balanceOf function signature
export const ERC20_BALANCE_OF_ABI = '0x70a08231';

// Available networks for user selection (MetaMask default networks)
// RPC URLs based on MetaMask's default Infura endpoints
export const AVAILABLE_NETWORKS: NetworkOption[] = [
	// EVM chains (MetaMask defaults)
	{
		id: 1,
		name: 'Ethereum Mainnet',
		currency: 'ETH',
		coinGeckoId: 'ethereum',
		hexChainId: '0x1',
		rpcUrl: 'https://eth.llamarpc.com',
		blockExplorerUrl: 'https://etherscan.io',
		chainType: 'evm',
	},
	// Non-EVM chains (supported via MetaMask multichain)
	{
		id: 0,
		name: 'Bitcoin',
		currency: 'BTC',
		coinGeckoId: 'bitcoin',
		hexChainId: 'bip122:000000000019d6689c085ae165831e93',
		rpcUrl: '',
		blockExplorerUrl: 'https://mempool.space',
		isNonEvm: true,
		chainType: 'bitcoin',
	},
	// Solana (non-EVM)
	{
		id: -1,
		name: 'Solana',
		currency: 'SOL',
		coinGeckoId: 'solana',
		hexChainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
		rpcUrl: 'https://api.mainnet-beta.solana.com',
		blockExplorerUrl: 'https://solscan.io',
		isNonEvm: true,
		chainType: 'solana',
	},
	// Custom network (not MetaMask default)
	{
		id: 329,
		name: 'VirBiCoin',
		currency: 'VBC',
		// Pseudo coin ID served by the backend's Coinpaprika tier (vbc-virbicoin).
		coinGeckoId: 'virbicoin',
		hexChainId: '0x149',
		rpcUrl: 'https://rpc.digitalregion.jp',
		blockExplorerUrl: 'https://explorer.digitalregion.jp',
		chainType: 'evm',
	},
	// MetaMask default networks (names must match exactly)
	{
		id: 137,
		name: 'Polygon Mainnet',
		currency: 'POL',
		coinGeckoId: 'polygon-ecosystem-token',
		hexChainId: '0x89',
		rpcUrl: 'https://polygon-rpc.com',
		blockExplorerUrl: 'https://polygonscan.com',
		chainType: 'evm',
	},
	{
		id: 56,
		name: 'BNB Smart Chain Mainnet',
		currency: 'BNB',
		coinGeckoId: 'binancecoin',
		hexChainId: '0x38',
		rpcUrl: 'https://bsc-dataseed1.bnbchain.org',
		blockExplorerUrl: 'https://bscscan.com',
		chainType: 'evm',
	},
	{
		id: 42161,
		name: 'Arbitrum One',
		currency: 'ETH',
		coinGeckoId: 'ethereum',
		hexChainId: '0xa4b1',
		rpcUrl: 'https://arb1.arbitrum.io/rpc',
		blockExplorerUrl: 'https://arbiscan.io',
		chainType: 'evm',
	},
	{
		id: 10,
		name: 'OP Mainnet',
		currency: 'ETH',
		coinGeckoId: 'ethereum',
		hexChainId: '0xa',
		rpcUrl: 'https://mainnet.optimism.io',
		blockExplorerUrl: 'https://optimistic.etherscan.io',
		chainType: 'evm',
	},
	{
		id: 8453,
		name: 'Base',
		currency: 'ETH',
		coinGeckoId: 'ethereum',
		hexChainId: '0x2105',
		rpcUrl: 'https://mainnet.base.org',
		blockExplorerUrl: 'https://basescan.org',
		chainType: 'evm',
	},
	{
		id: 43114,
		name: 'Avalanche C-Chain',
		currency: 'AVAX',
		coinGeckoId: 'avalanche-2',
		hexChainId: '0xa86a',
		rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
		blockExplorerUrl: 'https://snowtrace.io',
		chainType: 'evm',
	},
	{
		id: 59144,
		name: 'Linea',
		currency: 'ETH',
		coinGeckoId: 'ethereum',
		hexChainId: '0xe708',
		rpcUrl: 'https://rpc.linea.build',
		blockExplorerUrl: 'https://lineascan.build',
		chainType: 'evm',
	},
	// MetaMask default network
	{
		id: 1329,
		name: 'Sei Network',
		currency: 'SEI',
		coinGeckoId: 'sei-network',
		hexChainId: '0x531',
		rpcUrl: 'https://evm-rpc.sei-apis.com',
		blockExplorerUrl: 'https://seitrace.com',
		chainType: 'evm',
	},
];

// Available tokens per network
export const AVAILABLE_TOKENS: Record<number, TokenOption[]> = {
	0: [
		// Bitcoin (Native SegWit)
		{ symbol: 'BTC', name: 'Bitcoin', decimals: 8, coinGeckoId: 'bitcoin', address: '' },
	],
	[-1]: [
		// Solana
		{ symbol: 'SOL', name: 'Solana', decimals: 9, coinGeckoId: 'solana', address: '' },
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
		},
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
		},
	],
	329: [
		// VirBiCoin
		// coinGeckoId is a pseudo ID served by the backend's Coinpaprika tier.
		{ symbol: 'VBC', name: 'VirBiCoin', decimals: 18, coinGeckoId: 'virbicoin', address: '' },
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 18,
			coinGeckoId: 'tether',
			address: '0xdf136683B118E95c04A61FEC091c65736d9de059',
		},
		{
			symbol: 'VBCG',
			name: 'VBCG',
			decimals: 18,
			coinGeckoId: '',
			address: '0xac7F60af25C5c4E23d1008C46511e265A8c9B6cF',
		},
		{
			symbol: 'VBCAT',
			name: 'VBCAT',
			decimals: 18,
			coinGeckoId: '',
			address: '0xd1fedc9002660b48aee579ce2aff8bdffb8c8d32',
		},
	],
	1: [
		// Ethereum
		{ symbol: 'ETH', name: 'Ethereum', decimals: 18, coinGeckoId: 'ethereum', address: '' },
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
		},
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
		},
		{
			symbol: 'DAI',
			name: 'Dai Stablecoin',
			decimals: 18,
			coinGeckoId: 'dai',
			address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
		},
	],
	137: [
		// Polygon
		{
			symbol: 'POL',
			name: 'Polygon',
			decimals: 18,
			coinGeckoId: 'polygon-ecosystem-token',
			address: '',
		},
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
		},
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
		},
		{
			symbol: 'QUICK',
			name: 'QuickSwap',
			decimals: 18,
			coinGeckoId: 'quickswap',
			address: '0xB5C064F955D8e7F38fE0460C556a72987494eE17',
		},
	],
	56: [
		// BNB Chain
		{ symbol: 'BNB', name: 'BNB', decimals: 18, coinGeckoId: 'binancecoin', address: '' },
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 18,
			coinGeckoId: 'tether',
			address: '0x55d398326f99059fF775485246999027B3197955',
		},
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 18,
			coinGeckoId: 'usd-coin',
			address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
		},
		{
			symbol: 'CAKE',
			name: 'PancakeSwap',
			decimals: 18,
			coinGeckoId: 'pancakeswap-token',
			address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
		},
	],
	42161: [
		// Arbitrum One
		{ symbol: 'ETH', name: 'Ethereum', decimals: 18, coinGeckoId: 'ethereum', address: '' },
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		},
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		},
		{
			symbol: 'ARB',
			name: 'Arbitrum',
			decimals: 18,
			coinGeckoId: 'arbitrum',
			address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
		},
		{
			symbol: 'GMX',
			name: 'GMX',
			decimals: 18,
			coinGeckoId: 'gmx',
			address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
		},
		{
			symbol: 'MAGIC',
			name: 'Magic',
			decimals: 18,
			coinGeckoId: 'magic',
			address: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
		},
	],
	10: [
		// Optimism
		{ symbol: 'ETH', name: 'Ethereum', decimals: 18, coinGeckoId: 'ethereum', address: '' },
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
		},
		{
			symbol: 'OP',
			name: 'Optimism',
			decimals: 18,
			coinGeckoId: 'optimism',
			address: '0x4200000000000000000000000000000000000042',
		},
	],
	8453: [
		// Base
		{ symbol: 'ETH', name: 'Ethereum', decimals: 18, coinGeckoId: 'ethereum', address: '' },
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		},
	],
	43114: [
		// Avalanche
		{ symbol: 'AVAX', name: 'Avalanche', decimals: 18, coinGeckoId: 'avalanche-2', address: '' },
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
		},
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
		},
		{
			symbol: 'JOE',
			name: 'Trader Joe',
			decimals: 18,
			coinGeckoId: 'joe',
			address: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd',
		},
		{
			symbol: 'PNG',
			name: 'Pangolin',
			decimals: 18,
			coinGeckoId: 'pangolin',
			address: '0x60781C2586D68229fde47564546784ab3fACA982',
		},
	],
	59144: [
		// Linea
		{ symbol: 'ETH', name: 'Ethereum', decimals: 18, coinGeckoId: 'ethereum', address: '' },
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
		},
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
		},
	],
	1329: [
		// Sei
		{ symbol: 'SEI', name: 'Sei', decimals: 18, coinGeckoId: 'sei-network', address: '' },
		{
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6,
			coinGeckoId: 'usd-coin',
			address: '0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1',
		},
		{
			symbol: 'USDT',
			name: 'Tether',
			decimals: 6,
			coinGeckoId: 'tether',
			address: '0xB75D0B03c06A926e488e2659DF1A861F860bD3d1',
		},
	],
};
