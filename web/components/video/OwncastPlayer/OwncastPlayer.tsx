import React, { FC, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import Hls from 'hls.js';
import { VideoJS } from '../VideoJS/VideoJS';
import ViewerPing from '../viewer-ping';
import { VideoPoster } from '../VideoPoster/VideoPoster';
import {
	getLocalStorage,
	setLocalStorage,
	PLAYER_VOLUME,
	PLAYER_QUALITY,
} from '../../../utils/localStorage';
import { useIsVideoPlaying, useSetIsVideoPlaying } from '../../stores/zustand-store';
import styles from './OwncastPlayer.module.scss';
import { ComponentError } from '../../ui/ComponentError/ComponentError';
import { ProtocolBadge } from '../ProtocolBadge';
import { ProtocolInfo } from '../../../interfaces/server-status.model';

const ping = new ViewerPing();

export type OwncastPlayerProps = {
	source: string;
	online: boolean;
	initiallyMuted?: boolean;
	title: string;
	className?: string;
	embedded?: boolean;
	protocol?: ProtocolInfo;
};

// Append the chat access token (and a cachebuster on playlists) to same-origin
// HLS requests so moderators can watch during silent (test) mode and viewers
// can watch auth-required streams. Never sent to external CDN hosts.
const decorateHlsUrl = (url: string): string => {
	try {
		const u = new URL(url, window.location.origin);
		if (u.origin !== window.location.origin) {
			return url;
		}
		const isHls = u.pathname.startsWith('/hls/') || u.pathname.startsWith('/api/archives/');
		if (!isHls) {
			return url;
		}
		const token = window.localStorage.getItem('accessToken');
		if (token) {
			u.searchParams.set('accessToken', token);
		}
		if (u.pathname.endsWith('.m3u8')) {
			u.searchParams.set('cachebust', Math.random().toString(16).slice(2, 10));
		}
		return u.toString();
	} catch {
		return url;
	}
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
	// hls.js is the playback engine (mature Low-Latency HLS support with real
	// EXT-X-PART / blocking reload); video.js provides only the control-bar UI.
	const hlsRef = React.useRef<Hls | null>(null);
	const videoPlaying = useIsVideoPlaying();
	const setVideoPlaying = useSetIsVideoPlaying();

	// Manual quality selection, shown as a "Quality" menu button in the control
	// bar. Default is Auto (hls.js ABR); a pinned choice persists.
	const selectedQualityRef = React.useRef<string>(getLocalStorage(PLAYER_QUALITY) || 'auto');
	const qualityButtonRef = React.useRef<{ update: () => void } | null>(null);

	// Distinct rendition heights advertised by the manifest, high to low.
	const getQualityHeights = (): number[] => {
		const seen = new Set<number>();
		return (hlsRef.current?.levels || [])
			.map(l => l.height)
			.filter((h): h is number => typeof h === 'number' && h > 0)
			.sort((a, b) => b - a)
			.filter(h => (seen.has(h) ? false : seen.add(h)));
	};

	// Pin a specific rendition (by height) or return to Auto (-1).
	const applyQuality = (value: string) => {
		const hls = hlsRef.current;
		if (hls) {
			if (value === 'auto') {
				hls.currentLevel = -1;
			} else {
				const height = Number(value);
				// Highest-bitrate level at this height.
				let best = -1;
				let bestRate = -1;
				hls.levels.forEach((l, i) => {
					if (l.height === height && l.bitrate > bestRate) {
						best = i;
						bestRate = l.bitrate;
					}
				});
				if (best >= 0) {
					hls.currentLevel = best;
				}
			}
		}
		selectedQualityRef.current = value;
		setLocalStorage(PLAYER_QUALITY, value);
		qualityButtonRef.current?.update();
	};

	// Re-assert a pinned choice (e.g. after the level list is (re)parsed) and
	// rebuild the control-bar menu.
	const refreshQualityLevels = () => {
		const sel = selectedQualityRef.current;
		if (sel !== 'auto') {
			applyQuality(sel);
		}
		qualityButtonRef.current?.update();
	};

	// Add the "Quality" menu button to the control bar before the fullscreen
	// toggle. It shows the current quality as visible text (Auto / 720p).
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

	// Pre-play cover: the operator's live poster.
	const posterSrc = '/liveposter';
	const [videoStats, setVideoStats] = React.useState<{
		height: number;
		fps: number;
		latencyMs?: number;
	} | null>(null);

	const setSavedVolume = () => {
		try {
			const saved = getLocalStorage(PLAYER_VOLUME);
			playerRef.current.volume(saved !== null && saved !== '' ? Number(saved) : 0.3);
		} catch (err) {
			console.warn(err);
		}
	};

	const handleVolume = () => {
		setLocalStorage(PLAYER_VOLUME, playerRef.current.muted() ? 0 : playerRef.current.volume());
	};

	const togglePlayback = () => {
		if (playerRef.current?.paused()) {
			playerRef.current.play();
		} else {
			playerRef.current?.pause();
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

	useHotkeys('space', e => {
		e.preventDefault();
		togglePlayback();
	});
	useHotkeys('f', toggleFullScreen, { enableOnContentEditable: false });
	useHotkeys('m', toggleMute, { enableOnContentEditable: false });
	useHotkeys('0', () => playerRef.current.volume(playerRef.current.volume() + 0.1), {
		enableOnContentEditable: false,
	});
	useHotkeys('9', () => playerRef.current.volume(playerRef.current.volume() - 0.1), {
		enableOnContentEditable: false,
	});

	// Measure the actually-decoded resolution/fps and the hls.js live latency for
	// the protocol badge.
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
			// hls.js reports the real live latency (segment/part edge vs playhead).
			const latencyMs = hlsRef.current?.latency ? Math.round(hlsRef.current.latency * 1000) : 0;
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
		// hls.js drives playback; video.js only renders the control bar, so it
		// gets no source and doesn't autoplay itself.
		autoplay: false,
		controls: true,
		bigPlayButton: false,
		responsive: true,
		fluid: false,
		fill: true,
		playsinline: true,
		liveui: true,
		preload: 'auto',
		muted: initiallyMuted,
	};

	const attemptPlay = () => {
		const el = videoElRef.current;
		if (!el) {
			return;
		}
		el.play().catch(() => {
			// Autoplay with sound was blocked; retry muted so playback still starts.
			el.muted = true;
			el.play().catch(() => {});
		});
	};

	const handlePlayerReady = (player, videojs) => {
		playerRef.current = player;
		setSavedVolume();

		const videoEl = player.el()?.querySelector('video') as HTMLVideoElement | null;
		if (!videoEl) {
			return;
		}
		videoElRef.current = videoEl;

		setupAirplay(player, videojs);
		setupQualityMenu(player, videojs);

		player.on('dispose', () => {
			ping.stop();
			hlsRef.current?.destroy();
			hlsRef.current = null;
		});
		player.on('playing', () => {
			ping.start();
			setVideoPlaying(true);
		});
		player.on('pause', () => {
			ping.stop();
			setVideoPlaying(false);
		});
		player.on('ended', () => {
			ping.stop();
			setVideoPlaying(false);
		});
		player.on('volumechange', handleVolume);
		videojs.hookOnce();

		if (Hls.isSupported()) {
			const hls = new Hls({
				lowLatencyMode: true,
				backBufferLength: 15,
				liveDurationInfinity: true,
				xhrSetup: (xhr: XMLHttpRequest, url: string) => {
					const decorated = decorateHlsUrl(url);
					if (decorated !== url) {
						xhr.open('GET', decorated, true);
					}
				},
			});
			hlsRef.current = hls;
			hls.attachMedia(videoEl);
			hls.on(Hls.Events.MEDIA_ATTACHED, () => {
				hls.loadSource(source);
			});
			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				refreshQualityLevels();
				attemptPlay();
			});
			hls.on(Hls.Events.LEVEL_SWITCHED, () => {
				qualityButtonRef.current?.update();
			});
			hls.on(Hls.Events.ERROR, (_evt, data) => {
				if (!data.fatal) {
					return;
				}
				switch (data.type) {
					case Hls.ErrorTypes.NETWORK_ERROR:
						hls.startLoad();
						break;
					case Hls.ErrorTypes.MEDIA_ERROR:
						hls.recoverMediaError();
						break;
					default:
						console.error('hls.js fatal error', data);
						break;
				}
			});
		} else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
			// Safari plays LL-HLS natively.
			videoEl.src = decorateHlsUrl(source);
			videoEl.addEventListener('loadedmetadata', attemptPlay, { once: true });
		}
	};

	useEffect(
		() => () => {
			hlsRef.current?.destroy();
			hlsRef.current = null;
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
				{!videoPlaying && (
					<button
						type="button"
						className={styles.poster}
						onClick={() => attemptPlay()}
						aria-label="Play"
					>
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
