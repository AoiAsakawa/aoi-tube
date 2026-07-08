import { Col, Collapse, Row, Tabs, Typography } from 'antd';
import React, { ReactElement, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CodecSelector as VideoCodecSelector } from '../../components/admin/CodecSelector';
import { VideoLatency } from '../../components/admin/VideoLatency';
import { CurrentVariantsTable } from '../../components/admin/CurrentVariantsTable';
import { StreamProtocolSection } from '../../components/admin/config/StreamProtocolSection';
import { ToggleSwitch } from '../../components/admin/ToggleSwitch';
import { TextFieldWithSubmit } from '../../components/admin/TextFieldWithSubmit';
import { TEXTFIELD_TYPE_NUMBER } from '../../components/admin/TextField';
import {
	FIELD_PROPS_RECORDING_ENABLED,
	FIELD_PROPS_RECORDING_STORE_S3,
	TEXTFIELD_PROPS_RECORDING_RETENTION,
} from '../../utils/config-constants';
import { ServerStatusContext } from '../../utils/server-status-context';

import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

const { Panel } = Collapse;
const { Title } = Typography;

const RecordingTab = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const { recordingEnabled, recordingStoreOnS3, recordingRetentionCount } = serverConfig;

	// TextFieldWithSubmit is a controlled input: the parent must own the
	// edited value and update it via onChange. Binding `value` straight to
	// serverConfig froze the field at its stored value ("can't change from 0").
	const [retentionValue, setRetentionValue] = useState(String(recordingRetentionCount ?? 0));

	useEffect(() => {
		setRetentionValue(String(recordingRetentionCount ?? 0));
	}, [recordingRetentionCount]);

	return (
		<div className="config-recording">
			{/* Module heading; the page h1 is the constant AdminPageHeader above
			    the tabs. Level 3 matches the sibling streaming tab's heading. */}
			<Title level={3}>{t('admin.config.recording.title')}</Title>
			<p className="description">{t('admin.config.recording.description')}</p>

			<Row>
				<Col span={20} className="form-module" style={{ margin: '5px' }}>
					<ToggleSwitch
						fieldName="recordingEnabled"
						{...FIELD_PROPS_RECORDING_ENABLED}
						checked={recordingEnabled}
					/>
					<ToggleSwitch
						fieldName="recordingStoreOnS3"
						{...FIELD_PROPS_RECORDING_STORE_S3}
						checked={recordingStoreOnS3}
					/>
					<TextFieldWithSubmit
						fieldName="recordingRetentionCount"
						{...TEXTFIELD_PROPS_RECORDING_RETENTION}
						type={TEXTFIELD_TYPE_NUMBER}
						value={retentionValue}
						initialValue={String(recordingRetentionCount ?? 0)}
						onChange={({ value }) => setRetentionValue(String(value))}
					/>
				</Col>
			</Row>
		</div>
	);
};

const VideoQualityTab = () => {
	const { t } = useTranslation();

	return (
		<div className="config-video-variants">
			{/* No in-tab title: it would repeat the constant AdminPageHeader
			    rendered right above the tabs. */}
			<p className="description">
				{t('admin.config.video.introPrefix')}{' '}
				<a
					href="https://owncast.online/docs/video?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.config.video.docLinkText')}
				</a>{' '}
				{t('admin.config.video.introSuffix')}
			</p>

			<Row gutter={[45, 16]}>
				<Col md={24} lg={12}>
					<div className="form-module variants-table-module">
						<CurrentVariantsTable />
					</div>
				</Col>
				<Col md={24} lg={12}>
					<div className="form-module latency-module">
						<VideoLatency />
					</div>

					<Collapse className="advanced-settings codec-module">
						<Panel header={t('admin.config.video.advancedSettings')} key="1">
							<div className="form-module variants-table-module">
								<VideoCodecSelector />
							</div>
						</Panel>
					</Collapse>
				</Col>
			</Row>
		</div>
	);
};

export default function ConfigVideoSettings() {
	const { t } = useTranslation();
	const tabItems = [
		{ label: t('admin.config.video.tabQuality'), key: '1', children: <VideoQualityTab /> },
		{ label: t('admin.config.video.tabStreaming'), key: '2', children: <StreamProtocolSection /> },
		{ label: t('admin.config.recording.tabLabel'), key: '3', children: <RecordingTab /> },
	];

	return (
		<>
			{/* Constant page heading above the tabs so the h1 does not change
			    when switching tabs. */}
			<AdminPageHeader title={t('admin.config.video.title')} />
			<Tabs defaultActiveKey="1" centered items={tabItems} />
		</>
	);
}

ConfigVideoSettings.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
