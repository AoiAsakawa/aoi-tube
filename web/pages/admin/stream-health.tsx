import { Row, Col, Typography, Space, Statistic, Card, Alert, Spin } from 'antd';
import React, { ReactElement, ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { fetchData, FETCH_INTERVAL, API_STREAM_HEALTH_METRICS } from '../../utils/apis';
import { Chart } from '../../components/admin/Chart';
import { StreamHealthOverview } from '../../components/admin/StreamHealthOverview';

import { AdminLayout } from '../../components/layouts/AdminLayout';

// Lazy loaded components

const ClockCircleOutlined = dynamic(() => import('@ant-design/icons/ClockCircleOutlined'), {
	ssr: false,
});

const WarningOutlined = dynamic(() => import('@ant-design/icons/WarningOutlined'), {
	ssr: false,
});

const WifiOutlined = dynamic(() => import('@ant-design/icons/WifiOutlined'), {
	ssr: false,
});

interface TimedValue {
	time: Date;
	value: Number;
}

interface DescriptionBoxProps {
	title: String;
	description: ReactNode;
}

const DescriptionBox = ({ title, description }: DescriptionBoxProps) => (
	<div className="description-box">
		<Typography.Title>{title}</Typography.Title>
		<Typography.Paragraph>{description}</Typography.Paragraph>
	</div>
);

const StreamHealth = () => {
	const { t } = useTranslation();
	const [errors, setErrors] = useState<TimedValue[]>([]);
	const [qualityVariantChanges, setQualityVariantChanges] = useState<TimedValue[]>([]);

	const [lowestLatency, setLowestLatency] = useState<TimedValue[]>();
	const [highestLatency, setHighestLatency] = useState<TimedValue[]>();
	const [medianLatency, setMedianLatency] = useState<TimedValue[]>([]);

	const [medianSegmentDownloadDurations, setMedianSegmentDownloadDurations] = useState<
		TimedValue[]
	>([]);
	const [maximumSegmentDownloadDurations, setMaximumSegmentDownloadDurations] = useState<
		TimedValue[]
	>([]);
	const [minimumSegmentDownloadDurations, setMinimumSegmentDownloadDurations] = useState<
		TimedValue[]
	>([]);
	const [minimumPlayerBitrate, setMinimumPlayerBitrate] = useState<TimedValue[]>([]);
	const [medianPlayerBitrate, setMedianPlayerBitrate] = useState<TimedValue[]>([]);
	const [maximumPlayerBitrate, setMaximumPlayerBitrate] = useState<TimedValue[]>([]);
	const [availableBitrates, setAvailableBitrates] = useState<Number[]>([]);
	const [segmentLength, setSegmentLength] = useState(0);

	const getMetrics = async () => {
		try {
			const result = await fetchData(API_STREAM_HEALTH_METRICS);
			setErrors(result.errors);
			setQualityVariantChanges(result.qualityVariantChanges);

			setHighestLatency(result.highestLatency);
			setLowestLatency(result.lowestLatency);
			setMedianLatency(result.medianLatency);

			setMedianSegmentDownloadDurations(result.medianSegmentDownloadDuration);
			setMaximumSegmentDownloadDurations(result.maximumSegmentDownloadDuration);
			setMinimumSegmentDownloadDurations(result.minimumSegmentDownloadDuration);

			setMinimumPlayerBitrate(result.minPlayerBitrate);
			setMedianPlayerBitrate(result.medianPlayerBitrate);
			setMaximumPlayerBitrate(result.maxPlayerBitrate);

			setAvailableBitrates(result.availableBitrates);
			setSegmentLength(result.segmentLength - 0.3);
		} catch (error) {
			console.error(error);
		}
	};

	useEffect(() => {
		let getStatusIntervalId = null;

		getMetrics();
		getStatusIntervalId = setInterval(getMetrics, FETCH_INTERVAL); // runs every 1 min.

		// returned function will be called on component unmount
		return () => {
			clearInterval(getStatusIntervalId);
		};
	}, []);

	const noData = (
		<div>
			<Typography.Title>{t('admin.pages.streamHealth.title')}</Typography.Title>
			<Alert type="info" message={t('admin.pages.streamHealth.noData')} />
			<Spin size="large">
				<div style={{ marginTop: '50px', height: '100px' }} />
			</Spin>
		</div>
	);
	if (!errors?.length) {
		return noData;
	}

	if (!medianLatency?.length) {
		return noData;
	}

	if (!medianSegmentDownloadDurations?.length) {
		return noData;
	}

	const errorChart = [
		{
			name: t('admin.pages.streamHealth.charts.errors'),
			color: '#B63FFF',
			data: errors,
			pointStyle: 'crossRot',
			pointRadius: 7,
		},
		{
			name: t('admin.pages.streamHealth.charts.qualityChanges'),
			color: '#2087E2',
			data: qualityVariantChanges,
		},
	];

	const latencyChart = [
		{
			name: t('admin.pages.streamHealth.charts.latencyMedian'),
			color: '#00FFFF',
			data: medianLatency,
		},
		{
			name: t('admin.pages.streamHealth.charts.latencyMin'),
			color: '#02FD0D',
			data: lowestLatency,
		},
		{
			name: t('admin.pages.streamHealth.charts.latencyMax'),
			color: '#B63FFF',
			data: highestLatency,
		},
	];

	const segmentDownloadDurationChart = [
		{
			name: t('admin.pages.streamHealth.charts.downloadMax'),
			color: '#B63FFF',
			options: { radius: 2 },
			data: maximumSegmentDownloadDurations,
		},
		{
			name: t('admin.pages.streamHealth.charts.downloadMedian'),
			color: '#00FFFF',
			options: { radius: 2 },
			data: medianSegmentDownloadDurations,
		},
		{
			name: t('admin.pages.streamHealth.charts.downloadMin'),
			color: '#02FD0D',
			options: { radius: 2 },
			data: minimumSegmentDownloadDurations,
		},
		{
			name: t('admin.pages.streamHealth.charts.targetLimit'),
			color: '#003FFF',
			data: medianSegmentDownloadDurations.map(item => ({
				time: item.time,
				value: segmentLength,
			})),
			pointStyle: 'dash' as const,
			options: { radius: 0 },
		},
	];

	const bitrateChart = [
		{
			name: t('admin.pages.streamHealth.charts.bitrateMin'),
			color: '#B63FFF',
			data: minimumPlayerBitrate,
			options: { radius: 2 },
		},
		{
			name: t('admin.pages.streamHealth.charts.bitrateMedian'),
			color: '#00FFFF',
			data: medianPlayerBitrate,
			options: { radius: 2 },
		},
		{
			name: t('admin.pages.streamHealth.charts.bitrateMax'),
			color: '#02FD0D',
			data: maximumPlayerBitrate,
			options: { radius: 2 },
		},
	];

	availableBitrates.forEach(bitrate => {
		bitrateChart.push({
			name: t('admin.pages.streamHealth.charts.availableBitrates'),
			color: '#003FFF',
			data: minimumPlayerBitrate.map(item => ({
				time: item.time,
				value: bitrate,
			})),
			options: { radius: 0 },
		});
	});

	const currentSpeed = bitrateChart[0]?.data[bitrateChart[0].data.length - 1]?.value;
	const currentDownloadSeconds =
		medianSegmentDownloadDurations[medianSegmentDownloadDurations.length - 1]?.value;
	const lowestVariant = availableBitrates.reduce((bitrate1, bitrate2) =>
		bitrate1.valueOf() < bitrate2.valueOf() ? bitrate1 : bitrate2,
	);

	const latencyMedian = medianLatency[medianLatency.length - 1]?.value || 0;
	const latencyMax = highestLatency[highestLatency.length - 1]?.value || 0;
	const latencyMin = lowestLatency[lowestLatency.length - 1]?.value || 0;
	const latencyStat = (Number(latencyMax) + Number(latencyMin) + Number(latencyMedian)) / 3;

	let recentErrorCount: number;
	const errorValueCount = errorChart[0]?.data.length || 0;
	if (errorValueCount > 5) {
		const values = errorChart[0].data.slice(-5);
		recentErrorCount = values.reduce((acc, curr) => acc + Number(curr.value), 0);
	} else {
		recentErrorCount = errorChart[0].data.reduce((acc, curr) => acc + Number(curr.value), 0);
	}
	const showStats =
		Number(currentSpeed) > 0 || Number(currentDownloadSeconds) > 0 || recentErrorCount > 0;
	let bitrateError = null;
	let speedError = null;

	if (currentSpeed !== 0 && Number(currentSpeed) < Number(lowestVariant)) {
		bitrateError = t('admin.pages.streamHealth.bitrateError', {
			speed: currentSpeed,
			lowest: lowestVariant,
		});
	}

	if (Number(currentDownloadSeconds) > segmentLength) {
		speedError = t('admin.pages.streamHealth.speedError');
	}

	const errorStatColor = recentErrorCount > 0 ? '#B63FFF' : 'unset';
	const statStyle = {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '80px',
	};
	return (
		<>
			<Typography.Title>{t('admin.pages.streamHealth.title')}</Typography.Title>
			<Typography.Paragraph>{t('admin.pages.streamHealth.intro1')}</Typography.Paragraph>
			<Typography.Paragraph>{t('admin.pages.streamHealth.intro2')}</Typography.Paragraph>
			<Space direction="vertical" size="middle">
				<Row justify="space-around">
					<Col style={{ width: '100%' }}>
						<StreamHealthOverview showTroubleshootButton={false} />
					</Col>
				</Row>
				<Row
					gutter={[16, 16]}
					justify="space-around"
					style={{ display: showStats ? 'flex' : 'none' }}
				>
					<Col>
						<Card type="inner">
							<div style={statStyle}>
								<Statistic
									title={t('admin.pages.streamHealth.stats.playerSpeed')}
									value={`${currentSpeed}`}
									prefix={<WifiOutlined style={{ marginRight: '5px' }} />}
									precision={0}
									suffix="kbps"
								/>
							</div>
						</Card>
					</Col>
					<Col>
						<Card type="inner">
							<div style={statStyle}>
								<Statistic
									title={t('admin.pages.streamHealth.stats.playerLatency')}
									value={`${latencyStat}`}
									prefix={<ClockCircleOutlined style={{ marginRight: '5px' }} />}
									precision={0}
									suffix={t('admin.pages.streamHealth.unitSeconds')}
								/>
							</div>
						</Card>
					</Col>
					<Col>
						<Card type="inner">
							<div style={statStyle}>
								<Statistic
									title={t('admin.pages.streamHealth.stats.recentErrors')}
									value={`${recentErrorCount || 0}`}
									valueStyle={{ color: errorStatColor }}
									prefix={<WarningOutlined style={{ marginRight: '5px' }} />}
									suffix=""
								/>
							</div>
						</Card>
					</Col>
				</Row>

				<Card>
					<DescriptionBox
						title={t('admin.pages.streamHealth.segmentSection.title')}
						description={
							<>
								<Typography.Paragraph>
									{t('admin.pages.streamHealth.segmentSection.p1')}
								</Typography.Paragraph>
								<Typography.Paragraph>
									{t('admin.pages.streamHealth.segmentSection.p2')}
								</Typography.Paragraph>
							</>
						}
					/>
					{speedError && (
						<Alert
							message={t('admin.pages.streamHealth.slowDownloads')}
							description={speedError}
							type="error"
							showIcon
						/>
					)}
					<Chart
						title={t('admin.pages.streamHealth.unitSeconds')}
						dataCollections={segmentDownloadDurationChart}
						color="#FF7700"
						unit={t('admin.pages.streamHealth.unitSeconds')}
						yLogarithmic
					/>
				</Card>
				<Card>
					<DescriptionBox
						title={t('admin.pages.streamHealth.networkSection.title')}
						description={
							<>
								<Typography.Paragraph>
									{t('admin.pages.streamHealth.networkSection.p1')}
								</Typography.Paragraph>
								<Typography.Paragraph>
									{t('admin.pages.streamHealth.networkSection.p2')}
								</Typography.Paragraph>
							</>
						}
					/>
					{bitrateError && (
						<Alert
							message={t('admin.pages.streamHealth.slowNetwork')}
							description={bitrateError}
							type="error"
							showIcon
						/>
					)}
					<Chart
						title={t('admin.pages.streamHealth.bitrateChartTitle')}
						dataCollections={bitrateChart}
						color="#FF7700"
						unit="kbps"
						yLogarithmic
					/>
				</Card>
				<Card>
					<DescriptionBox
						title={t('admin.pages.streamHealth.errorsSection.title')}
						description={
							<>
								<Typography.Paragraph>
									{t('admin.pages.streamHealth.errorsSection.p1')}
								</Typography.Paragraph>
								{t('admin.pages.streamHealth.errorsSection.p2')}
								<Typography.Paragraph />
							</>
						}
					/>
					<Chart title="#" dataCollections={errorChart} color="#FF7700" unit="" />
				</Card>
				<Card>
					<DescriptionBox
						title={t('admin.pages.streamHealth.latencySection.title')}
						description={t('admin.pages.streamHealth.latencySection.description')}
					/>
					<Chart
						title={t('admin.pages.streamHealth.unitSeconds')}
						dataCollections={latencyChart}
						color="#FF7700"
						unit={t('admin.pages.streamHealth.unitSeconds')}
					/>
				</Card>
			</Space>
		</>
	);
};

StreamHealth.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default StreamHealth;
