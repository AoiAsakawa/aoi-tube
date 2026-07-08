import React, { FC } from 'react';
import videojs from 'video.js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

import styles from './VideoJS.module.scss';

export type VideoJSProps = {
	options: any;
	onReady: (player: VideoJsPlayer, vjsInstance: typeof videojs) => void;
};

export const VideoJS: FC<VideoJSProps> = ({ options, onReady }) => {
	const videoRef = React.useRef<HTMLVideoElement | null>(null);
	const playerRef = React.useRef<VideoJsPlayer | null>(null);

	React.useEffect(() => {
		// Make sure Video.js player is only initialized once
		if (!playerRef.current) {
			const videoElement = videoRef.current;

			const player: VideoJsPlayer = (playerRef.current = videojs(videoElement, options, () => {
				console.debug('player is ready');
				return onReady && onReady(player, videojs);
			}));

			player.autoplay(options.autoplay);
			player.src(options.sources);
		}

		// Decorate HLS requests: cachebust playlists, and pass the chat access
		// token on same-origin requests so moderators can watch during silent
		// (test) stream mode and viewers can watch auth-required streams. The
		// token is never sent to external CDN hosts.
		// This is registered on the *global* VHS xhr hook: the per-player tech
		// only exists after the first source loads, which is too late for the
		// initial master playlist request.
		const appendQuery = (uri: string, key: string, value: string) =>
			`${uri}${uri.includes('?') ? '&' : '?'}${key}=${value}`;

		// Same-origin live HLS (/hls/) and paid VOD archive media (/api/archives/)
		// both need the access token appended so the server can authorize the
		// request (silent/auth-required live streams, and purchased VOD segments).
		// The token is never sent to external CDN hosts.
		const isSameOriginHls = (uri: string) => {
			const paths = ['/hls/', '/api/archives/'];
			return paths.some(
				p => uri.startsWith(p) || uri.startsWith(`${window.location.origin}${p}`),
			);
		};

		const decorateRequest = o => {
			if (o.uri.match('m3u8')) {
				const cachebuster = Math.random().toString(16).substr(2, 8);
				o.uri = appendQuery(o.uri, 'cachebust', cachebuster);
			}
			const accessToken = window.localStorage.getItem('accessToken');
			if (accessToken && isSameOriginHls(o.uri)) {
				o.uri = appendQuery(o.uri, 'accessToken', accessToken);
			}
			return o;
		};

		const vhsXhr = (videojs as any).Vhs?.xhr;
		if (vhsXhr && !vhsXhr._owncastDecorateRegistered) {
			// Register on the video.js 8 request-hook set. beforeRequest is
			// never assigned anywhere anymore: merely setting it makes VHS log
			// a deprecation warning on every request.
			if (typeof vhsXhr.onRequest === 'function') {
				vhsXhr.onRequest(decorateRequest);
			} else {
				vhsXhr._requestCallbackSet = vhsXhr._requestCallbackSet || new Set();
				vhsXhr._requestCallbackSet.add(decorateRequest);
			}
			vhsXhr._owncastDecorateRegistered = true;
		}
	}, [options, videoRef]);

	// Dispose the player when the component unmounts (e.g. switching to the
	// WebRTC low-latency player). Without this the orphaned instance kept
	// fetching HLS in the background and never emitted pause/dispose, so the
	// global playing flag stayed stale and switching back rendered a spinner
	// with no click-to-play poster.
	React.useEffect(
		() => () => {
			const player = playerRef.current;
			playerRef.current = null;
			if (player && !player.isDisposed()) {
				// Defer disposal one tick: video.js has already queued callbacks
				// (user-activity class toggles, control updates) that would throw
				// against a half-torn-down player if disposed synchronously here.
				window.setTimeout(() => {
					if (!player.isDisposed()) {
						player.dispose();
					}
				}, 0);
			}
		},
		[],
	);

	return (
		<div data-vjs-player>
			<video
				ref={videoRef}
				className={`video-js vjs-big-play-centered vjs-show-big-play-button-on-pause ${styles.player} vjs-owncast`}
			/>
		</div>
	);
};
