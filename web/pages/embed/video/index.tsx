import React from 'react';
import { Skeleton } from 'antd';
import { ClientConfigStore } from '../../../components/stores/ClientConfigStore';
import {
	useClientConfig,
	useIsOnline,
	useServerStatus,
	useAppState,
} from '../../../components/stores/zustand-store';
import { OfflineBanner } from '../../../components/ui/OfflineBanner/OfflineBanner';
import { Statusbar } from '../../../components/ui/Statusbar/Statusbar';
import { OwncastPlayer } from '../../../components/video/OwncastPlayer/OwncastPlayer';
import { Theme } from '../../../components/theme/Theme';
import styles from './VideoEmbed.module.scss';

export default function VideoEmbed() {
	const status = useServerStatus();
	const clientConfig = useClientConfig();
	const appState = useAppState();

	const { name } = clientConfig;

	const { offlineMessage } = clientConfig;
	const twitterProfileUrl =
		clientConfig?.socialHandles?.find(h => (h?.platform || '').toLowerCase() === 'twitter')?.url ||
		null;
	const { viewerCount, lastConnectTime, lastDisconnectTime, streamTitle } = status;
	const online = useIsOnline();

	const initiallyMuted =
		new URLSearchParams(window.location.search).get('initiallyMuted') === 'true';

	const loadingState = <Skeleton active style={{ padding: '10px' }} paragraph={{ rows: 10 }} />;

	const offlineState = (
		<OfflineBanner
			streamName={name}
			customText={offlineMessage}
			lastLive={lastDisconnectTime}
			notificationsEnabled={false}
			twitterProfileUrl={twitterProfileUrl}
			offlineMediaUrl={clientConfig.offlineMediaUrl}
			offlineMediaType={clientConfig.offlineMediaType}
		/>
	);

	const onlineState = (
		<div className={styles.onlineContainer}>
			<OwncastPlayer
				source="/hls/stream.m3u8"
				online={online}
				initiallyMuted={initiallyMuted}
				title={streamTitle || name}
				embedded
			/>
			<Statusbar
				online={online}
				lastConnectTime={lastConnectTime}
				lastDisconnectTime={lastDisconnectTime}
				viewerCount={viewerCount}
			/>
		</div>
	);

	const getView = () => {
		if (appState.appLoading) {
			return loadingState;
		}
		if (online) {
			return onlineState;
		}

		return offlineState;
	};

	return (
		<>
			<ClientConfigStore />
			<Theme />
			<div className={styles.videoEmbed}>{getView()}</div>
		</>
	);
}
