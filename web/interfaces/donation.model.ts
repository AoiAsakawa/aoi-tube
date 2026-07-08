import { User } from './user.model';

// Screen effects that can be purchased instead of a superchat.
// Must stay in sync with models.ValidEffectTypes on the server.
export type ScreenEffectType =
	| 'confetti'
	| 'hearts'
	| 'stars'
	| 'fireworks'
	| 'celebration'
	| 'rainbow'
	| 'meteor'
	| 'goldrush';

// Picker order: cheapest to most expensive (matches the server price table).
export const SCREEN_EFFECT_TYPES: ScreenEffectType[] = [
	'confetti',
	'hearts',
	'stars',
	'fireworks',
	'celebration',
	'rainbow',
	'meteor',
	'goldrush',
];

// Emoji used to represent each screen effect in pickers and chat lines.
export const SCREEN_EFFECT_EMOJIS: Record<ScreenEffectType, string> = {
	confetti: '🎉',
	hearts: '💖',
	stars: '⭐',
	fireworks: '🎆',
	celebration: '🎊',
	rainbow: '🌈',
	meteor: '☄️',
	goldrush: '💰',
};

// Japanese effect names for surfaces that are not i18n-ized yet (the admin
// pages and the Bouyomi-chan reader are Japanese-only; admin i18n is phase 2).
export const SCREEN_EFFECT_NAMES_JA: Record<ScreenEffectType, string> = {
	confetti: '紙吹雪',
	hearts: 'ハート',
	stars: '流れ星',
	fireworks: '花火',
	celebration: 'お祝い',
	rainbow: '虹',
	meteor: '流星群',
	goldrush: 'ゴールドラッシュ',
};

// Fixed screen effect prices in major currency units, keyed by currency code.
// Screen effects are fixed-price products: the server enforces these amounts
// (models/donation.go effectPrices) and ignores the client-supplied amount,
// so this table only drives what the form displays and submits.
export const SCREEN_EFFECT_PRICES: Record<ScreenEffectType, { JPY: number; USD: number }> = {
	// 300 JPY is the storefront-wide minimum price (operator decision); each
	// effect keeps a distinct price so the tiers never collide.
	confetti: { JPY: 300, USD: 3 },
	hearts: { JPY: 400, USD: 4 },
	stars: { JPY: 500, USD: 5 },
	fireworks: { JPY: 1000, USD: 10 },
	celebration: { JPY: 2000, USD: 20 },
	rainbow: { JPY: 3000, USD: 30 },
	meteor: { JPY: 5000, USD: 50 },
	goldrush: { JPY: 10000, USD: 100 },
};

// Returns the fixed price of a screen effect in major units of the given
// currency. Mirrors the server's models.GetEffectPrice: currencies without
// an explicit entry fall back to the USD price as an approximation.
export function getEffectPrice(effectType: ScreenEffectType, currencyCode?: string): number {
	const prices: Record<string, number> = SCREEN_EFFECT_PRICES[effectType];
	return prices[currencyCode?.toUpperCase() ?? ''] ?? prices.USD;
}

export function isScreenEffectType(value: string | undefined): value is ScreenEffectType {
	return !!value && (SCREEN_EFFECT_TYPES as string[]).includes(value);
}

// Returns the emoji for an effect type, with a generic sparkle fallback for
// unknown values so future effect types still render something sensible.
export function getScreenEffectEmoji(effectType?: string): string {
	return isScreenEffectType(effectType) ? SCREEN_EFFECT_EMOJIS[effectType] : '✨';
}

