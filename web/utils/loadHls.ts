import type Hls from 'hls.js';

export type HlsConstructor = typeof Hls;

let pending: Promise<HlsConstructor> | null = null;

// hls.js is the largest dependency of the viewer (about 0.9 MB before
// compression) and is only needed once a player starts an HLS source. Loading
// it on demand keeps it out of the bundle every page downloads first: an
// offline page, an MP4 replay and the WebRTC player never fetch it.
//
// The module is fetched once and shared by every player.
export function loadHls(): Promise<HlsConstructor> {
	if (!pending) {
		pending = import('hls.js').then(module => module.default);
		// A failed fetch (flaky network) must not be remembered forever.
		pending.catch(() => {
			pending = null;
		});
	}
	return pending;
}
