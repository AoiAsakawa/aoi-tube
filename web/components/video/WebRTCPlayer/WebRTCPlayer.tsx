import React, { FC, useEffect, useRef, useState, useCallback } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type VideoJsPlayer from 'video.js/dist/types/player';
import { ProtocolBadge } from '../ProtocolBadge';
import { VideoJS } from '../VideoJS/VideoJS';
import ViewerPing from '../viewer-ping';
import { withAccessToken } from '../../../utils/accessTokenUrl';
import { getLocalStorage, setLocalStorage, PLAYER_VOLUME } from '../../../utils/localStorage';
import styles from './WebRTCPlayer.module.scss';

export interface WebRTCPlayerProps {
	serverUrl: string;
	online: boolean;
	className?: string;
	onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

interface WebRTCConfig {
	enabled: boolean;
	iceServers: RTCIceServer[];
}

// Subset of the inbound-rtp video stats we read from getStats(); declared
// locally because lib.dom's RTCStats base type does not carry these fields.
interface InboundVideoStats {
	type: string;
	kind?: string;
	frameHeight?: number;
	framesPerSecond?: number;
}

// Same viewer heartbeat as the HLS player: without it WebRTC-only viewers
// never appeared in the viewer count.
const ping = new ViewerPing();

// Deliberately a plain <video> with native browser controls: the operator
// prefers this lightweight look for the low-latency player over the video.js
// chrome used by standard playback.
export const WebRTCPlayer: FC<WebRTCPlayerProps> = ({
	serverUrl,
	online,
	className,
	onConnectionStateChange,
}) => {
	const { t } = useTranslation();
	// The <video> element is created by video.js; we grab it in onReady and set
	// srcObject on it so the WebRTC MediaStream plays under the video.js control
	// bar (matching the HLS/VOD players). pendingStream holds the stream if it
	// arrives before the player is ready.
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const vjsPlayerRef = useRef<VideoJsPlayer | null>(null);
	const pendingStreamRef = useRef<MediaStream | null>(null);
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	const viewerIdRef = useRef<string | null>(null);
	const mountedRef = useRef(true);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Guard concurrent connects via a ref, not state: keeping it out of the
	// connect callback's dependencies is what prevents an infinite
	// connect→setState→re-render→reconnect loop (which spammed the SFU with
	// throwaway peer connections).
	const isConnectingRef = useRef(false);
	const onStateChangeRef = useRef(onConnectionStateChange);
	const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
	const [error, setError] = useState<string | null>(null);
	// Flipped once video.js has created the <video> element (videoRef is set),
	// so the volume effect below re-runs against the real element.
	const [videoElReady, setVideoElReady] = useState(false);
	const [videoStats, setVideoStats] = useState<{
		height: number;
		fps: number;
		latencyMs?: number;
	} | null>(null);
	// Jitter-buffer running totals from the previous stats sample, for the
	// delta-based average buffer delay in the latency estimate.
	const lastJitterRef = useRef<{ delay: number; count: number } | null>(null);

	// Keep the latest onConnectionStateChange reachable without making it a
	// dependency of the connect callback.
	useEffect(() => {
		onStateChangeRef.current = onConnectionStateChange;
	}, [onConnectionStateChange]);

	const fetchConfig = async (): Promise<WebRTCConfig | null> => {
		try {
			const response = await fetch(withAccessToken(`${serverUrl}/api/webrtc/config`));
			if (!response.ok) {
				throw new Error('WebRTC configuration not available');
			}
			const data = await response.json();
			return {
				enabled: data.enabled,
				iceServers: data.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
			};
		} catch (err) {
			console.error('Failed to fetch WebRTC config:', err);
			return null;
		}
	};

	const disconnect = useCallback(() => {
		if (peerConnectionRef.current) {
			peerConnectionRef.current.close();
			peerConnectionRef.current = null;
		}

		if (viewerIdRef.current) {
			fetch(withAccessToken(`${serverUrl}/api/webrtc/disconnect?viewerId=${viewerIdRef.current}`), {
				method: 'POST',
			}).catch(console.error);
			viewerIdRef.current = null;
		}

		if (videoRef.current) {
			videoRef.current.srcObject = null;
		}

		setConnectionState('closed');
	}, [serverUrl]);

	const connect = useCallback(async () => {
		if (isConnectingRef.current || !online || !mountedRef.current) return;

		isConnectingRef.current = true;
		setError(null);

		try {
			const config = await fetchConfig();
			if (!config?.enabled) {
				setError(t('video.webrtcPlayer.notAvailable'));
				return;
			}

			// Create peer connection
			const pc = new RTCPeerConnection({
				iceServers: config.iceServers,
			});
			peerConnectionRef.current = pc;

			// Handle incoming tracks. The video.js <video> may not exist yet when
			// the track arrives, so stash the stream and apply it in onReady too.
			pc.ontrack = event => {
				const stream = event.streams[0];
				if (!stream) {
					return;
				}
				pendingStreamRef.current = stream;
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
				}
			};

			// Handle connection state changes
			pc.onconnectionstatechange = () => {
				const state = pc.connectionState;
				setConnectionState(state);
				onStateChangeRef.current?.(state);

				if (state === 'failed' || state === 'disconnected') {
					setError(t('video.webrtcPlayer.disconnectedRetrying'));
					if (retryTimerRef.current) {
						clearTimeout(retryTimerRef.current);
					}
					retryTimerRef.current = setTimeout(() => {
						if (mountedRef.current) {
							connect();
						}
					}, 3000);
				}
			};

			// Handle ICE candidates
			pc.onicecandidate = async event => {
				if (event.candidate && viewerIdRef.current) {
					try {
						await fetch(withAccessToken(`${serverUrl}/api/webrtc/ice`), {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								viewerId: viewerIdRef.current,
								candidate: event.candidate.candidate,
								sdpMid: event.candidate.sdpMid,
								sdpMLineIndex: event.candidate.sdpMLineIndex,
							}),
						});
					} catch (err) {
						console.error('Failed to send ICE candidate:', err);
					}
				}
			};

			// Add transceivers for receiving video and audio
			pc.addTransceiver('video', { direction: 'recvonly' });
			pc.addTransceiver('audio', { direction: 'recvonly' });

			// Create offer
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			// Wait for ICE gathering to complete
			await new Promise<void>(resolve => {
				if (pc.iceGatheringState === 'complete') {
					resolve();
				} else {
					pc.onicegatheringstatechange = () => {
						if (pc.iceGatheringState === 'complete') {
							resolve();
						}
					};
				}
			});

			// Send offer to server
			const response = await fetch(withAccessToken(`${serverUrl}/api/webrtc/offer`), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sdp: pc.localDescription?.sdp,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || 'Failed to connect');
			}

