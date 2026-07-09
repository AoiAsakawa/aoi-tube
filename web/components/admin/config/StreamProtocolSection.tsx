import {
	Alert,
	Card,
	Col,
	Row,
	Slider,
	Space,
	Switch,
	Typography,
	Input,
	InputNumber,
	Button,
	Statistic,
	Table,
	Tag,
	message,
	Divider,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	ThunderboltOutlined,
	GlobalOutlined,
	VideoCameraOutlined,
	ReloadOutlined,
	DisconnectOutlined,
	SettingOutlined,
} from '@ant-design/icons';
import {
	API_STREAM_PROTOCOL_CONFIG,
	API_LLHLS_LATENCY_LEVEL,
	API_LLHLS_LATENCY_LEVELS,
	API_WEBRTC_STATS,
	fetchData,
	FETCH_INTERVAL,
} from '../../../utils/apis';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface StreamProtocolConfig {
	hlsEnabled: boolean;
	llhlsEnabled: boolean;
	llhlsPartDuration: number;
	llhlsPartHoldBack: number;
	llhlsLatencyLevel: number;
	webrtcEnabled: boolean;
	webrtcIceServers: string;
	webrtcMaxViewers: number;
	webrtcUdpPort: number;
}

interface LLHLSLatencyLevel {
	level: number;
	partDurationMs: number;
	segmentDurationS: number;
	partHoldBack: number;
	description: string;
}

interface WebRTCViewer {
	id: string;
	connectedAt: string;
	clientIp: string;
}

interface WebRTCStats {
	enabled: boolean;
	viewerCount: number;
	maxViewers: number;
	viewers: WebRTCViewer[];
}

