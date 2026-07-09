import React, { FC, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import styles from './PlayerChrome.module.scss';

export interface QualityOption {
	label: string;
	value: string;
}

export interface PlayerChromeProps {
	// The <video> the parent player owns; the chrome reads and controls it.
	videoRef: RefObject<HTMLVideoElement | null>;
	// Live streams get a LIVE badge and no seek bar; VOD gets a seekable timeline.
	isLive?: boolean;
	// ABR qualities (HLS). Omitted for single-quality sources (WebRTC / MP4 VOD).
	qualities?: QualityOption[];
	selectedQuality?: string;
	onSelectQuality?: (value: string) => void;
	// Playback speeds (VOD only).
	rates?: number[];
	playbackRate?: number;
	onSelectRate?: (rate: number) => void;
}

const formatTime = (seconds: number): string => {
	if (!Number.isFinite(seconds) || seconds < 0) {
		return '0:00';
	}
	const s = Math.floor(seconds % 60);
	const m = Math.floor((seconds / 60) % 60);
	const h = Math.floor(seconds / 3600);
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

// Minimal inline icons in the YouTube visual idiom (single white glyphs).
const Icon: FC<{ path: string; label?: string }> = ({ path, label }) => (
	<svg viewBox="0 0 36 36" width="100%" height="100%" aria-hidden={label ? undefined : true} focusable="false">
		<path d={path} fill="currentColor" />
	</svg>
);

const P = {
	play: 'M12 26h2.5L26 18 14.5 10H12v16z',
	pause: 'M12 10h4v16h-4zm8 0h4v16h-4z',
	volHigh:
		'M8 15v6h4l5 5V10l-5 5H8zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM18 6.5v2.1a7 7 0 0 1 0 13.8v2.1a9 9 0 0 0 0-18z',
	volMute: 'M8 15v6h4l5 5V10l-5 5H8zm18.5 3-2.3-2.3-1.4 1.4L25.1 20l-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4L27.9 20l2.3-2.3-1.4-1.4-2.3 2.3z',
	settings:
		'M18 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm9-4c0-.7-.1-1.3-.2-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.5L11.2 16c-.1.7-.2 1.3-.2 2s.1 1.3.2 2L9 21.6l2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L26.8 20c.1-.7.2-1.3.2-2z',
	fsEnter: 'M10 16h2v-4h4v-2h-6v6zm0 4v6h6v-2h-4v-4h-2zm16 4h-4v2h6v-6h-2v4zm-4-14v2h4v4h2v-6h-6z',
	fsExit: 'M14 14h-4v2h6v-6h-2v4zm-4 8h4v4h2v-6h-6v2zm12 4h2v-4h4v-2h-6v6zm2-12v-4h-2v6h6v-2h-4z',
};

// YouTube-style control chrome shared by the live HLS, WebRTC and VOD players.
// It overlays the parent's <video> (which must be rendered without the native
// `controls` attribute) and drives it via events, so all three players present
// one identical UI. Fullscreen targets the container (this overlay's parent) so
// the controls are included.
export const PlayerChrome: FC<PlayerChromeProps> = ({
	videoRef,
	isLive = false,
	qualities,
	selectedQuality,
	onSelectQuality,
	rates,
	playbackRate = 1,
	onSelectRate,
}) => {
	const rootRef = useRef<HTMLDivElement>(null);
	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrubbing = useRef(false);

	const [playing, setPlaying] = useState(false);
	const [waiting, setWaiting] = useState(false);
	const [muted, setMuted] = useState(false);
	const [volume, setVolume] = useState(1);
	const [current, setCurrent] = useState(0);
	const [duration, setDuration] = useState(0);
	const [buffered, setBuffered] = useState(0);
	const [fullscreen, setFullscreen] = useState(false);
	const [visible, setVisible] = useState(true);
	const [menu, setMenu] = useState<null | 'root' | 'quality' | 'speed'>(null);

	// Subscribe to the media element.
	useEffect(() => {
		const v = videoRef.current;
		if (!v) {
			return undefined;
		}
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		const onWaiting = () => setWaiting(true);
		const onPlaying = () => {
			setWaiting(false);
			setPlaying(true);
		};
		const onTime = () => {
			if (!scrubbing.current) {
				setCurrent(v.currentTime);
			}
		};
		const onDur = () => setDuration(Number.isFinite(v.duration) ? v.duration : 0);
		const onVol = () => {
			setMuted(v.muted);
			setVolume(v.volume);
		};
		const onProgress = () => {
			try {
				if (v.buffered.length > 0) {
					setBuffered(v.buffered.end(v.buffered.length - 1));
				}
			} catch {
				/* buffered can throw if not ready */
			}
		};
		v.addEventListener('play', onPlay);
		v.addEventListener('pause', onPause);
		v.addEventListener('waiting', onWaiting);
		v.addEventListener('playing', onPlaying);
		v.addEventListener('timeupdate', onTime);
		v.addEventListener('durationchange', onDur);
		v.addEventListener('loadedmetadata', onDur);
		v.addEventListener('volumechange', onVol);
		v.addEventListener('progress', onProgress);
		// Seed initial state.
		setPlaying(!v.paused);
		setMuted(v.muted);
		setVolume(v.volume);
		onDur();
		return () => {
			v.removeEventListener('play', onPlay);
			v.removeEventListener('pause', onPause);
			v.removeEventListener('waiting', onWaiting);
			v.removeEventListener('playing', onPlaying);
			v.removeEventListener('timeupdate', onTime);
			v.removeEventListener('durationchange', onDur);
			v.removeEventListener('loadedmetadata', onDur);
			v.removeEventListener('volumechange', onVol);
			v.removeEventListener('progress', onProgress);
		};
	}, [videoRef]);

	// Track fullscreen changes (Esc, native button, etc.).
	useEffect(() => {
		const onFs = () => setFullscreen(document.fullscreenElement === rootRef.current?.parentElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	}, []);

	const showControls = useCallback(() => {
		setVisible(true);
		if (hideTimer.current) {
			clearTimeout(hideTimer.current);
		}
		hideTimer.current = setTimeout(() => {
			if (!videoRef.current?.paused && !menu) {
				setVisible(false);
			}
		}, 3000);
	}, [menu, videoRef]);

	const togglePlay = useCallback(() => {
		const v = videoRef.current;
		if (!v) {
			return;
		}
		if (v.paused) {
			// Play with sound; a click is a user gesture so unmuted play is allowed.
			v.play().catch(() => {});
		} else {
			v.pause();
		}
	}, [videoRef]);

	const toggleMute = () => {
		const v = videoRef.current;
		if (v) {
			v.muted = !v.muted;
		}
	};

	const setVol = (value: number) => {
		const v = videoRef.current;
		if (v) {
			v.volume = value;
			v.muted = value === 0;
		}
	};

	const seekFromClient = (clientX: number) => {
		const v = videoRef.current;
		const bar = rootRef.current?.querySelector(`.${styles.progress}`) as HTMLElement | null;
		if (!v || !bar || !duration) {
			return;
		}
		const rect = bar.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const t = ratio * duration;
		setCurrent(t);
		v.currentTime = t;
	};

	const onScrubStart = (e: React.PointerEvent) => {
		if (isLive) {
			return;
		}
		scrubbing.current = true;
		seekFromClient(e.clientX);
		const move = (ev: PointerEvent) => seekFromClient(ev.clientX);
		const up = () => {
			scrubbing.current = false;
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	};

	const toggleFullscreen = () => {
		const container = rootRef.current?.parentElement;
		if (!container) {
			return;
		}
		if (document.fullscreenElement) {
			document.exitFullscreen?.();
		} else {
			container.requestFullscreen?.();
		}
	};

	const playedPct = duration ? (current / duration) * 100 : 0;
	const bufferedPct = duration ? (buffered / duration) * 100 : 0;
	const volPct = muted ? 0 : volume;

	const qualityLabel =
		qualities && selectedQuality
			? (qualities.find(q => q.value === selectedQuality)?.label ?? selectedQuality)
			: '';

	return (
		<div
			ref={rootRef}
			className={classNames(styles.root, { [styles.hidden]: !visible && playing })}
			onMouseMove={showControls}
			onMouseLeave={() => {
				if (playing && !menu) {
					setVisible(false);
				}
			}}
			onClick={e => {
				// Clicks on the surface (not the bar/menu) toggle play.
				if (e.target === rootRef.current || (e.target as HTMLElement).dataset.surface) {
					togglePlay();
					showControls();
				}
			}}
			onDoubleClick={e => {
				if (e.target === rootRef.current || (e.target as HTMLElement).dataset.surface) {
					toggleFullscreen();
				}
			}}
		>
			{/* Click surface covering the video. */}
			<div className={styles.surface} data-surface="true" />

			{/* Center big play / buffering spinner. */}
			{!playing && !waiting && (
				<button type="button" className={styles.bigPlay} onClick={togglePlay} aria-label="再生">
					<span className={styles.bigPlayGlyph}>
						<Icon path={P.play} label="再生" />
					</span>
				</button>
			)}
			{waiting && <div className={styles.spinner} aria-hidden="true" />}

			<div className={styles.gradient} />

			<div className={classNames(styles.bar, { [styles.barHidden]: !visible && playing })}>
				{!isLive && (
					<div className={styles.progress} onPointerDown={onScrubStart}>
						<div className={styles.progressBuffered} style={{ width: `${bufferedPct}%` }} />
						<div className={styles.progressPlayed} style={{ width: `${playedPct}%` }}>
							<span className={styles.progressThumb} />
						</div>
					</div>
				)}

				<div className={styles.controls}>
					<div className={styles.left}>
						<button type="button" className={styles.iconBtn} onClick={togglePlay} aria-label={playing ? '一時停止' : '再生'}>
							<Icon path={playing ? P.pause : P.play} />
						</button>

						<div className={styles.volume}>
							<button type="button" className={styles.iconBtn} onClick={toggleMute} aria-label={muted ? 'ミュート解除' : 'ミュート'}>
								<Icon path={muted || volume === 0 ? P.volMute : P.volHigh} />
							</button>
							<input
								type="range"
								className={styles.volSlider}
								min={0}
								max={1}
								step={0.05}
								value={volPct}
								onChange={e => setVol(Number(e.target.value))}
								aria-label="音量"
							/>
						</div>

						{isLive ? (
							<span className={styles.live}>
								<span className={styles.liveDot} />
								ライブ
							</span>
						) : (
							<span className={styles.time}>
								{formatTime(current)} / {formatTime(duration)}
							</span>
						)}
					</div>

					<div className={styles.right}>
						{((qualities && qualities.length > 0) || (rates && rates.length > 0)) && (
							<div className={styles.settings}>
								<button
									type="button"
									className={styles.iconBtn}
									onClick={() => setMenu(m => (m ? null : 'root'))}
									aria-label="設定"
									aria-expanded={menu !== null}
								>
									<Icon path={P.settings} />
								</button>

								{menu && (
									<div className={styles.menu} role="menu">
										{menu === 'root' && (
											<>
												{qualities && qualities.length > 0 && (
													<button type="button" className={styles.menuRow} onClick={() => setMenu('quality')}>
														<span>画質</span>
														<span className={styles.menuValue}>{qualityLabel}</span>
													</button>
												)}
												{rates && rates.length > 0 && (
													<button type="button" className={styles.menuRow} onClick={() => setMenu('speed')}>
														<span>再生速度</span>
														<span className={styles.menuValue}>{playbackRate}x</span>
													</button>
												)}
											</>
										)}

										{menu === 'quality' && qualities && (
											<>
												<button type="button" className={styles.menuBack} onClick={() => setMenu('root')}>
													‹ 画質
												</button>
												{qualities.map(q => (
													<button
														type="button"
														key={q.value}
														className={classNames(styles.menuItem, {
															[styles.menuItemActive]: q.value === selectedQuality,
														})}
														onClick={() => {
															onSelectQuality?.(q.value);
															setMenu(null);
														}}
													>
														{q.label}
													</button>
												))}
											</>
										)}

										{menu === 'speed' && rates && (
											<>
												<button type="button" className={styles.menuBack} onClick={() => setMenu('root')}>
													‹ 再生速度
												</button>
												{rates.map(r => (
													<button
														type="button"
														key={r}
														className={classNames(styles.menuItem, {
															[styles.menuItemActive]: r === playbackRate,
														})}
														onClick={() => {
															onSelectRate?.(r);
															setMenu(null);
														}}
													>
														{r === 1 ? '標準' : `${r}x`}
													</button>
												))}
											</>
										)}
									</div>
								)}
							</div>
						)}

						<button type="button" className={styles.iconBtn} onClick={toggleFullscreen} aria-label="全画面">
							<Icon path={fullscreen ? P.fsExit : P.fsEnter} />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default PlayerChrome;
