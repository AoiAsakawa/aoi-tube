import { describe, it, expect } from 'vitest';
import { cryptoAmountForJpy, decimalToBigInt } from '../components/chat/DonationForm/cryptoAmount';

describe('decimalToBigInt', () => {
	it('converts 18-decimal amounts without float precision loss', () => {
		// Math.floor(10.1 * 1e18) === 10099999999999998976 — the bug this replaces
		expect(decimalToBigInt('10.1', 18)).toBe(10100000000000000000n);
		expect(decimalToBigInt('0.123456789012345678', 18)).toBe(123456789012345678n);
	});

	it('converts BTC amounts to satoshi (8 decimals)', () => {
		expect(decimalToBigInt('0.00012345', 8)).toBe(12345n);
		expect(decimalToBigInt('21000000', 8)).toBe(2100000000000000n);
	});

	it('converts SOL amounts to lamports (9 decimals)', () => {
		expect(decimalToBigInt('1.5', 9)).toBe(1500000000n);
		expect(decimalToBigInt('0.01', 9)).toBe(10000000n);
	});

	it('converts 6-decimal stablecoin amounts', () => {
		expect(decimalToBigInt('10', 6)).toBe(10000000n);
		expect(decimalToBigInt('0.01', 6)).toBe(10000n);
	});

	it('truncates excess fractional digits instead of rounding', () => {
		expect(decimalToBigInt('0.1234567890123456789999', 18)).toBe(123456789012345678n);
		expect(decimalToBigInt('0.999999999', 8)).toBe(99999999n);
	});

	it('handles integers and partial decimal strings', () => {
		expect(decimalToBigInt('5', 18)).toBe(5000000000000000000n);
		expect(decimalToBigInt('5.', 18)).toBe(5000000000000000000n);
		expect(decimalToBigInt('.5', 18)).toBe(500000000000000000n);
	});

	it('returns 0 for invalid or negative input', () => {
		expect(decimalToBigInt('', 18)).toBe(0n);
		expect(decimalToBigInt('.', 18)).toBe(0n);
		expect(decimalToBigInt('abc', 18)).toBe(0n);
		expect(decimalToBigInt('-1', 18)).toBe(0n);
		expect(decimalToBigInt('1,000', 18)).toBe(0n);
	});

	it('normalizes exponential notation from Number inputs', () => {
		expect(decimalToBigInt(1e-7, 18)).toBe(100000000000n);
		expect(decimalToBigInt(0.005, 18)).toBe(5000000000000000n);
	});
});

describe('cryptoAmountForJpy', () => {
	it('converts a JPY price to a token amount at the given rate', () => {
		// ¥1,000 at ¥100,000/token, no margin
		expect(cryptoAmountForJpy(1000, 100000, 18)).toBe('0.01');
		// ¥204 at ¥150/USDC (6 decimals)
		expect(cryptoAmountForJpy(204, 150, 6)).toBe('1.36');
	});

	it('applies the safety margin percentage', () => {
		// ¥200 effect at ¥500,000/ETH with +2% -> 204 / 500000 = 0.000408
		expect(cryptoAmountForJpy(200, 500000, 18, 2)).toBe('0.000408');
		// ¥10,000 effect at ¥15,000,000/BTC with +2% -> 10200 / 15000000
		expect(cryptoAmountForJpy(10000, 15000000, 8, 2)).toBe('0.00068');
	});

	it('rounds up so the sent amount never undershoots the quote', () => {
		// 300 * 1.02 / 700000 = 0.000437142857... -> ceil at 8 decimals
		expect(cryptoAmountForJpy(300, 700000, 18, 2)).toBe('0.00043715');
		expect(parseFloat(cryptoAmountForJpy(300, 700000, 18, 2)) * 700000).toBeGreaterThanOrEqual(
			300 * 1.02,
		);
		// 1/3 keeps repeating: capped at 8 fractional digits, rounded up
		expect(cryptoAmountForJpy(1, 3, 18)).toBe('0.33333334');
	});

	it('caps precision at 8 fractional digits and respects lower decimals', () => {
		const eth = cryptoAmountForJpy(123, 456789, 18, 2);
		expect((eth.split('.')[1] ?? '').length).toBeLessThanOrEqual(8);
		// 2-decimal rounding still rounds up: 204/150 = 1.36, 205/150 = 1.3666... -> 1.37
		expect(cryptoAmountForJpy(205, 150, 2)).toBe('1.37');
		expect(cryptoAmountForJpy(1000, 3, 0)).toBe('334');
	});

	it('strips trailing zeros for display', () => {
		expect(cryptoAmountForJpy(100, 10000, 8)).toBe('0.01');
		expect(cryptoAmountForJpy(100, 100, 6)).toBe('1');
	});

	it('returns an empty string when no quote is possible', () => {
		expect(cryptoAmountForJpy(200, 0, 18, 2)).toBe('');
		expect(cryptoAmountForJpy(200, -5, 18, 2)).toBe('');
		expect(cryptoAmountForJpy(0, 500000, 18, 2)).toBe('');
		expect(cryptoAmountForJpy(NaN, 500000, 18, 2)).toBe('');
		expect(cryptoAmountForJpy(200, NaN, 18, 2)).toBe('');
	});

	it('produces strings decimalToBigInt can convert exactly', () => {
		const amount = cryptoAmountForJpy(300, 700000, 18, 2); // '0.00043715'
		expect(decimalToBigInt(amount, 18)).toBe(437150000000000n);
	});
});
