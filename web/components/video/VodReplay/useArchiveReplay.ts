import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../../../interfaces/chat-message.model';
import { useEnqueueScreenEffect } from '../../stores/zustand-store';
import {
	ArchiveEvent,
	ReplayEngine,
	isChatReplayPayload,
	isScreenEffectPayload,
	payloadToScreenEffect,
} from './archiveReplay';

export interface UseArchiveReplayResult {
	// Chat lines reconstructed for the current playhead position.
	messages: ChatMessage[];
	// Pass to <VodPlayer onPlayerReady> to start driving the replay.
	handlePlayerReady: (video: HTMLVideoElement) => void;
}

// Drives synchronized chat and screen effects from the VOD playhead. Chat lines
// accumulate as the video plays and are rebuilt on seek; effect purchases are
// pushed onto the shared screen-effect queue so <ScreenEffects /> plays them.
//
// Event firing is driven by video.js `timeupdate` (~4Hz). That resolution is
// ample for chat and for effects (which run for several seconds), and it stops
// automatically while the video is paused, so no separate timer is needed.
// Seeks are handled explicitly via `seeking`/`seeked` to rebuild the chat and
// skip any effects before the seek target.
export function useArchiveReplay(events: ArchiveEvent[]): UseArchiveReplayResult {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const enqueueScreenEffect = useEnqueueScreenEffect();
	const engineRef = useRef<ReplayEngine | null>(null);
	// True between `seeking` and `seeked`; suppresses forward firing during the
	// jump so effects between the old and new position are not replayed.
	const isSeekingRef = useRef(false);

	// Rebuild the engine and clear the chat whenever the event set changes
	// (a different archive is opened).
	useEffect(() => {
		engineRef.current = new ReplayEngine(events);
		isSeekingRef.current = false;
		setMessages([]);
	}, [events]);

	// Apply newly crossed events: append chat lines, enqueue screen effects.
	const fire = useCallback(
		(fired: ArchiveEvent[]) => {
			if (fired.length === 0) {
				return;
			}
			fired.forEach(event => {
				if (isScreenEffectPayload(event.payload)) {
					enqueueScreenEffect(payloadToScreenEffect(event.payload));
				}
			});
			const chat = fired
				.filter(event => isChatReplayPayload(event.payload))
				.map(event => event.payload as ChatMessage);
			if (chat.length > 0) {
				setMessages(prev => [...prev, ...chat]);
			}
		},
		[enqueueScreenEffect],
	);

	const handlePlayerReady = useCallback(
		(video: HTMLVideoElement) => {
			const positionMs = () => video.currentTime * 1000;

			video.addEventListener('timeupdate', () => {
				if (isSeekingRef.current) {
					return;
				}
				const engine = engineRef.current;
				if (engine) {
					fire(engine.advanceTo(positionMs()));
				}
			});

			video.addEventListener('seeking', () => {
				isSeekingRef.current = true;
			});

			video.addEventListener('seeked', () => {
				isSeekingRef.current = false;
				const engine = engineRef.current;
				if (engine) {
					// Rebuild the chat to match the seek target; effects before it
					// are skipped by the engine.
					setMessages(engine.seekTo(positionMs()).map(event => event.payload as ChatMessage));
				}
			});
		},
		[fire],
	);

	return { messages, handlePlayerReady };
}
