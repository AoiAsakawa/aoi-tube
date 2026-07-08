import React, { FC, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import { VideoJS } from '../VideoJS/VideoJS';
import ViewerPing from '../viewer-ping';
import { VideoPoster } from '../VideoPoster/VideoPoster';
import { getLocalStorage, setLocalStorage, PLAYER_VOLUME } from '../../../utils/localStorage';
import { useIsVideoPlaying, useSetIsVideoPlaying, useClockSkew } from '../../stores/zustand-store';
import PlaybackMetrics from '../metrics/playback';
import styles from './OwncastPlayer.module.scss';
import { ComponentError } from '../../ui/ComponentError/ComponentError';
import { ProtocolBadge } from '../ProtocolBadge';
import { ProtocolInfo } from '../../../interfaces/server-status.model';

const ping = new ViewerPing();
let playbackMetrics = null;

export type OwncastPlayerProps = {
	source: string;
	online: boolean;
	initiallyMuted?: boolean;
	title: string;
	className?: string;
	embedded?: boolean;
	protocol?: ProtocolInfo;
};

export const OwncastPlayer: FC<OwncastPlayerProps> = ({
	source,
	online,
	initiallyMuted = false,
	title,
	className,
	embedded = false,
	protocol,
}) => {
	const playerRef = React.useRef(null);
	const videoElRef = React.useRef<HTMLVideoElement | null>(null);
	const videoPlaying = useIsVideoPlaying();
	const setVideoPlaying = useSetIsVideoPlaying();
	const clockSkew = useClockSkew();
	// Pre-play cover: the operator's live poster. /liveposter is pure
	// branding — ungated and independent of thumbnail generation — so it can
	// never fall back to the logo the way the auth-gated /thumbnail.jpg did.
	const posterSrc = '/liveposter';
	// Actual received resolution/fps, shown in the protocol badge exactly like
	// the WebRTC player does.
	const [videoStats, setVideoStats] = React.useState<{
		height: number;
		fps: number;
		latencyMs?: number;
	} | null>(null);

	const setSavedVolume = () => {
		try {
			playerRef.current.volume(getLocalStorage(PLAYER_VOLUME) || 1);
		} catch (err) {
			console.warn(err);
		}
	};

	const handleVolume = () => {
		setLocalStorage(PLAYER_VOLUME, playerRef.current.muted() ? 0 : playerRef.current.volume());
	};

	const togglePlayback = () => {
		if (playerRef.current.paused()) {
			playerRef.current.play();
		} else {
			playerRef.current.pause();
		}
	};

	const toggleMute = () => {
		if (playerRef.current.muted() || playerRef.current.volume() === 0) {
			playerRef.current.volume(0.7);
		} else {
			playerRef.current.volume(0);
		}
	};

	const toggleFullScreen = () => {
		if (playerRef.current.isFullscreen()) {
			playerRef.current.exitFullscreen();
		} else {
			playerRef.current.requestFullscreen();
		}
	};

	const setupAirplay = (player, videojs) => {
		if (Object.hasOwn(window, 'WebKitPlaybackTargetAvailabilityEvent')) {
			const VJSButtonClass = videojs.getComponent('Button');

			class ConcreteButtonClass extends VJSButtonClass {
				constructor() {
					super(player);
				}

				handleClick() {
					try {
						const videoElement = document.getElementsByTagName('video')[0];
						(videoElement as any).webkitShowPlaybackTargetPicker();
					} catch (e) {
						console.error(e);
					}
				}
			}

			const ccbc = new ConcreteButtonClass();
			const concreteButtonInstance = player.controlBar.addChild(ccbc);
			concreteButtonInstance.addClass('vjs-airplay');
		}
	};

	// Register keyboard shortcut for the space bar to toggle playback
	useHotkeys('space', e => {
		e.preventDefault();
		togglePlayback();
	});

	// Register keyboard shortcut for f to toggle full screen
	useHotkeys('f', toggleFullScreen, {
		enableOnContentEditable: false,
	});

	// Register keyboard shortcut for the "m" key to toggle mute
	useHotkeys('m', toggleMute, {
		enableOnContentEditable: false,
	});

	useHotkeys('0', () => playerRef.current.volume(playerRef.current.volume() + 0.1), {
		enableOnContentEditable: false,
	});
	useHotkeys('9', () => playerRef.current.volume(playerRef.current.volume() - 0.1), {
		enableOnContentEditable: false,
	});

	// Measure the actually-decoded resolution and frame rate for the protocol
	// badge, mirroring what the WebRTC player reports via getStats().
	useEffect(() => {
		if (!videoPlaying) {
			return undefined;
		}
		let lastFrames = 0;
		let lastTime = 0;
		const timer = setInterval(() => {
			const el = videoElRef.current;
			if (!el || !el.videoHeight) {
				return;
			}
			const now = performance.now();
			const quality = (
				el as HTMLVideoElement & {
					getVideoPlaybackQuality?: () => { totalVideoFrames: number };
				}
			).getVideoPlaybackQuality?.();
			const frames = quality?.totalVideoFrames ?? 0;
			// Real measured latency (segment PROGRAM-DATE-TIME vs skew-corrected
			// clock) sampled by the playback metrics collector every ~5s.
			const latencyMs = playbackMetrics?.currentLatencyMs || 0;
			if (lastTime > 0 && frames > lastFrames) {
				const fps = Math.round(((frames - lastFrames) * 1000) / (now - lastTime));
				setVideoStats({ height: el.videoHeight, fps, latencyMs });
			} else {
				setVideoStats(prev => ({ height: el.videoHeight, fps: prev?.fps ?? 0, latencyMs }));
			}
			lastFrames = frames;
			lastTime = now;
		}, 2000);
		return () => clearInterval(timer);
	}, [videoPlaying]);

	// e.g. "3.2s · 1080p60" once measured; falls back to the protocol's
	// static estimate until the first latency sample arrives.
	const measuredLatency =
		videoStats?.latencyMs && videoStats.latencyMs > 0
			? `${(videoStats.latencyMs / 1000).toFixed(1)}s`
			: null;
	const badgeProtocol = protocol
		? {
				...protocol,
				expectedLatency: videoStats
					? `${measuredLatency ?? protocol.expectedLatency} · ${videoStats.height}p${
							videoStats.fps || ''
						}`
					: protocol.expectedLatency,
			}
		: protocol;

	const videoJsOptions = {
		// Start playback automatically while live: try with sound first and
		// fall back to muted when the browser's autoplay policy demands it
		// (the native controls then offer one-tap unmute). If both are
		// blocked the click-to-play poster remains as the fallback.
		autoplay: 'any',
		// The video.js chrome is disabled in favor of the browser's native
		// <video controls> UI so live playback looks identical to the WebRTC
		// player (operator preference). video.js still drives HLS via VHS.
		controls: false,
		bigPlayButton: false,
		responsive: true,
		fluid: false,
		fill: true,
		playsinline: true,
		liveui: true,
		preload: 'auto',
		muted: initiallyMuted,
		html5: {
			vhs: {
				// used to select the lowest bitrate playlist initially. This helps to decrease playback start time. This setting is false by default.
				enableLowInitialPlaylist: true,
				experimentalBufferBasedABR: true,
				useNetworkInformationApi: true,
				maxPlaylistRetries: 30,
				// Low-latency settings
				llhls: true,
				liveSyncDurationCount: 2, // Sync to 2 segments behind live edge
				liveMaxLatencyDurationCount: 4, // Max 4 segments behind
			},
		},
		liveTracker: {
			trackingThreshold: 0,
			liveTolerance: 3, // Reduced from 15 to 3 seconds for low latency
		},
		sources: [
			{
				src: source,
				type: 'application/x-mpegURL',
			},
		],
	};

	const handlePlayerReady = (player, videojs) => {
		playerRef.current = player;
		setSavedVolume();

		// Native browser controls on the underlying <video>, matching the
		// WebRTC player's lightweight look (play/pause, volume, fullscreen,
		// PiP all come from the browser).
		const videoEl = player.el()?.querySelector('video');
		if (videoEl) {
			videoEl.setAttribute('controls', '');
			videoElRef.current = videoEl as HTMLVideoElement;
		}

		setupAirplay(player, videojs);

		// You can handle player events here, for example:
		player.on('waiting', () => {
			console.debug('player is waiting');
		});

		player.on('dispose', () => {
			console.debug('player will dispose');
			ping.stop();
		});

		player.on('playing', () => {
			console.debug('player is playing');
			ping.start();
			setVideoPlaying(true);
		});

		player.on('pause', () => {
			console.debug('player is paused');
			ping.stop();
			setVideoPlaying(false);
		});

		player.on('ended', () => {
			console.debug('player is ended');
			ping.stop();
			setVideoPlaying(false);
		});

		videojs.hookOnce();

		player.on('volumechange', handleVolume);

		playbackMetrics = new PlaybackMetrics(player, videojs);
		playbackMetrics.setClockSkew(clockSkew);

	};

	useEffect(() => {
		if (playbackMetrics) {
			playbackMetrics.setClockSkew(clockSkew);
		}
	}, [clockSkew]);

	useEffect(
		() => () => {
			playbackMetrics?.stop();
			// Unmounting disposes the player without a 'pause' event, so reset
			// the global playing flag here — otherwise the click-to-play poster
			// stays hidden when the player mounts again after a mode switch.
			setVideoPlaying(false);
		},
		[],
	);

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="OwncastPlayer"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div
				className={classNames(styles.container, className, embedded && styles.embedded)}
				id="player"
			>
				{online && (
					<>
						<div className={styles.player}>
							<VideoJS options={videoJsOptions} onReady={handlePlayerReady} aria-label={title} />
							<ProtocolBadge protocol={badgeProtocol} />
						</div>
					</>
				)}
				{/* The poster overlays the player until playback starts. With native
				    browser controls (no video.js big-play button on top of it) the
				    poster itself is the click-to-play trigger. */}
				{!videoPlaying && (
					<button
						type="button"
						className={styles.poster}
						onClick={() => playerRef.current?.play()}
						aria-label="Play"
					>
						{/* The thumbnail endpoint gates restricted streams (silent mode,
					    required social auth) on an accessToken query parameter; plain
					    <img> requests don't go through the VideoJS request hook, so
					    the token is appended here. Without it the poster falls back
					    to the logo even for authorized viewers. */}
					<VideoPoster online={online} initialSrc={posterSrc} src={posterSrc} />
						{online && (
							<span className={styles.posterPlayGlyph} aria-hidden="true">
								▶
							</span>
						)}
					</button>
				)}
			</div>
		</ErrorBoundary>
	);
};
export default OwncastPlayer;
