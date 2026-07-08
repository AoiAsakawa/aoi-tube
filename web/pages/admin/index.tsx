import React, { useState, useEffect, useContext, ReactElement } from 'react';
import { Skeleton, Card, Statistic, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow, formatRelative } from 'date-fns';
import dynamic from '@components/compat/dynamic';
import { getDateFnsLocale } from '../../utils/dateFnsLocale';
import { ServerStatusContext } from '../../utils/server-status-context';
import { LogTable } from '../../components/admin/LogTable';
import { Offline } from '../../components/admin/Offline';
import { StreamHealthOverview } from '../../components/admin/StreamHealthOverview';

import { LOGS_WARN, fetchData, FETCH_INTERVAL } from '../../utils/apis';
import { formatIPAddress, isEmptyObject } from '../../utils/format';

import { AdminLayout } from '../../components/layouts/AdminLayout';

// Lazy loaded components

const UserOutlined = dynamic(() => import('@ant-design/icons/UserOutlined'), {
	ssr: false,
});

const ClockCircleOutlined = dynamic(() => import('@ant-design/icons/ClockCircleOutlined'), {
	ssr: false,
});

function streamDetailsFormatter(streamDetails) {
	return (
		<ul className="statistics-list">
			<li>
				{streamDetails.videoCodec || 'Unknown'} @ {streamDetails.videoBitrate || 'Unknown'} kbps
			</li>
			<li>{streamDetails.framerate || 'Unknown'} fps</li>
			<li>
				{streamDetails.width} x {streamDetails.height}
			</li>
		</ul>
	);
}

export default function Home() {
	const { t, i18n } = useTranslation();
	const dateLocale = getDateFnsLocale(i18n.language);
	const serverStatusData = useContext(ServerStatusContext);
	const { broadcaster, serverConfig: configData } = serverStatusData || {};
	const { remoteAddr, streamDetails } = broadcaster || {};

	const encoder = streamDetails?.encoder || 'Unknown encoder';

	const [logsData, setLogs] = useState([]);
	const getLogs = async () => {
		try {
			const result = await fetchData(LOGS_WARN);
			setLogs(result);
		} catch (_error) {
			// Ignore log-fetch failures on the dashboard.
		}
	};
	const getMoreStats = () => {
		getLogs();
	};

	useEffect(() => {
		getMoreStats();

		let intervalId = null;
		intervalId = setInterval(getMoreStats, FETCH_INTERVAL);

		return () => {
			clearInterval(intervalId);
		};
	}, []);

	if (isEmptyObject(configData) || isEmptyObject(serverStatusData)) {
		return (
			<>
				<Skeleton active />
				<Skeleton active />
				<Skeleton active />
			</>
		);
	}

	if (!broadcaster) {
		return <Offline logs={logsData} config={configData} />;
	}

	// map out settings
	const videoQualitySettings = serverStatusData?.currentBroadcast?.outputSettings?.map(setting => {
		const { audioPassthrough, videoPassthrough, audioBitrate, videoBitrate, framerate } = setting;

		const audioSetting = audioPassthrough
			? `${streamDetails.audioCodec || 'Unknown'}, ${streamDetails.audioBitrate} kbps`
			: `${audioBitrate || 'Unknown'} kbps`;

		const videoSetting = videoPassthrough
			? `${streamDetails.videoBitrate || 'Unknown'} kbps, ${streamDetails.framerate} fps ${
					streamDetails.width
				} x ${streamDetails.height}`
			: `${videoBitrate || 'Unknown'} kbps, ${framerate} fps`;

		return (
			<div
				className="stream-details-item-container"
				key={`setting-${videoBitrate}-${audioBitrate}`}
			>
				<Statistic
					className="stream-details-item"
					title={t('admin.pages.home.outboundVideoStream')}
					value={videoSetting}
				/>
				<Statistic
					className="stream-details-item"
					title={t('admin.pages.home.outboundAudioStream')}
					value={audioSetting}
				/>
			</div>
		);
	});

	// inbound
	const { viewerCount, sessionPeakViewerCount } = serverStatusData;

	const streamAudioDetailString = `${streamDetails.audioCodec}, ${
		streamDetails.audioBitrate || 'Unknown'
	} kbps`;

	const broadcastDate = new Date(broadcaster.time);

	return (
		<div className="home-container">
			<div className="sections-container">
				<div className="online-status-section">
					<Card size="small" type="inner" className="online-details-card">
						<Row gutter={[16, 16]} align="middle">
							<Col span={8} sm={24} md={8}>
								<Statistic
									title={t('admin.pages.home.streamStarted', {
										relative: formatRelative(broadcastDate, Date.now(), { locale: dateLocale }),
									})}
									value={formatDistanceToNow(broadcastDate, { locale: dateLocale })}
									prefix={<ClockCircleOutlined />}
								/>
							</Col>
							<Col span={8} sm={24} md={8}>
								<Statistic
									title={t('admin.pages.home.viewers')}
									value={viewerCount}
									prefix={<UserOutlined />}
								/>
							</Col>
							<Col span={8} sm={24} md={8}>
								<Statistic
									title={t('admin.pages.home.peakViewers')}
									value={sessionPeakViewerCount}
									prefix={<UserOutlined />}
								/>
							</Col>
						</Row>
						<StreamHealthOverview />
					</Card>
				</div>

				<Row gutter={[16, 16]} className="section stream-details-section">
					<Col className="stream-details" span={24}>
						<Card
							size="small"
							title={t('admin.pages.home.outboundDetails')}
							type="inner"
							className="outbound-details"
						>
							{videoQualitySettings}
						</Card>

						<Card size="small" title={t('admin.pages.home.inboundDetails')} type="inner">
							<Statistic
								className="stream-details-item"
								title={t('admin.pages.home.input')}
								value={`${encoder} ${formatIPAddress(remoteAddr)}`}
							/>
							<Statistic
								className="stream-details-item"
								title={t('admin.pages.home.inboundVideoStream')}
								value={streamDetails}
								formatter={streamDetailsFormatter}
							/>
							<Statistic
								className="stream-details-item"
								title={t('admin.pages.home.inboundAudioStream')}
								value={streamAudioDetailString}
							/>
						</Card>
					</Col>

				</Row>
			</div>
			<br />
			<LogTable logs={logsData} pageSize={5} />
		</div>
	);
}

Home.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
