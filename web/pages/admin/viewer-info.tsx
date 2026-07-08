import React, { useState, useEffect, useContext, ReactElement } from 'react';
import { Row, Col, Typography, Dropdown, Spin, Alert, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { getUnixTime, sub } from 'date-fns';
import dynamic from '@components/compat/dynamic';
import { Chart } from '../../components/admin/Chart';
import { StatisticItem } from '../../components/admin/StatisticItem';
import { ViewerTable } from '../../components/admin/ViewerTable';

import { ServerStatusContext } from '../../utils/server-status-context';

import { VIEWERS_OVER_TIME, ACTIVE_VIEWER_DETAILS, fetchData } from '../../utils/apis';

import { AdminLayout } from '../../components/layouts/AdminLayout';

// Lazy loaded components

const DownOutlined = dynamic(() => import('@ant-design/icons/DownOutlined'), {
	ssr: false,
});

const UserOutlined = dynamic(() => import('@ant-design/icons/UserOutlined'), {
	ssr: false,
});

const FETCH_INTERVAL = 60 * 1000; // 1 min

export default function ViewersOverTime() {
	const { t } = useTranslation();
	const context = useContext(ServerStatusContext);
	const { online, broadcaster, viewerCount, overallPeakViewerCount, sessionPeakViewerCount } =
		context || {};
	let streamStart;
	if (broadcaster && broadcaster.time) {
		streamStart = new Date(broadcaster.time);
	}

	const times = [
		{ title: t('admin.pages.viewerInfo.timeWindows.currentStream'), start: streamStart },
		{ title: t('admin.pages.viewerInfo.timeWindows.last12Hours'), start: sub(new Date(), { hours: 12 }) },
		{ title: t('admin.pages.viewerInfo.timeWindows.last24Hours'), start: sub(new Date(), { hours: 24 }) },
		{ title: t('admin.pages.viewerInfo.timeWindows.last7Days'), start: sub(new Date(), { days: 7 }) },
		{ title: t('admin.pages.viewerInfo.timeWindows.last30Days'), start: sub(new Date(), { days: 30 }) },
		{ title: t('admin.pages.viewerInfo.timeWindows.last3Months'), start: sub(new Date(), { months: 3 }) },
		{ title: t('admin.pages.viewerInfo.timeWindows.last6Months'), start: sub(new Date(), { months: 6 }) },
	];

	const [loadingChart, setLoadingChart] = useState(true);
	const [viewerInfo, setViewerInfo] = useState([]);
	const [viewerDetails, setViewerDetails] = useState([]);
	const [timeWindowStart, setTimeWindowStart] = useState(times[1]);

	const getInfo = async () => {
		try {
			const url = `${VIEWERS_OVER_TIME}?windowStart=${getUnixTime(timeWindowStart.start)}`;
			const result = await fetchData(url);
			setViewerInfo(result);
			setLoadingChart(false);
		} catch (error) {
			console.error(error);
		}

		try {
			const result = await fetchData(ACTIVE_VIEWER_DETAILS);
			setViewerDetails(result);
		} catch (error) {
			console.error(error);
		}
	};

	useEffect(() => {
		let getStatusIntervalId = null;

		getInfo();
		if (online) {
			getStatusIntervalId = setInterval(getInfo, FETCH_INTERVAL);
			// returned function will be called on component unmount
			return () => {
				clearInterval(getStatusIntervalId);
			};
		}

		return () => [];
	}, [online, timeWindowStart]);

	const onTimeWindowSelect = ({ key }) => {
		setTimeWindowStart(times[key]);
	};

	const menuItems = [
		...(online && streamStart
			? [
					{
						key: '0',
						label: times[0].title,
						onClick: onTimeWindowSelect,
					},
				]
			: []),
		...times.slice(1).map((time, index) => ({
			key: String(index + 1),
			label: time.title,
			onClick: onTimeWindowSelect,
		})),
	];

	return (
		<>
			<Typography.Title>{t('admin.pages.viewerInfo.title')}</Typography.Title>
			<br />
			<Row gutter={[16, 16]} justify="space-around">
				{online && (
					<Col span={8} md={8}>
						<StatisticItem
							title={t('admin.pages.viewerInfo.currentViewers')}
							value={viewerCount.toString()}
							prefix={<UserOutlined />}
						/>
					</Col>
				)}
				<Col md={online ? 8 : 12}>
					<StatisticItem
						title={
							online
								? t('admin.pages.viewerInfo.maxViewersThisStream')
								: t('admin.pages.viewerInfo.maxViewersLastStream')
						}
						value={sessionPeakViewerCount.toString()}
						prefix={<UserOutlined />}
					/>
				</Col>
				<Col md={online ? 8 : 12}>
					<StatisticItem
						title={t('admin.pages.viewerInfo.allTimeMaxViewers')}
						value={overallPeakViewerCount.toString()}
						prefix={<UserOutlined />}
					/>
				</Col>
			</Row>
			{!viewerInfo.length && (
				<Alert
					style={{ marginTop: '10px' }}
					banner
					message={t('admin.pages.common.pleaseWait')}
					description={t('admin.pages.viewerInfo.noDataDescription')}
					type="info"
				/>
			)}

			<Spin spinning={!viewerInfo.length || loadingChart}>
				<Dropdown menu={{ items: menuItems }} trigger={['click']}>
					<Button type="text" style={{ float: 'right' }}>
						{timeWindowStart.title} <DownOutlined />
					</Button>
				</Dropdown>
				{viewerInfo.length > 0 && (
					<Chart
						title={t('admin.pages.viewerInfo.chartTitle')}
						data={viewerInfo}
						color="#2087E2"
						unit={t('admin.pages.viewerInfo.unitPeople')}
						minYValue={0}
						yStepSize={1}
					/>
				)}

				<ViewerTable data={viewerDetails} />
			</Spin>
		</>
	);
}

ViewersOverTime.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