			const data = await response.json();
			viewerIdRef.current = data.viewerId;

			// Set remote description (answer from server)
			await pc.setRemoteDescription(
				new RTCSessionDescription({
					type: 'answer',
					sdp: data.sdp,
				}),
			);

			setConnectionState('connecting');
		} catch (err) {
			console.error('WebRTC connection error:', err);
			setError(err instanceof Error ? err.message : t('video.webrtcPlayer.connectionFailed'));
			disconnect();
		} finally {
			isConnectingRef.current = false;
		}
	}, [serverUrl, online, disconnect]);

	useEffect(() => {
		if (online) {
			connect();
		} else {
			disconnect();
		}

		return () => {
			disconnect();
		};
	}, [online, connect, disconnect]);

	// Share the volume/mute state with the HLS player via the same
	// localStorage key so switching between normal and low-latency playback
	// keeps the audio level (0 doubles as muted, matching the HLS player).
	useEffect(() => {
		const v = videoRef.current;
		if (!v) {
			return undefined;
		}
		const saved = parseFloat(getLocalStorage(PLAYER_VOLUME));
		if (!Number.isNaN(saved)) {
			v.volume = Math.min(Math.max(saved, 0), 1);
			v.muted = saved === 0;
		}
		const persist = () => {
			setLocalStorage(PLAYER_VOLUME, v.muted ? 0 : v.volume);
		};
		v.addEventListener('volumechange', persist);
		return () => v.removeEventListener('volumechange', persist);
	}, [videoElReady]);

	// Track true mount/unmount so a pending reconnect timer never fires (or
	// updates state) after the player is swapped out, e.g. on HLS fallback.
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, []);

	// Report this viewer to the server-side counter while media is flowing,
	// exactly like the HLS player does during playback.
	useEffect(() => {
		if (connectionState === 'connected') {
			ping.start();
		} else {
			ping.stop();
		}
		return () => ping.stop();
	}, [connectionState]);

	// Poll getStats() while connected so the badge can show the actual
	// resolution and frame rate being received (WebRTC has no HLS-style
	// quality menu to surface this otherwise).
	useEffect(() => {
		if (connectionState !== 'connected') {
			setVideoStats(null);
			return undefined;
		}
		const timer = setInterval(async () => {
			const pc = peerConnectionRef.current;
			if (!pc) return;
			try {
				const stats = await pc.getStats();
				let height = 0;
				let fps = 0;
				let rttSec = 0;
				let bufferSec = 0;
				stats.forEach(report => {
					const s = report as InboundVideoStats & {
						nominated?: boolean;
						currentRoundTripTime?: number;
						jitterBufferDelay?: number;
						jitterBufferEmittedCount?: number;
					};
					if (s.type === 'candidate-pair' && s.nominated && s.currentRoundTripTime) {
						rttSec = s.currentRoundTripTime;
					}
					if (s.type === 'inbound-rtp' && s.kind === 'video') {
						if (s.frameHeight) {
							height = s.frameHeight;
							fps = Math.round(s.framesPerSecond || 0);
						}
						// Average jitter-buffer delay since the previous sample: the
						// dominant client-side latency component for WebRTC.
						if (
							typeof s.jitterBufferDelay === 'number' &&
							typeof s.jitterBufferEmittedCount === 'number'
						) {
							const prev = lastJitterRef.current;
							if (prev && s.jitterBufferEmittedCount > prev.count) {
								bufferSec =
									(s.jitterBufferDelay - prev.delay) / (s.jitterBufferEmittedCount - prev.count);
							}
							lastJitterRef.current = {
								delay: s.jitterBufferDelay,
								count: s.jitterBufferEmittedCount,
							};
						}
					}
				});
				if (height) {
					// Estimated playback latency: network half-RTT plus the receive
					// jitter buffer. Encode/packetize time on the server is not
					// visible to the client, so this is a floor — still far more
					// honest than a fixed label.
					const latencyMs = bufferSec > 0 ? Math.round((rttSec / 2 + bufferSec) * 1000) : 0;
					setVideoStats({ height, fps, latencyMs });
				}
			} catch {
				// Stats are informational only.
			}
		}, 2000);
		return () => clearInterval(timer);
	}, [connectionState]);

	const handleRetry = () => {
		disconnect();
		setTimeout(() => connect(), 500);
	};

	// e.g. "1秒以下 · 1080p60" once stats are known.
	const measuredLatency =
		videoStats?.latencyMs && videoStats.latencyMs > 0
			? `${(videoStats.latencyMs / 1000).toFixed(2)}s`
			: t('video.webrtcPlayer.latency');
	const latencyLabel = videoStats
		? `${measuredLatency} · ${videoStats.height}p${videoStats.fps || ''}`
		: t('video.webrtcPlayer.latency');

	// video.js control bar (matching the HLS/VOD players). WebRTC is a live
	// MediaStream with no seekable timeline, so hide the progress/time controls
	// and keep play/volume/fullscreen.
	const vjsOptions = {
		autoplay: true,
		controls: true,
		bigPlayButton: false,
		responsive: true,
		fluid: false,
		fill: true,
		playsinline: true,
		muted: false,
		controlBar: {
			progressControl: false,
			currentTimeDisplay: false,
			durationDisplay: false,
			timeDivider: false,
			remainingTimeDisplay: false,
		},
	};

	const handleVjsReady = (player: VideoJsPlayer) => {
		vjsPlayerRef.current = player;
		const videoEl = player.el()?.querySelector('video') as HTMLVideoElement | null;
		if (videoEl) {
			videoRef.current = videoEl;
			// Apply a stream that arrived before the player was ready.
			if (pendingStreamRef.current) {
				videoEl.srcObject = pendingStreamRef.current;
			}
			setVideoElReady(true);
		}
	};

	return (
		<div className={classNames(styles.container, className)}>
			<div className={styles.video}>
				<VideoJS options={vjsOptions} onReady={handleVjsReady} />
			</div>

			{error && (
				<div className={styles.errorOverlay}>
					<div className={styles.errorMessage}>
						<span>{error}</span>
						<button onClick={handleRetry} className={styles.retryButton}>
							{t('video.webrtcPlayer.retry')}
						</button>
					</div>
				</div>
			)}

			{connectionState === 'connecting' && (
				<div className={styles.connectingOverlay}>
					<div className={styles.spinner} />
					<span>{t('video.webrtcPlayer.connecting')}</span>
				</div>
			)}

			{/* Shared ProtocolBadge so the WebRTC badge matches the HLS/LL-HLS one;
			    only the connection-state dot is WebRTC-specific. */}
			<ProtocolBadge
				protocol={{
					activeProtocol: 'webrtc',
					expectedLatency: latencyLabel,
					hlsEnabled: false,
					llhlsEnabled: false,
					webrtcEnabled: true,
				}}
				indicator={
					<span
						className={classNames(styles.statusIndicator, {
							[styles.connected]: connectionState === 'connected',
							[styles.connecting]: connectionState === 'connecting',
							[styles.disconnected]:
								connectionState === 'disconnected' || connectionState === 'failed',
						})}
					/>
				}
			/>
		</div>
	);
};

export default WebRTCPlayer;