export interface Donation {
	id: string;
	userId?: string;
	amount: number;
	currency: string;
	// Base-currency value of a crypto purchase recorded by the server at
	// confirmation time. 0 or missing means no conversion was available. The
	// wire name predates configurable base currencies; fiatCurrency names the
	// actual currency (empty means JPY).
	amountJpy?: number;
	fiatCurrency?: string;
	message?: string;
	displayName: string;
	isAnonymous: boolean;
	paymentProvider?: string;
	paymentId?: string;
	hiddenAt?: Date;
	createdAt: Date;
	user?: User;
	// "superchat" (default, may be omitted), "effect" or "archive".
	itemType?: string;
	effectType?: string;
	// Archive purchases only: the purchased archive and its title at fetch
	// time. archiveTitle is empty when the archive has since been deleted.
	archiveId?: string;
	archiveTitle?: string;
	// True for purchases made through a sandbox/test-mode provider; these are
	// excluded from all revenue aggregates.
	isTest?: boolean;
}

export interface DonationEvent {
	type: 'DONATION';
	id: string;
	timestamp: Date;
	amount: number;
	currency: string;
	// Base-currency conversion recorded at confirmation time (crypto purchases
	// only). fiatCurrency names the currency (empty means JPY).
	amountJpy?: number;
	fiatCurrency?: string;
	message?: string;
	displayName: string;
	isAnonymous: boolean;
	donationId: string;
	user?: User;
	itemType?: string;
	effectType?: string;
}

export interface DonationSummary {
	count: number;
	totals: {
		[currency: string]: number;
	};
	monthlyJPY?: number;
}

// Aggregates returned by GET /api/admin/donations/stats for the admin
// purchases dashboard. Amounts are the raw DB-stored values (JPY as-is,
// other fiat in minor units). Test purchases are excluded from every series
// except testCount.
export interface DonationCurrencyStat {
	currency: string;
	total: number;
	thisMonth: number;
	lastMonth: number;
	count: number;
	average: number;
}

export interface DonationProviderStat {
	provider: string;
	currency: string;
	total: number;
	count: number;
}

export interface DonationItemStat {
	itemType: string;
	effectType?: string;
	count: number;
}

export interface DonationDailyStat {
	// Day in "YYYY-MM-DD" form; only days with purchases are present.
	date: string;
	currency: string;
	total: number;
	count: number;
}

export interface DonationStats {
	currencies: DonationCurrencyStat[];
	providers: DonationProviderStat[];
	items: DonationItemStat[];
	daily: DonationDailyStat[];
	uniquePurchasers: number;
	testCount: number;
	// The server's base currency; cryptoFiatTotal is expressed in it.
	baseCurrency?: string;
	// Base-currency value of crypto purchases recorded at their confirmation
	// time. Purchases recorded under a different base currency or without a
	// stored conversion are not included. Optional so responses from older
	// servers still parse.
	cryptoFiatTotal?: number;
}

/**
 * Check if a donation is "super high value" (10,000 JPY or 100 USD equivalent).
 * This triggers special red styling.
 * - JPY: 10,000+ yen
 * - USD/EUR: 100+ dollars/euros (stored as cents, so 10000+)
 * - Stablecoins (USDT, USDC, DAI): 100+ (stored as 1e8 units, so 10000000000+)
 * - BTC: ~$100 worth varies, using 0.001 BTC as threshold (~$100 at $100k/BTC)
 * - ETH: ~$100 worth varies, using 0.03 ETH as threshold (~$100 at $3.3k/ETH)
 * - Other crypto: 100 units as threshold
 */
export function isSuperHighValueDonation(amount: number, currency: string): boolean {
	const normalizedCurrency = currency?.toUpperCase() || '';

	switch (normalizedCurrency) {
		case 'JPY':
			return amount >= 10000; // 10,000 yen or more

		case 'USD':
		case 'EUR':
			return amount >= 10000; // 100 dollars/euros (stored as cents)

		// Stablecoins - stored as 1e8 units
		case 'USDT':
		case 'USDC':
		case 'DAI':
			return amount >= 10000000000; // 100 * 1e8 = 100 USD equivalent

		// BTC - 0.001 BTC threshold (roughly $100 at ~$100k/BTC)
		case 'BTC':
			return amount >= 100000; // 0.001 * 1e8

		// ETH - 0.03 ETH threshold (roughly $100 at ~$3.3k/ETH)
		case 'ETH':
			return amount >= 3000000; // 0.03 * 1e8

		// Other crypto (MATIC, BNB, AVAX, VBC) - 100 units threshold
		case 'MATIC':
		case 'BNB':
		case 'AVAX':
		case 'VBC':
			return amount >= 10000000000; // 100 * 1e8

		default:
			// Default to 10000 for unknown currencies
			return amount >= 10000;
	}
}