export function StreamProtocolSection() {
	const { t } = useTranslation();
	const [config, setConfig] = useState<StreamProtocolConfig | null>(null);
	const [latencyLevels, setLatencyLevels] = useState<LLHLSLatencyLevel[]>([]);
	const [webrtcStats, setWebrtcStats] = useState<WebRTCStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [iceServersError, setIceServersError] = useState<string | null>(null);

	const fetchConfig = async () => {
		try {
			const [configData, levelsData, statsData] = await Promise.all([
				fetchData(API_STREAM_PROTOCOL_CONFIG),
				fetchData(API_LLHLS_LATENCY_LEVELS),
				fetchData(API_WEBRTC_STATS).catch(() => null),
			]);
			setConfig(configData);
			setLatencyLevels(levelsData || []);
			setWebrtcStats(statsData);
		} catch (err) {
			console.error('Failed to fetch config:', err);
			message.error(t('admin.sections.streamProtocol.fetchError'));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchConfig();
	}, []);

	// WebRTC stats polling - separate from config fetch
	useEffect(() => {
		if (!config?.webrtcEnabled) return;

		const interval = setInterval(() => {
			fetchData(API_WEBRTC_STATS).then(setWebrtcStats).catch(console.error);
		}, FETCH_INTERVAL);
		return () => clearInterval(interval);
	}, [config?.webrtcEnabled]);

	const validateIceServers = (value: string): boolean => {
		if (!value.trim()) {
			setIceServersError(null);
			return true;
		}
		try {
			const parsed = JSON.parse(value);
			if (!Array.isArray(parsed)) {
				setIceServersError(t('admin.sections.streamProtocol.iceServersArrayError'));
				return false;
			}
			setIceServersError(null);
			return true;
		} catch {
			setIceServersError(t('admin.sections.streamProtocol.iceServersJsonError'));
			return false;
		}
	};

	const saveConfig = async () => {
		if (!config) return;

		if (!validateIceServers(config.webrtcIceServers)) {
			message.error(t('admin.sections.streamProtocol.iceServersInvalid'));
			return;
		}

		setSaving(true);
		try {
			const response = await fetch('/api/admin/config/streamprotocol/set', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					hlsEnabled: config.hlsEnabled,
					llhlsEnabled: config.llhlsEnabled,
					llhlsPartDuration: config.llhlsPartDuration,
					webrtcEnabled: config.webrtcEnabled,
					webrtcIceServers: config.webrtcIceServers,
					webrtcMaxViewers: config.webrtcMaxViewers,
					webrtcUdpPort: config.webrtcUdpPort,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				message.error(data.message || t('admin.sections.streamProtocol.saveError'));
				return;
			}

			// The latency level has a dedicated endpoint and is not part of the
			// main config payload, so it must be saved separately.
			const levelResponse = await fetch(API_LLHLS_LATENCY_LEVEL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ level: config.llhlsLatencyLevel }),
			});

			if (!levelResponse.ok) {
				const data = await levelResponse.json();
				message.error(data.message || t('admin.sections.streamProtocol.latencySaveError'));
				return;
			}

			message.success(t('admin.sections.streamProtocol.saveSuccess'));
		} catch (err) {
			console.error('Failed to save config:', err);
			message.error(t('admin.sections.streamProtocol.saveError'));
		} finally {
			setSaving(false);
		}
	};

	const disconnectViewer = async (viewerId: string) => {
		try {
			await fetch(`/api/admin/webrtc/disconnect?viewerId=${viewerId}`, {
				method: 'POST',
			});
			message.success(t('admin.sections.streamProtocol.viewerDisconnected'));
			fetchData(API_WEBRTC_STATS).then(setWebrtcStats);
		} catch (_err) {
			message.error(t('admin.sections.streamProtocol.disconnectError'));
		}
	};

	const disconnectAllViewers = async () => {
		try {
			await fetch('/api/admin/webrtc/disconnectall', { method: 'POST' });
			message.success(t('admin.sections.streamProtocol.allViewersDisconnected'));
			fetchData(API_WEBRTC_STATS).then(setWebrtcStats);
		} catch (_err) {
			message.error(t('admin.sections.streamProtocol.disconnectError'));
		}
	};

	const updateConfig = (key: keyof StreamProtocolConfig, value: any) => {
		if (config) {
			setConfig({ ...config, [key]: value });
		}
	};

	const webrtcViewerColumns = [
		{
			title: 'ID',
			dataIndex: 'id',
			key: 'id',
			width: 120,
		},
		{
			title: t('admin.sections.streamProtocol.columns.connectedAt'),
			dataIndex: 'connectedAt',
			key: 'connectedAt',
			render: (date: string) => new Date(date).toLocaleString('ja-JP'),
		},
		{
			title: t('admin.sections.streamProtocol.columns.ipAddress'),
			dataIndex: 'clientIp',
			key: 'clientIp',
		},
		{
			title: t('admin.sections.streamProtocol.columns.actions'),
			key: 'actions',
			width: 100,
			render: (_: any, record: WebRTCViewer) => (
				<Button
					danger
					size="small"
					icon={<DisconnectOutlined />}
					onClick={() => disconnectViewer(record.id)}
				>
					{t('admin.sections.streamProtocol.disconnect')}
				</Button>
			),
		},
	];

	if (loading || !config) {
		return <div>{t('admin.sections.streamProtocol.loading')}</div>;
	}

	return (
		<div className="config-stream-protocol">
			<Title level={3}>{t('admin.sections.streamProtocol.title')}</Title>
			<Paragraph className="description">
				{t('admin.sections.streamProtocol.description')}
			</Paragraph>

			<Alert
				message={t('admin.sections.streamProtocol.experimentalTitle')}
				description={t('admin.sections.streamProtocol.experimentalDescription')}
				type="warning"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<Row gutter={[24, 24]}>
				{/* Standard HLS settings */}
				<Col xs={24} lg={8}>
					<Card
						title={
							<Space>
								<VideoCameraOutlined />
								<span>{t('admin.sections.streamProtocol.standardHls')}</span>
							</Space>
						}
					>
						<Space direction="vertical" style={{ width: '100%' }}>
							<div
								style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
							>
								<Text>{t('admin.sections.streamProtocol.enabledLabel')}</Text>
								<Switch
									checked={config.hlsEnabled}
									onChange={checked => updateConfig('hlsEnabled', checked)}
								/>
							</div>
							<Text type="secondary" style={{ fontSize: 12 }}>
								{t('admin.sections.streamProtocol.standardHlsDescription')}
							</Text>
						</Space>
					</Card>
				</Col>

				{/* LL-HLS settings */}
				<Col xs={24} lg={8}>
					<Card
						title={
							<Space>
								<ThunderboltOutlined />
								<span>LL-HLS (Low-Latency)</span>
								<Tag color="blue">{t('admin.sections.streamProtocol.experimentalTag')}</Tag>
							</Space>
						}
					>
						<Space direction="vertical" style={{ width: '100%' }}>
							<div
								style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
							>
								<Text>{t('admin.sections.streamProtocol.enabledLabel')}</Text>
								<Switch
									checked={config.llhlsEnabled}
									onChange={checked => updateConfig('llhlsEnabled', checked)}
								/>
							</div>

							{config.llhlsEnabled && (
								<>
									<Divider style={{ margin: '12px 0' }} />
									<Text>{t('admin.sections.streamProtocol.latencyLevel')}</Text>
									<Slider
										min={0}
										max={4}
										value={config.llhlsLatencyLevel}
										onChange={value => updateConfig('llhlsLatencyLevel', value)}
										marks={{
											0: t('admin.sections.streamProtocol.marks.lowest'),
											1: t('admin.sections.streamProtocol.marks.low'),
											2: t('admin.sections.streamProtocol.marks.medium'),
											3: t('admin.sections.streamProtocol.marks.standard'),
											4: t('admin.sections.streamProtocol.marks.reliable'),
										}}
									/>
									{latencyLevels[config.llhlsLatencyLevel] && (
										<Text type="secondary" style={{ fontSize: 12 }}>
											{latencyLevels[config.llhlsLatencyLevel].description}
										</Text>
									)}
								</>
							)}

							<Text type="secondary" style={{ fontSize: 12 }}>
								{t('admin.sections.streamProtocol.llhlsDescription')}
							</Text>
						</Space>
					</Card>
				</Col>

				{/* WebRTC settings */}
				<Col xs={24} lg={8}>
					<Card
						title={
							<Space>
								<GlobalOutlined />
								<span>WebRTC</span>
								<Tag color="orange">{t('admin.sections.streamProtocol.experimentalTag')}</Tag>
							</Space>
						}
					>
						<Space direction="vertical" style={{ width: '100%' }}>
							<div
								style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
							>
								<Text>{t('admin.sections.streamProtocol.enabledLabel')}</Text>
								<Switch
									checked={config.webrtcEnabled}
									onChange={checked => updateConfig('webrtcEnabled', checked)}
								/>
							</div>

							{config.webrtcEnabled && (
								<>
									<Divider style={{ margin: '12px 0' }} />
									<Text>{t('admin.sections.streamProtocol.maxViewers')}</Text>
									<InputNumber
										min={0}
										max={500}
										value={config.webrtcMaxViewers}
										onChange={value => updateConfig('webrtcMaxViewers', value || 0)}
										style={{ width: '100%' }}
									/>
									<Text type="secondary" style={{ fontSize: 12 }}>
										{t('admin.sections.streamProtocol.maxViewersTip')}
									</Text>
								</>
							)}

							<Text type="secondary" style={{ fontSize: 12 }}>
								{t('admin.sections.streamProtocol.webrtcDescription')}
							</Text>
						</Space>
					</Card>
				</Col>

				{/* WebRTC advanced settings */}
				{config.webrtcEnabled && (
					<Col xs={24}>
						<Card
							title={
								<Space>
									<SettingOutlined />
									<span>{t('admin.sections.streamProtocol.webrtcAdvanced')}</span>
								</Space>
							}
						>
							<Row gutter={24}>
								<Col xs={24} md={12}>
									<Space direction="vertical" style={{ width: '100%' }}>
										<Text strong>{t('admin.sections.streamProtocol.iceServers')}</Text>
										<TextArea
											rows={6}
											value={config.webrtcIceServers}
											onChange={e => {
												updateConfig('webrtcIceServers', e.target.value);
												validateIceServers(e.target.value);
											}}
											placeholder='[{"urls": ["stun:stun.l.google.com:19302"]}]'
											status={iceServersError ? 'error' : undefined}
										/>
										{iceServersError && (
											<Text type="danger" style={{ fontSize: 12 }}>
												{iceServersError}
											</Text>
										)}
										<Text type="secondary" style={{ fontSize: 12 }}>
											{t('admin.sections.streamProtocol.iceServersTip')}
										</Text>
										<Divider style={{ margin: '12px 0' }} />
										<Text strong>{t('admin.sections.streamProtocol.udpPort')}</Text>
										<InputNumber
											min={1024}
											max={65535}
											value={config.webrtcUdpPort}
											onChange={value => updateConfig('webrtcUdpPort', value || 52000)}
											style={{ width: '100%' }}
										/>
										<Text type="secondary" style={{ fontSize: 12, whiteSpace: 'pre-line' }}>
											{t('admin.sections.streamProtocol.udpPortTip')}
										</Text>
									</Space>
								</Col>
								<Col xs={24} md={12}>
									{webrtcStats && (
										<Space direction="vertical" style={{ width: '100%' }}>
											<Text strong>{t('admin.sections.streamProtocol.webrtcStats')}</Text>
											<Row gutter={16}>
												<Col span={12}>
													<Statistic
														title={t('admin.sections.streamProtocol.currentViewers')}
														value={webrtcStats.viewerCount}
														suffix={`/ ${webrtcStats.maxViewers || '∞'}`}
													/>
												</Col>
												<Col span={12}>
													<Statistic
														title={t('admin.sections.streamProtocol.status')}
														valueRender={() => (
															<Tag color={webrtcStats.enabled ? 'green' : 'default'}>
																{webrtcStats.enabled
																	? t('admin.sections.streamProtocol.statusEnabled')
																	: t('admin.sections.streamProtocol.statusDisabled')}
															</Tag>
														)}
													/>
												</Col>
											</Row>

											{webrtcStats.viewers.length > 0 && (
												<>
													<div
														style={{
															display: 'flex',
															justifyContent: 'space-between',
															alignItems: 'center',
															marginTop: 16,
														}}
													>
														<Text strong>{t('admin.sections.streamProtocol.connectedViewers')}</Text>
														<Button
															danger
															size="small"
															icon={<DisconnectOutlined />}
															onClick={disconnectAllViewers}
														>
															{t('admin.sections.streamProtocol.disconnectAll')}
														</Button>
													</div>
													<Table
														dataSource={webrtcStats.viewers}
														columns={webrtcViewerColumns}
														rowKey="id"
														size="small"
														pagination={false}
														scroll={{ y: 200 }}
													/>
												</>
											)}
										</Space>
									)}
								</Col>
							</Row>
						</Card>
					</Col>
				)}

				{/* Save button */}
				<Col xs={24}>
					<Space>
						<Button type="primary" onClick={saveConfig} loading={saving}>
							{t('admin.sections.streamProtocol.saveButton')}
						</Button>
						<Button icon={<ReloadOutlined />} onClick={fetchConfig}>
							{t('admin.sections.streamProtocol.reload')}
						</Button>
					</Space>
				</Col>
			</Row>
		</div>
	);
}
