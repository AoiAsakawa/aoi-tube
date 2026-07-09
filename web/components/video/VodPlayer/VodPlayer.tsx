import React, { FC, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import type VideoJsPlayer from 'video.js/dist/types/player';
import { VideoJS } from '../VideoJS/VideoJS';
import { ComponentError } from '../../ui/ComponentError/ComponentError';
import styles from './VodPlayer.module.scss';

export type VodPlayerProps = {
	source: string;
	// MIME type of the source; defaults to HLS (application/x-mpegURL).
	sourceType?: string;
	title?: string;
	autoplay?: boolean;
	className?: string;
	// Called once the video.js player is ready. Used by the archive replay view
	// to attach playhead listeners (timeupdate / seeking / seeked) that drive
	// the synchronized chat and screen effects.
	onPlayerReady?: (player: VideoJsPlayer) => void;
};

// On-demand (VOD) player for stream archives. Unlike the live OwncastPlayer
// this deliberately omits every live-only feature: no low-latency/LL-HLS VHS
// tuning, no live-edge tracking, no latency compensator, no viewer ping and
// no protocol badge. It uses a normal (seekable) progress bar and exposes
// playback-rate controls, which only make sense for recorded content.
export const VodPlayer: FC<VodPlayerProps> = ({
	source,
	sourceType,
	title,
	autoplay = true,
	className,
	onPlayerReady,
}) => {
	const videoJsOptions = {
		autoplay,
		// video.js control bar (seek, volume, playback-rate menu, fullscreen),
		// matching the live HLS player so all three players share one look.
		controls: true,
		playbackRates: [0.5, 1, 1.25, 1.5, 2],
		bigPlayButton: false,
		responsive: true,
		fluid: false,
		fill: true,
		playsinline: true,
		preload: 'auto',
		sources: [
			{
				src: source,
				type: sourceType || 'application/x-mpegURL',
			},
		],
	};

	const playerRef = useRef<VideoJsPlayer | null>(null);

	const handleReady = (player: VideoJsPlayer) => {
		playerRef.current = player;
		onPlayerReady?.(player);
	};

	// Dispose the player on unmount (e.g. when the archive modal closes) so a
	// detached <video> element doesn't keep playing audio in the background.
	useEffect(
		() => () => {
			const player = playerRef.current;
			if (player && !player.isDisposed()) {
				player.dispose();
			}
			playerRef.current = null;
		},
		[],
	);

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
				<VideoJS options={videoJsOptions} onReady={handleReady} />
			</div>
		</ErrorBoundary>
	);
};

export default VodPlayer;
