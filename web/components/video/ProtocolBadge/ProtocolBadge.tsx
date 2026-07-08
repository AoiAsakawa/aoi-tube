import React, { FC, ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProtocolInfo } from '../../../interfaces/server-status.model';
import styles from './ProtocolBadge.module.scss';

// Simple SVG icons (avoids a dependency on Ant Design)
const WebRTCIcon = () => (
	<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
		<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
	</svg>
);

const LLHLSIcon = () => (
	<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
		<path d="M7 2v11h3v9l7-12h-4l4-8z" />
	</svg>
);

const HLSIcon = () => (
	<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
		<path d="M8 5v14l11-7z" />
	</svg>
);

export interface ProtocolBadgeProps {
	protocol?: ProtocolInfo;
	showLatency?: boolean;
	// Optional extra element rendered before the icon (e.g. the WebRTC player's
	// connection-state dot), so other players can reuse this badge and stay
	// visually identical to the HLS/LL-HLS one.
	indicator?: ReactNode;
}

export const ProtocolBadge: FC<ProtocolBadgeProps> = ({
	protocol,
	showLatency = true,
	indicator,
}) => {
	const { t } = useTranslation();
	const [mounted, setMounted] = useState(false);

	// Render on the client side only
	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	// Use default values when no protocol is provided
	const effectiveProtocol = protocol || {
		activeProtocol: 'hls',
		expectedLatency: t('video.protocolBadge.defaultLatency'),
		hlsEnabled: true,
		llhlsEnabled: false,
		webrtcEnabled: false,
	};

	const getProtocolConfig = () => {
		const activeProtocol = effectiveProtocol.activeProtocol || 'hls';

		// WebRTC — either the pure protocol (the WebRTC player's own badge) or a
		// legacy combined value like "ll-hls+webrtc".
		if (activeProtocol.includes('webrtc')) {
			let label = 'WebRTC';
			if (activeProtocol !== 'webrtc') {
				label = activeProtocol.includes('ll-hls') ? 'LL-HLS+WebRTC' : 'HLS+WebRTC';
			}
			return {
				icon: <WebRTCIcon />,
				bgColor: 'rgba(82, 196, 26, 0.9)',
				label,
				description: t('video.protocolBadge.webrtcDescription'),
			};
		}

		switch (activeProtocol) {
			case 'll-hls':
				return {
					icon: <LLHLSIcon />,
					bgColor: 'rgba(24, 144, 255, 0.9)',
					label: 'LL-HLS',
					description: t('video.protocolBadge.llhlsDescription'),
				};
			case 'hls':
			default:
				return {
					icon: <HLSIcon />,
					bgColor: 'rgba(100, 100, 100, 0.9)',
					label: 'HLS',
					description: t('video.protocolBadge.hlsDescription'),
				};
		}
	};

	const config = getProtocolConfig();

	return (
		<div
			className={styles.container}
			title={t('video.protocolBadge.title', {
				description: config.description,
				latency: effectiveProtocol.expectedLatency,
			})}
			data-protocol={effectiveProtocol.activeProtocol}
		>
			<div className={styles.badge}>
				{indicator}
				<span className={styles.icon}>{config.icon}</span>
				<span className={styles.label}>{config.label}</span>
				{showLatency && <span className={styles.latency}>{effectiveProtocol.expectedLatency}</span>}
			</div>
		</div>
	);
};

export default ProtocolBadge;
