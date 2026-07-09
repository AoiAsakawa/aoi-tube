import React, { FC, useEffect, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';
import Hls from 'hls.js';
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
		if (!u.pathname.startsWith('/hls/') && !u.pathname.startsWith('/api/archives/')) {
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

// Live HLS player built on a plain <video> element with hls.js as the engine
// (mature Low-Latency HLS: EXT-X-PART + blocking reload) and the browser's
// native controls. video.js is deliberately not used here: it can't track an
// externally-driven MediaSource and left a loading spinner stuck over the
// playback. Quality selection is a small overlay bound to hls.js levels.
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
	const videoRef = useRef<HTMLVideoElement>(null);
	const hlsRef = useRef<Hls | null>(null);
	const videoPlaying = useIsVideoPlaying();
	const setVideoPlaying = useSetIsVideoPlaying();

	const [levels, setLevels] = useState<number[]>([]);
	const selectedQualityRef = useRef<string>(getLocalStorage(PLAYER_QUALITY) || 'auto');
	const [selectedQuality, setSelectedQuality] = useState<string>(selectedQualityRef.current);
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);
	// When Auto steps up to the top rung, this holds that rung's index until the
	// switch lands, at which point ABR is re-enabled (see LEVEL_SWITCHED).
	const autoRecoverTopRef = useRef<number | null>(null);
	const [videoStats, setVideoStats] = useState<{
		height: number;
		fps: number;
		latencyMs?: number;
	} | null>(null);

	const posterSrc = '/liveposter';

	const attemptPlay = () => {
		const el = videoRef.current;
		if (!el) {
			return;
		}
		el.play().catch(() => {
			el.muted = true;
			el.play().catch(() => {});
		});
	};

	const updateLevels = () => {
		const seen = new Set<number>();
		setLevels(
			(hlsRef.current?.levels || [])
				.map(l => l.height)
				.filter((h): h is number => typeof h === 'number' && h > 0)
				.sort((a, b) => b - a)
				.filter(h => (seen.has(h) ? false : seen.add(h))),
		);
	};

	const applyQuality = (value: string) => {
		const hls = hlsRef.current;
		if (hls) {
			if (value === 'auto') {
				// Progressive LL-HLS part delivery pins the running estimate near the
				// current rung's bitrate, so simply re-enabling ABR never climbs back
				// up (a reset estimate is overwritten by the very next part timing).
				// Instead explicitly step up to the top rung, then hand control back to
				// ABR once we're there (handled in LEVEL_SWITCHED) — the widened factors
				// keep it there unless the buffer genuinely starves.
				let topIdx = -1;
				let topH = -1;
				hls.levels.forEach((l, i) => {
					if ((l.height ?? 0) > topH) {
						topH = l.height ?? 0;
						topIdx = i;
					}
				});
				hls.bandwidthEstimate = 10_000_000;
				if (topIdx >= 0 && hls.currentLevel !== topIdx) {
					autoRecoverTopRef.current = topIdx;
					// nextLevel (not currentLevel) so the step-up lands on the next
					// segment boundary without flushing the buffer and spiking latency.
					hls.nextLevel = topIdx;
				} else {
					autoRecoverTopRef.current = null;
					hls.nextLevel = -1;
				}
			} else {
				const height = Number(value);
				let best = -1;
				let bestRate = -1;
				hls.levels.forEach((l, i) => {
					if (l.height === height && l.bitrate > bestRate) {
						best = i;
						bestRate = l.bitrate;
					}
				});
				if (best >= 0) {
					hls.nextLevel = best;
				}
			}
		}
		selectedQualityRef.current = value;
		setSelectedQuality(value);
		setLocalStorage(PLAYER_QUALITY, value);
		setMenuOpen(false);
	};

	// Set up hls.js (or native HLS) on the plain <video> element.
	useEffect(() => {
		if (!online) {
			return undefined;
		}
		const video = videoRef.current;
		if (!video) {
			return undefined;
		}
		const savedVol = getLocalStorage(PLAYER_VOLUME);
		video.volume = savedVol !== null && savedVol !== '' ? Number(savedVol) : 0.3;

		if (Hls.isSupported()) {
			const hls = new Hls({
				lowLatencyMode: true,
				backBufferLength: 15,
				liveDurationInfinity: true,
				// LL-HLS delivers parts progressively, so hls.js measures a throughput
				// of roughly the CURRENT rendition's bitrate rather than the true link
				// capacity. With the default up/down factors (0.7/0.95) every rung then
				// looks unsustainable and ABR cascades down to 360p and can't climb
				// back. Seed a high initial estimate and widen the factors to 1.4 so a
				// rung whose bitrate is at or just above the measured throughput still
				// counts as sustainable — a genuinely starved link is still dropped by
				// the buffer-starvation path.
				abrEwmaDefaultEstimate: 10_000_000,
				abrBandWidthFactor: 1.4,
				abrBandWidthUpFactor: 1.4,
				xhrSetup: (xhr: XMLHttpRequest, url: string) => {
					const decorated = decorateHlsUrl(url);
					if (decorated !== url) {
						xhr.open('GET', decorated, true);
					}
				},
			});
			hlsRef.current = hls;
			hls.attachMedia(video);
			hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(source));
			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				updateLevels();
				if (selectedQualityRef.current !== 'auto') {
					applyQuality(selectedQualityRef.current);
				}
				attemptPlay();
			});
			hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
				updateLevels();
				// Once the Auto step-up reaches the top rung, re-enable ABR so it can
				// still drop on genuine starvation instead of staying hard-pinned.
				if (autoRecoverTopRef.current !== null && data.level === autoRecoverTopRef.current) {
					autoRecoverTopRef.current = null;
					hls.nextLevel = -1;
				}
			});
			hls.on(Hls.Events.ERROR, (_evt, data) => {
				if (!data.fatal) {
					return;
				}
				if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
					hls.startLoad();
				} else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
					hls.recoverMediaError();
				} else {
					console.error('hls.js fatal error', data);
				}
			});
		} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
			video.src = decorateHlsUrl(source);
			video.addEventListener('loadedmetadata', attemptPlay, { once: true });
		}

		return () => {
			hlsRef.current?.destroy();
			hlsRef.current = null;
			ping.stop();
			setVideoPlaying(false);
		};
	}, [online, source]);

	// Close the quality menu on an outside click.
	useEffect(() => {
		if (!menuOpen) {
			return undefined;
		}
		const onDown = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, [menuOpen]);

	// Resolution/fps + hls.js live latency for the protocol badge.
	useEffect(() => {
		if (!videoPlaying) {
			return undefined;
		}
		let lastFrames = 0;
		let lastTime = 0;
		const timer = setInterval(() => {
			const el = videoRef.current;
			if (!el || !el.videoHeight) {
				return;
			}
			const now = performance.now();
			const q = (
				el as HTMLVideoElement & {
					getVideoPlaybackQuality?: () => { totalVideoFrames: number };
				}
			).getVideoPlaybackQuality?.();
			const frames = q?.totalVideoFrames ?? 0;
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

	useHotkeys('space', e => {
		e.preventDefault();
		const el = videoRef.current;
		if (el) {
			if (el.paused) {
				attemptPlay();
			} else {
				el.pause();
			}
		}
	});
	useHotkeys('f', () => videoRef.current?.requestFullscreen?.(), { enableOnContentEditable: false });
	useHotkeys(
		'm',
		() => {
			const el = videoRef.current;
			if (el) {
				el.muted = !el.muted;
			}
		},
		{ enableOnContentEditable: false },
	);

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

	const qualityLabel =
		selectedQuality === 'auto' ? t('video.qualitySelector.auto') : `${selectedQuality}p`;

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
					<div className={styles.player}>
						<video
							ref={videoRef}
							className={styles.video}
							controls
							autoPlay
							playsInline
							muted={initiallyMuted}
							aria-label={title}
							onPlaying={() => {
								ping.start();
								setVideoPlaying(true);
							}}
							onPause={() => {
								ping.stop();
								setVideoPlaying(false);
							}}
							onEnded={() => {
								ping.stop();
								setVideoPlaying(false);
							}}
							onVolumeChange={() => {
								const el = videoRef.current;
								if (el) {
									setLocalStorage(PLAYER_VOLUME, el.muted ? 0 : el.volume);
								}
							}}
						/>
						<ProtocolBadge protocol={badgeProtocol} />
						{videoPlaying && levels.length > 1 && (
							<div className={styles.qualityMenu} ref={menuRef}>
								<button
									type="button"
									className={styles.qualityButton}
									aria-haspopup="menu"
									aria-expanded={menuOpen}
									aria-label={t('video.qualitySelector.label')}
									onClick={() => setMenuOpen(open => !open)}
								>
									{qualityLabel}
								</button>
								{menuOpen && (
									<ul className={styles.qualityList} role="menu">
										<li role="none">
											<button
												type="button"
												role="menuitemradio"
												aria-checked={selectedQuality === 'auto'}
												className={classNames(styles.qualityItem, {
													[styles.qualityItemActive]: selectedQuality === 'auto',
												})}
												onClick={() => applyQuality('auto')}
											>
												{t('video.qualitySelector.auto')}
											</button>
										</li>
										{levels.map(h => (
											<li role="none" key={h}>
												<button
													type="button"
													role="menuitemradio"
													aria-checked={selectedQuality === String(h)}
													className={classNames(styles.qualityItem, {
														[styles.qualityItemActive]: selectedQuality === String(h),
													})}
													onClick={() => applyQuality(String(h))}
												>
													{`${h}p`}
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						)}
					</div>
				)}
				{!videoPlaying && (
					<button
						type="button"
						className={styles.poster}
						onClick={attemptPlay}
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
