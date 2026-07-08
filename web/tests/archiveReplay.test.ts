import { describe, it, expect } from 'vitest';
import {
	ReplayEngine,
	isChatReplayPayload,
	isScreenEffectPayload,
	payloadToScreenEffect,
	ArchiveEvent,
} from '../components/video/VodReplay/archiveReplay';
import { MessageType } from '../interfaces/socket-events';

const chat = (id: string, offsetMs: number): ArchiveEvent => ({
	offsetMs,
	payload: { id, type: MessageType.CHAT, body: id, user: { id: `u-${id}` } },
});

const effect = (id: string, offsetMs: number, effectType = 'confetti'): ArchiveEvent => ({
	offsetMs,
	payload: {
		id,
		type: MessageType.DONATION,
		itemType: 'effect',
		effectType,
		displayName: `name-${id}`,
		isAnonymous: false,
		donationId: `d-${id}`,
	},
});

const superchat = (id: string, offsetMs: number): ArchiveEvent => ({
	offsetMs,
	payload: {
		id,
		type: MessageType.DONATION,
		itemType: 'superchat',
		amount: 500,
		currency: 'JPY',
		displayName: `name-${id}`,
		isAnonymous: false,
		donationId: `d-${id}`,
	},
});

const ids = (events: ArchiveEvent[]) => events.map(e => e.payload.id);

describe('payload classification', () => {
	it('treats chat/name/join/part/action/system/fediverse/donation as chat lines', () => {
		[
			MessageType.CHAT,
			MessageType.NAME_CHANGE,
			MessageType.USER_JOINED,
			MessageType.USER_PARTED,
			MessageType.CHAT_ACTION,
			MessageType.SYSTEM,
			MessageType.FEDIVERSE_ENGAGEMENT_FOLLOW,
			MessageType.FEDIVERSE_ENGAGEMENT_LIKE,
			MessageType.FEDIVERSE_ENGAGEMENT_REPOST,
			MessageType.DONATION,
		].forEach(type => {
			expect(isChatReplayPayload({ type })).toBe(true);
		});
	});

	it('excludes non-chat control events and empty payloads', () => {
		expect(isChatReplayPayload({ type: MessageType.PING })).toBe(false);
		expect(isChatReplayPayload({ type: MessageType.CONNECTED_USER_INFO })).toBe(false);
		expect(isChatReplayPayload(null)).toBe(false);
		expect(isChatReplayPayload(undefined)).toBe(false);
	});

	it('recognizes only effect-type donations with a known effect as screen effects', () => {
		expect(isScreenEffectPayload(effect('a', 0).payload)).toBe(true);
		// Superchats are not screen effects even though they are donations.
		expect(isScreenEffectPayload(superchat('b', 0).payload)).toBe(false);
		// Unknown effect types are rejected.
		expect(
			isScreenEffectPayload({
				type: MessageType.DONATION,
				itemType: 'effect',
				effectType: 'bogus',
			}),
		).toBe(false);
		expect(isScreenEffectPayload({ type: MessageType.CHAT })).toBe(false);
	});

	it('maps an effect payload to a screen-effect queue item', () => {
		expect(payloadToScreenEffect(effect('x', 0, 'goldrush').payload)).toEqual({
			id: 'd-x',
			effectType: 'goldrush',
			displayName: 'name-x',
			isAnonymous: false,
		});
	});
});

describe('ReplayEngine.advanceTo', () => {
	it('fires events whose offset has been reached, in order, once each', () => {
		const engine = new ReplayEngine([chat('a', 100), chat('b', 200), chat('c', 500)]);

		expect(ids(engine.advanceTo(50))).toEqual([]);
		expect(ids(engine.advanceTo(150))).toEqual(['a']);
		expect(ids(engine.advanceTo(150))).toEqual([]); // no re-fire at same position
		expect(ids(engine.advanceTo(500))).toEqual(['b', 'c']); // inclusive boundary
		expect(ids(engine.advanceTo(10000))).toEqual([]);
	});

	it('sorts events by offset regardless of input order', () => {
		const engine = new ReplayEngine([chat('c', 500), chat('a', 100), chat('b', 200)]);
		expect(ids(engine.advanceTo(10000))).toEqual(['a', 'b', 'c']);
	});

	it('handles an empty event list', () => {
		const engine = new ReplayEngine([]);
		expect(engine.advanceTo(1000)).toEqual([]);
	});
});

describe('ReplayEngine.seekTo', () => {
	it('rebuilds only the chat lines up to the seek target', () => {
		const engine = new ReplayEngine([
			chat('a', 100),
			effect('fx', 200),
			superchat('sc', 300),
			chat('b', 400),
		]);
		// Seeking to 350ms includes a, fx (as a donation chat line), sc; excludes b.
		expect(ids(engine.seekTo(350))).toEqual(['a', 'fx', 'sc']);
	});

	it('resets the cursor so a backward seek does not re-fire past events forward', () => {
		const engine = new ReplayEngine([chat('a', 100), chat('b', 300), chat('c', 500)]);
		engine.advanceTo(600); // fire everything
		engine.seekTo(200); // rewind to 200ms -> only "a" should exist
		// Playing forward from 200ms fires b then c again, but not a.
		expect(ids(engine.advanceTo(300))).toEqual(['b']);
		expect(ids(engine.advanceTo(500))).toEqual(['c']);
	});

	it('skips screen effects before the seek target (only future effects fire)', () => {
		const engine = new ReplayEngine([effect('fx1', 100), chat('a', 200), effect('fx2', 400)]);
		// Seek forward past fx1: it is returned as a chat line for rebuild but the
		// engine reports no *fired* effects; only fx2 fires when reached later.
		const rebuilt = engine.seekTo(250);
		expect(ids(rebuilt)).toEqual(['fx1', 'a']);
		expect(rebuilt.every(isFiredEffectFree)).toBe(true);
		// Advancing past fx2 fires it (a real forward crossing).
		expect(ids(engine.advanceTo(500))).toEqual(['fx2']);
	});
});

// seekTo returns rebuild chat lines only; effect firing happens exclusively via
// advanceTo. This helper documents that seekTo output is never treated as a
// fired effect by the caller.
function isFiredEffectFree(event: ArchiveEvent): boolean {
	return isChatReplayPayload(event.payload);
}
