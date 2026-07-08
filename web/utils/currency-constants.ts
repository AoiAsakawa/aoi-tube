export interface CurrencyOption {
	code: string;
	symbol: string;
}

/**
 * Canonical currency option list for the payment config pages: the union of
 * the lists previously duplicated in config-paypal.tsx and config-stripe.tsx.
 * Display names come from i18n keys under admin.config.shared.currencies.<code>.
 * Pages that support only a subset pass their codes to CurrencySelect.
 */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
	{ code: 'JPY', symbol: '¥' },
	{ code: 'USD', symbol: '$' },
	{ code: 'EUR', symbol: '€' },
	{ code: 'GBP', symbol: '£' },
	{ code: 'CAD', symbol: 'C$' },
	{ code: 'AUD', symbol: 'A$' },
	{ code: 'CHF', symbol: 'CHF' },
	{ code: 'CNY', symbol: '¥' },
	{ code: 'HKD', symbol: 'HK$' },
	{ code: 'SGD', symbol: 'S$' },
	{ code: 'TWD', symbol: 'NT$' },
	{ code: 'KRW', symbol: '₩' },
	{ code: 'THB', symbol: '฿' },
	{ code: 'PHP', symbol: '₱' },
	{ code: 'MYR', symbol: 'RM' },
	{ code: 'INR', symbol: '₹' },
	{ code: 'BRL', symbol: 'R$' },
	{ code: 'MXN', symbol: 'MX$' },
	{ code: 'SEK', symbol: 'kr' },
	{ code: 'NOK', symbol: 'kr' },
	{ code: 'DKK', symbol: 'kr' },
	{ code: 'PLN', symbol: 'zł' },
	{ code: 'CZK', symbol: 'Kč' },
	{ code: 'NZD', symbol: 'NZ$' },
];
