// Precise decimal-string → smallest-unit conversion for crypto amounts.
// JavaScript numbers lose precision above 2^53 (e.g. 18-decimal wei),
// so amounts are kept as strings and converted digit-wise with BigInt.
export const decimalToBigInt = (value: string | number, decimals: number): bigint => {
	let s = String(value ?? '').trim();
	if (s === '') return 0n;
	// Normalize exponential notation (e.g. "1e-7") to a plain decimal string
	if (/[eE]/.test(s)) {
		const n = Number(s);
		if (!Number.isFinite(n) || n <= 0) return 0n;
		s = n.toFixed(decimals);
	}
	const match = s.match(/^(\d*)(?:\.(\d*))?$/);
	if (!match || (!match[1] && !match[2])) return 0n;
	const intPart = match[1] || '0';
	const fracPart = (match[2] || '').slice(0, decimals).padEnd(decimals, '0');
	return BigInt(intPart + fracPart);
};

// Rounding/display precision cap for computed token amounts. 8 fractional
// digits keep the ceil() math well inside float53 precision while the value
// left below 1e-8 of a token is worth a negligible fraction of a yen.
const MAX_COMPUTED_DECIMALS = 8;

/**
 * Returns the decimal-string amount of a token worth `targetJpy` at the rate
 * `priceJpy` (JPY per whole token), inflated by `marginPercent`.
 *
 * Used for fixed-JPY-price purchases (screen effects) paid in crypto: the
 * server accepts an on-chain amount worth at least 95% of the JPY price, so
 * the form quotes the price plus a small safety margin for market movement.
 * The result is rounded UP at min(decimals, 8) fractional digits so the sent
 * amount can never undershoot the quoted value, and trailing zeros are
 * stripped for display. Returns '' when the inputs cannot produce a quote.
 */
export const cryptoAmountForJpy = (
	targetJpy: number,
	priceJpy: number,
	decimals: number,
	marginPercent = 0,
): string => {
	if (!Number.isFinite(targetJpy) || targetJpy <= 0) return '';
	if (!Number.isFinite(priceJpy) || priceJpy <= 0) return '';
	const precision = Math.min(Math.max(Math.floor(decimals), 0), MAX_COMPUTED_DECIMALS);
	const raw = (targetJpy * (1 + marginPercent / 100)) / priceJpy;
	const factor = 10 ** precision;
	const roundedUp = Math.ceil(raw * factor) / factor;
	if (!Number.isFinite(roundedUp) || roundedUp <= 0) return '';
	// toFixed keeps the plain-decimal form decimalToBigInt expects; strip the
	// trailing zeros (and a bare trailing dot) for display.
	const fixed = roundedUp.toFixed(precision);
	return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
};
