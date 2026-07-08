import { describe, it, expect } from 'vitest';
import {
	getEffectPrice,
	getScreenEffectEmoji,
	getSuperchatTier,
	isScreenEffectType,
	SCREEN_EFFECT_PRICES,
	SCREEN_EFFECT_TYPES,
} from '../interfaces/donation.model';

describe('getSuperchatTier', () => {
	it('maps JPY amounts to the YouTube-style tier boundaries', () => {
		expect(getSuperchatTier(100, 'JPY')?.header).toBe('#1565C0'); // blue
		expect(getSuperchatTier(199, 'JPY')?.header).toBe('#1565C0');
		expect(getSuperchatTier(200, 'JPY')?.header).toBe('#00B8D4'); // light blue
		expect(getSuperchatTier(499, 'JPY')?.header).toBe('#00B8D4');
		expect(getSuperchatTier(500, 'JPY')?.header).toBe('#00BFA5'); // green
		expect(getSuperchatTier(999, 'JPY')?.header).toBe('#00BFA5');
		expect(getSuperchatTier(1000, 'JPY')?.header).toBe('#FFB300'); // yellow
		expect(getSuperchatTier(1999, 'JPY')?.header).toBe('#FFB300');
		expect(getSuperchatTier(2000, 'JPY')?.header).toBe('#E65100'); // orange
		expect(getSuperchatTier(4999, 'JPY')?.header).toBe('#E65100');
		expect(getSuperchatTier(5000, 'JPY')?.header).toBe('#C2185B'); // magenta
		expect(getSuperchatTier(9999, 'JPY')?.header).toBe('#C2185B');
		expect(getSuperchatTier(10000, 'JPY')?.header).toBe('#D00000'); // red
		expect(getSuperchatTier(1000000, 'JPY')?.header).toBe('#D00000');
	});

	it('divides non-JPY fiat amounts by 100 (minor units) before tiering', () => {
		// $10.00 stored as 1000 cents -> 10 -> lowest tier
		expect(getSuperchatTier(1000, 'USD')?.header).toBe('#1565C0');
		// €500.00 stored as 50000 cents -> 500 -> green tier
		expect(getSuperchatTier(50000, 'EUR')?.header).toBe('#00BFA5');
		expect(getSuperchatTier(50000, 'usd')?.header).toBe('#00BFA5');
	});

	it('returns null for crypto currencies so they keep the gold styling', () => {
		expect(getSuperchatTier(5000000, 'ETH')).toBeNull();
		expect(getSuperchatTier(100000, 'BTC')).toBeNull();
		expect(getSuperchatTier(10000000000, 'USDT')).toBeNull();
		expect(getSuperchatTier(123, 'VBC')).toBeNull();
		expect(getSuperchatTier(123, '')).toBeNull();
	});
});

describe('screen effect helpers', () => {
	it('recognizes the purchasable effect types', () => {
		expect(isScreenEffectType('confetti')).toBe(true);
		expect(isScreenEffectType('hearts')).toBe(true);
		expect(isScreenEffectType('stars')).toBe(true);
		expect(isScreenEffectType('fireworks')).toBe(true);
		expect(isScreenEffectType('celebration')).toBe(true);
		expect(isScreenEffectType('rainbow')).toBe(true);
		expect(isScreenEffectType('meteor')).toBe(true);
		expect(isScreenEffectType('goldrush')).toBe(true);
		expect(isScreenEffectType('sparkles')).toBe(false);
		expect(isScreenEffectType(undefined)).toBe(false);
	});

	it('maps effect types to emojis with a fallback', () => {
		expect(getScreenEffectEmoji('confetti')).toBe('🎉');
		expect(getScreenEffectEmoji('hearts')).toBe('💖');
		expect(getScreenEffectEmoji('stars')).toBe('⭐');
		expect(getScreenEffectEmoji('fireworks')).toBe('🎆');
		expect(getScreenEffectEmoji('celebration')).toBe('🎊');
		expect(getScreenEffectEmoji('rainbow')).toBe('🌈');
		expect(getScreenEffectEmoji('meteor')).toBe('☄️');
		expect(getScreenEffectEmoji('goldrush')).toBe('💰');
		expect(getScreenEffectEmoji('unknown')).toBe('✨');
	});
});

describe('screen effect prices', () => {
	it('matches the server price table (models/donation.go effectPrices)', () => {
		expect(SCREEN_EFFECT_PRICES).toEqual({
			confetti: { JPY: 300, USD: 3 },
			hearts: { JPY: 400, USD: 4 },
			stars: { JPY: 500, USD: 5 },
			fireworks: { JPY: 1000, USD: 10 },
			celebration: { JPY: 2000, USD: 20 },
			rainbow: { JPY: 3000, USD: 30 },
			meteor: { JPY: 5000, USD: 50 },
			goldrush: { JPY: 10000, USD: 100 },
		});
	});

	it('keeps every effect price distinct so the tiers never collide', () => {
		const jpyPrices = Object.values(SCREEN_EFFECT_PRICES).map(p => p.JPY);
		expect(new Set(jpyPrices).size).toBe(jpyPrices.length);
	});

	it('has a price entry for every purchasable effect type', () => {
		SCREEN_EFFECT_TYPES.forEach(effect => {
			expect(getEffectPrice(effect, 'JPY')).toBeGreaterThan(0);
			expect(getEffectPrice(effect, 'USD')).toBeGreaterThan(0);
		});
	});

	it('returns the price in the requested currency', () => {
		expect(getEffectPrice('confetti', 'JPY')).toBe(300);
		expect(getEffectPrice('confetti', 'USD')).toBe(3);
		expect(getEffectPrice('fireworks', 'JPY')).toBe(1000);
		expect(getEffectPrice('celebration', 'USD')).toBe(20);
		expect(getEffectPrice('rainbow', 'JPY')).toBe(3000);
		expect(getEffectPrice('meteor', 'USD')).toBe(50);
		expect(getEffectPrice('goldrush', 'JPY')).toBe(10000);
		// Currency codes are matched case-insensitively.
		expect(getEffectPrice('hearts', 'jpy')).toBe(400);
	});

	it('falls back to the USD price for unknown currencies', () => {
		expect(getEffectPrice('stars', 'EUR')).toBe(5);
		expect(getEffectPrice('fireworks', 'KRW')).toBe(10);
		expect(getEffectPrice('celebration', undefined)).toBe(20);
		expect(getEffectPrice('goldrush', 'EUR')).toBe(100);
	});
});