/**
 * Check if a donation is "high value" (1,000 JPY or 10 USD equivalent).
 * This triggers the gold/yellow special styling.
 */
export function isHighValueDonation(amount: number, currency: string): boolean {
	const normalizedCurrency = currency?.toUpperCase() || '';

	switch (normalizedCurrency) {
		case 'JPY':
			return amount >= 1000; // 1,000 yen or more

		case 'USD':
		case 'EUR':
			return amount >= 1000; // 10 dollars/euros (stored as cents)

		// Stablecoins - stored as 1e8 units
		case 'USDT':
		case 'USDC':
		case 'DAI':
			return amount >= 1000000000; // 10 * 1e8 = 10 USD equivalent

		// BTC - 0.0001 BTC threshold (roughly $10)
		case 'BTC':
			return amount >= 10000; // 0.0001 * 1e8

		// ETH - 0.003 ETH threshold (roughly $10)
		case 'ETH':
			return amount >= 300000; // 0.003 * 1e8

		// Other crypto
		case 'MATIC':
		case 'BNB':
		case 'AVAX':
		case 'VBC':
			return amount >= 1000000000; // 10 * 1e8

		default:
			return amount >= 1000;
	}
}

export function formatDonationAmount(amount: number, currency: string): string {
	// Normalize currency to uppercase for comparison
	const normalizedCurrency = currency?.toUpperCase() || '';

	switch (normalizedCurrency) {
		case 'JPY':
			return `¥${amount.toLocaleString()}`;
		case 'USD':
			return `$${(amount / 100).toFixed(2)}`;
		case 'EUR':
			return `€${(amount / 100).toFixed(2)}`;
		// Crypto currencies - stored as 1e8 units (like satoshi)
		case 'BTC':
		case 'ETH':
		case 'MATIC':
		case 'BNB':
		case 'AVAX':
		case 'VBC':
		case 'USDT':
		case 'USDC':
		case 'DAI': {
			// Convert from 1e8 units back to actual amount
			const cryptoAmount = amount / 100000000;
			// Format with appropriate decimal places based on value
			if (cryptoAmount === 0) {
				return `0 ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 0.00000001) {
				return `${cryptoAmount.toExponential(2)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 0.0001) {
				return `${cryptoAmount.toFixed(8)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 0.01) {
				return `${cryptoAmount.toFixed(6)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 1) {
				return `${cryptoAmount.toFixed(4)} ${normalizedCurrency}`;
			} else if (Math.abs(cryptoAmount) < 1000) {
				return `${cryptoAmount.toFixed(2)} ${normalizedCurrency}`;
			} else {
				return `${cryptoAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${normalizedCurrency}`;
			}
		}
		default: {
			// For unknown currencies, check if it looks like crypto (small amount after conversion)
			const defaultAmount = amount / 100000000;
			if (Math.abs(defaultAmount) < 1000 && Math.abs(defaultAmount) > 0.00000001) {
				// Likely crypto stored as 1e8
				if (Math.abs(defaultAmount) < 0.0001) {
					return `${defaultAmount.toFixed(8)} ${currency}`;
				} else if (Math.abs(defaultAmount) < 1) {
					return `${defaultAmount.toFixed(4)} ${currency}`;
				}
				return `${defaultAmount.toFixed(2)} ${currency}`;
			}
			// Probably a fiat-like currency stored as integer
			return `${amount.toLocaleString()} ${currency}`;
		}
	}
}

/**
 * YouTube-style superchat tier: a header color (dark shade), a body color
 * (light shade) and readable text colors for each.
 */
export interface SuperchatTier {
	header: string;
	body: string;
	headerText: string;
	bodyText: string;
}

// Fiat currencies supported by the PayPal / Stripe / PayPay integrations.
// Everything else (BTC, ETH, SOL, VBC, ...) is treated as crypto and keeps
// the classic gold donation styling instead of the tier colors.
const FIAT_CURRENCIES = new Set([
	'JPY',
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'CNY',
	'HKD',
	'SGD',
	'TWD',
	'KRW',
	'THB',
	'PHP',
	'MYR',
	'INR',
	'BRL',
	'MXN',
	'CHF',
	'SEK',
	'NOK',
	'DKK',
	'PLN',
	'CZK',
	'NZD',
]);

// Tier boundaries follow YouTube Super Chat's JPY tiers. The colors are the
// official YouTube tier palette (header = dark shade, body = light shade).
const SUPERCHAT_TIERS: { min: number; tier: SuperchatTier }[] = [
	{
		min: 10000,
		tier: { header: '#D00000', body: '#E62117', headerText: '#FFFFFF', bodyText: '#FFFFFF' },
	},
	{
		min: 5000,
		tier: { header: '#C2185B', body: '#E91E63', headerText: '#FFFFFF', bodyText: '#FFFFFF' },
	},
	{
		min: 2000,
		tier: { header: '#E65100', body: '#F57C00', headerText: '#FFFFFF', bodyText: '#FFFFFF' },
	},
	{
		min: 1000,
		tier: {
			header: '#FFB300',
			body: '#FFCA28',
			headerText: 'rgba(0, 0, 0, 0.87)',
			bodyText: 'rgba(0, 0, 0, 0.87)',
		},
	},
	{
		min: 500,
		tier: {
			header: '#00BFA5',
			body: '#1DE9B6',
			headerText: '#FFFFFF',
			bodyText: 'rgba(0, 0, 0, 0.87)',
		},
	},
	{
		min: 200,
		tier: {
			header: '#00B8D4',
			body: '#00E5FF',
			headerText: '#FFFFFF',
			bodyText: 'rgba(0, 0, 0, 0.87)',
		},
	},
	{
		min: 0,
		tier: { header: '#1565C0', body: '#1E88E5', headerText: '#FFFFFF', bodyText: '#FFFFFF' },
	},
];

/**
 * Returns the superchat tier colors for a fiat donation, or null for crypto
 * donations (which keep the existing gold styling).
 * JPY amounts are stored in yen; other fiat currencies are stored in minor
 * units (cents), so they are divided by 100 before comparing against the
 * JPY-based thresholds.
 */
export function getSuperchatTier(amount: number, currency: string): SuperchatTier | null {
	const normalizedCurrency = currency?.toUpperCase() || '';
	if (!FIAT_CURRENCIES.has(normalizedCurrency)) {
		return null;
	}

	const majorAmount = normalizedCurrency === 'JPY' ? amount : amount / 100;
	const match = SUPERCHAT_TIERS.find(({ min }) => majorAmount >= min);
	return (match ?? SUPERCHAT_TIERS[SUPERCHAT_TIERS.length - 1]).tier;
}

// Crypto currencies stored as 1e8 fixed-point units (see formatDonationAmount).
const CRYPTO_1E8_CURRENCIES = new Set([
	'BTC',
	'ETH',
	'MATIC',
	'BNB',
	'AVAX',
	'VBC',
	'USDT',
	'USDC',
	'DAI',
]);

/**
 * Converts a DB-stored donation amount to major currency units, e.g. for
 * chart values: JPY is stored as-is, crypto as 1e8 fixed-point units, and
 * other fiat currencies in minor units (cents).
 */
export function donationAmountToMajorUnits(amount: number, currency: string): number {
	const normalizedCurrency = currency?.toUpperCase() || '';
	if (normalizedCurrency === 'JPY') {
		return amount;
	}
	if (CRYPTO_1E8_CURRENCIES.has(normalizedCurrency)) {
		return amount / 100000000;
	}
	if (FIAT_CURRENCIES.has(normalizedCurrency)) {
		return amount / 100;
	}
	return amount;
}
