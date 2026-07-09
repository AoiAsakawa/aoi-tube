import React, { FC, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import { VideoJS } from '../VideoJS/VideoJS';
import ViewerPing from '../viewer-ping';
import { VideoPoster } from '../VideoPoster/VideoPoster';
import {
	getLocalStorage,
	setLocalStorage,
	PLAYER_VOLUME,
	PLAYER_QUALITY,
} from '../../../utils/localStorage';
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
	const { t } = useTranslation();
	const playerRef = React.useRef(null);
	const videoElRef = React.useRef<HTMLVideoElement | null>(null);
	const videoPlaying = useIsVideoPlaying();
	const setVideoPlaying = useSetIsVideoPlaying();
	const clockSkew = useClockSkew();

	// Manual quality (rendition) selection, presented as a "Quality" menu button
	// in the video.js control bar next to volume/fullscreen (YouTube-style). VHS
	// auto-ABR can pin playback to a low rendition or hop to the heavy
	// source-passthrough (occasionally desyncing A/V), so viewers get explicit
	// Auto / 1080p / 720p / 360p choices on top of ABR. The selection lives in a
	// ref (read from inside the video.js component, avoiding stale closures) and
	// persists to localStorage; 'auto' re-enables every rendition.
	const selectedQualityRef = React.useRef<string>(getLocalStorage(PLAYER_QUALITY) || 'auto');
	const qualityButtonRef = React.useRef<{ update: () => void } | null>(null);

	// Read the VHS representation list off the active tech, tolerating the
	// pre-metadata window where it is not yet populated.
	const getRepresentations = (): {
		height?: number;
		enabled: (value?: boolean) => boolean;
	}[] => {
		try {
			const tech = playerRef.current?.tech?.({ IWillNotUseThisInPlugins: true });
			return tech?.vhs?.representations?.() || [];
		} catch {
			return [];
		}
	};

	// Distinct rendition heights advertised by the master playlist, high to low.
	const getQualityHeights = (): number[] => {
		const seen = new Set<number>();
		return getRepresentations()
			.map(r => r.height)
			.filter((h): h is number => typeof h === 'number' && h > 0)
			.sort((a, b) => b - a)
			.filter(h => (seen.has(h) ? false : seen.add(h)));
	};

	// Enable only the representation(s) matching the chosen height, or all of
	// them for 'auto'. Persist the choice so a pinned quality survives reloads.
	const applyQuality = (value: string) => {
		const reps = getRepresentations();
		if (value === 'auto') {
			reps.forEach(r => r.enabled(true));
		} else {
			const height = Number(value);
			reps.forEach(r => r.enabled(r.height === height));
		}
		selectedQualityRef.current = value;
		setLocalStorage(PLAYER_QUALITY, value);
		qualityButtonRef.current?.update();
	};

	// Re-assert a pinned choice after a manifest reload (the representation
	// objects are recreated) and rebuild the control-bar menu from the current
	// levels.
	const refreshQualityLevels = () => {
		const pinned = selectedQualityRef.current;
		if (pinned !== 'auto') {
			const height = Number(pinned);
			const reps = getRepresentations();
			if (reps.some(r => r.height === height)) {
				reps.forEach(r => r.enabled(r.height === height));
			}
		}
		qualityButtonRef.current?.update();
	};

	// Add a "Quality" menu button to the control bar, just before the fullscreen
	// toggle, so it sits alongside volume/fullscreen like YouTube. The button
	// shows the current quality as a visible text label (a bare cog glyph proved
	// too small to notice) e.g. "Auto" / "720p".
	const setupQualityMenu = (player, videojs) => {
		const MenuButton = videojs.getComponent('MenuButton');
		const MenuItem = videojs.getComponent('MenuItem');
		const autoLabel = t('video.qualitySelector.auto');
		const menuLabel = t('video.qualitySelector.label');

		const qualityText = () =>
			selectedQualityRef.current === 'auto' ? autoLabel : `${selectedQualityRef.current}p`;

		class QualityMenuButton extends MenuButton {
			labelEl_: HTMLElement | null = null;

			constructor() {
				super(player, {});
				this.addClass('vjs-quality-menu');
				this.controlText(menuLabel);
				const placeholder = this.el().querySelector('.vjs-icon-placeholder');
				this.labelEl_ = videojs.dom.createEl('span', {
					className: 'vjs-quality-menu-value',
					textContent: qualityText(),
				});
				(placeholder || this.el()).appendChild(this.labelEl_);
			}

			refreshLabel() {
				if (this.labelEl_) {
					this.labelEl_.textContent = qualityText();
				}
			}

			createItems() {
				const current = selectedQualityRef.current;
				const makeItem = (value: string, label: string) => {
					const item = new MenuItem(player, { label, selectable: true, multiSelectable: false });
					item.selected(value === current);
					item.handleClick = () => applyQuality(value);
					return item;
				};
				const items = [makeItem('auto', autoLabel)];
				getQualityHeights().forEach(h => items.push(makeItem(String(h), `${h}p`)));
				return items;
			}
		}

		const button = new QualityMenuButton();
		qualityButtonRef.current = {
			update: () => {
				button.update();
				button.refreshLabel();
			},
		};
		const { controlBar } = player;
		const fsToggle = controlBar.getChild('fullscreenToggle');
		const index = fsToggle ? controlBar.children().indexOf(fsToggle) : undefined;
		controlBar.addChild(button, {}, index);
	};
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
		// Use the video.js control bar (not the browser's native controls) so the
		// quality selector can sit inline with volume/fullscreen like YouTube;
		// native controls can't host a custom button.
		controls: true,
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
				// Start at a bandwidth-appropriate rendition rather than forcing the
				// lowest one, so playback doesn't get stuck at 360p.
				enableLowInitialPlaylist: false,
				// Buffer-based ABR (rather than per-segment bandwidth ABR): with the
				// 0.5s segments below, bandwidth ABR reacted to every segment's
				// download blip and thrashed 360<->720<->1080. Buffer-based ABR only
				// shifts on sustained buffer trends, so it holds a rendition steadily.
				// It needs real buffer headroom to still climb (the earlier
				// stuck-at-360p was buffer-based ABR starved by a ~1s buffer), which
				// the deeper live window below now provides.
				experimentalBufferBasedABR: true,
				// Don't cap the rendition by the player's rendered pixel size, so 720p
				// and source (1080p) are reachable on a large player.
				limitRenditionByPlayerDimensions: false,
				// Measure real segment-download bandwidth instead of trusting the
				// browser's Network Information estimate, which can report a low
				// downlink and pin quality low.
				useNetworkInformationApi: false,
				maxPlaylistRetries: 30,
				// Low-latency settings. With 0.5s segments, 4 segments back is a ~2s
				// live buffer: enough to stop stalls/rewinds and steady the ABR while
				// keeping latency well under the old 1s-segment config.
				llhls: true,
				liveSyncDurationCount: 4, // ~2s behind the live edge (0.5s segments)
				liveMaxLatencyDurationCount: 8, // Max ~4s behind before catching up
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

		// Keep a handle on the underlying <video> for the resolution/fps probe.
		const videoEl = player.el()?.querySelector('video');
		if (videoEl) {
			videoElRef.current = videoEl as HTMLVideoElement;
		}

		setupAirplay(player, videojs);
		setupQualityMenu(player, videojs);

		// Populate the quality menu once the master playlist is parsed, and keep
		// it in sync as VHS swaps the active media playlist.
		player.on('loadedmetadata', refreshQualityLevels);
		player.on('loadedplaylist', refreshQualityLevels);

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
