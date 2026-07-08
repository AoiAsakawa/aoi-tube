// Pure replay engine for synchronized VOD archives. It has no React or
// video.js dependency so the sequencing logic can be unit tested in isolation.
// The React/video.js glue lives in useArchiveReplay.ts.
import { ArchiveEvent } from '../../../interfaces/archive.model';
import { MessageType } from '../../../interfaces/socket-events';
import { isScreenEffectType } from '../../../interfaces/donation.model';
import type { ScreenEffectQueueItem } from '../../stores/zustand-store';

export type { ArchiveEvent };

// Broadcast event types that render as a line in the replay chat. Mirrors the
// cases the live viewer handles (ClientConfigStore.handleMessage) and that
// ChatContainer knows how to display. DONATION is included: superchats show as
// a chat line, and effect purchases additionally play a screen effect.
const CHAT_REPLAY_TYPES = new Set<string>([
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
]);

// Whether a recorded payload should appear in the replay chat list.
export function isChatReplayPayload(payload: any): boolean {
	return !!payload && CHAT_REPLAY_TYPES.has(payload.type);
}

// Whether a recorded payload is a screen-effect purchase that should play a
// full-screen effect during replay. Matches the live DONATION handling: only
// explicit "effect" purchases with a known effect type qualify.
export function isScreenEffectPayload(payload: any): boolean {
	return (
		!!payload &&
		payload.type === MessageType.DONATION &&
		payload.itemType === 'effect' &&
		isScreenEffectType(payload.effectType)
	);
}

// Convert a DONATION effect payload into the queue item <ScreenEffects /> plays.
export function payloadToScreenEffect(payload: any): ScreenEffectQueueItem {
	return {
		id: payload.donationId || payload.id,
		effectType: payload.effectType,
		displayName: payload.displayName,
		isAnonymous: payload.isAnonymous,
	};
}

// Stateful cursor over the recorded events, driven by the VOD playhead. Events
// are sorted by offset on construction so forward playback only walks forward.
export class ReplayEngine {
	private readonly events: ArchiveEvent[];

	// Index of the next event that has not yet fired.
	private cursor = 0;

	constructor(events: ArchiveEvent[]) {
		this.events = [...events].sort((a, b) => a.offsetMs - b.offsetMs);
	}

	// Advance the playhead to positionMs during normal forward playback and
	// return every event newly crossed since the last call, in order. The
	// caller appends chat lines and enqueues effects for these events.
	advanceTo(positionMs: number): ArchiveEvent[] {
		const fired: ArchiveEvent[] = [];
		while (this.cursor < this.events.length && this.events[this.cursor].offsetMs <= positionMs) {
			fired.push(this.events[this.cursor]);
			this.cursor += 1;
		}
		return fired;
	}

	// Jump the playhead to positionMs (a user seek). Resets the cursor to the
	// first event strictly after positionMs so nothing already-past re-fires,
	// then returns the chat lines that should exist at that position so the
	// caller can rebuild the chat list from scratch. Screen effects at or before
	// the seek target are intentionally skipped (not returned) — only effects
	// reached later, by playing forward, fire again.
	seekTo(positionMs: number): ArchiveEvent[] {
		this.cursor = 0;
		while (this.cursor < this.events.length && this.events[this.cursor].offsetMs <= positionMs) {
			this.cursor += 1;
		}
		return this.events.slice(0, this.cursor).filter(event => isChatReplayPayload(event.payload));
	}
}
