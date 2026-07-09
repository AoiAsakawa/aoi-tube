import React, { FC, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import Hls from 'hls.js';
import { ComponentError } from '../../ui/ComponentError/ComponentError';
import styles from './VodPlayer.module.scss';

export type VodPlayerProps = {
	source: string;
	// MIME type of the source; defaults to HLS (application/x-mpegURL).
	sourceType?: string;
	title?: string;
	autoplay?: boolean;
	className?: string;
	// Called with the underlying <video> element once mounted. The archive replay
	// view attaches native timeupdate/seeking/seeked listeners to it to drive the
	// synchronized chat and screen effects.
	onPlayerReady?: (video: HTMLVideoElement) => void;
};

// Append the archive access token to same-origin /api/archives/ HLS requests so
// gated (member/PPV) archives play. The MP4 source already carries its token in
// its URL; this only matters for the legacy HLS fallback, whose playlist and
// segments are fetched by hls.js and would otherwise miss the token.
const decorateArchiveUrl = (url: string): string => {
	try {
		const u = new URL(url, window.location.origin);
		if (u.origin !== window.location.origin || !u.pathname.startsWith('/api/archives/')) {
			return url;
		}
		const token = window.localStorage.getItem('accessToken');
		if (token) {
			u.searchParams.set('accessToken', token);
		}
		return u.toString();
	} catch {
		return url;
	}
};

// On-demand (VOD) player for stream archives. Built on a plain <video> with the
// browser's native controls — the exact same shell as the live HLS and WebRTC
// players — so all three players share one look. video.js is deliberately not
// used: it could not drive the live players' hls.js / MediaStream engines
// (playback stuck on a loading spinner), so the whole set standardised on native
// controls. The single-file replay.mp4 plays natively; the legacy HLS playlist
// is driven by hls.js in plain VOD mode (no low-latency, no live-edge tracking).
export const VodPlayer: FC<VodPlayerProps> = ({
	source,
	sourceType,
	title,
	autoplay = true,
	className,
	onPlayerReady,
}) => {
	const videoRef = useRef<HTMLVideoElement>(null);
	const hlsRef = useRef<Hls | null>(null);
	// Keep the latest onPlayerReady reachable without making it an effect
	// dependency (it must fire exactly once, when the element mounts).
	const onReadyRef = useRef(onPlayerReady);
	onReadyRef.current = onPlayerReady;

	// Attach the media engine to the <video> element.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) {
			return undefined;
		}

		const isHls =
			sourceType === 'application/x-mpegURL' ||
			sourceType === 'application/vnd.apple.mpegurl' ||
			(!sourceType && source.includes('.m3u8'));

		if (isHls && Hls.isSupported()) {
			const hls = new Hls({
				xhrSetup: (xhr: XMLHttpRequest, url: string) => {
					const decorated = decorateArchiveUrl(url);
					if (decorated !== url) {
						xhr.open('GET', decorated, true);
					}
				},
			});
			hlsRef.current = hls;
			hls.attachMedia(video);
			hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(source));
		} else {
			// MP4 (token already in the URL) or native HLS (Safari).
			video.src = source;
		}

		return () => {
			hlsRef.current?.destroy();
			hlsRef.current = null;
		};
	}, [source, sourceType]);

	// Hand the element to the replay hook once, after mount.
	useEffect(() => {
		if (videoRef.current) {
			onReadyRef.current?.(videoRef.current);
		}
	}, []);

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="VodPlayer"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div className={classNames(styles.container, className)} aria-label={title}>
				<video
					ref={videoRef}
					className={styles.video}
					controls
					autoPlay={autoplay}
					playsInline
				/>
			</div>
		</ErrorBoundary>
	);
};

export default VodPlayer;
