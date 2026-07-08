import React, { useState, useContext, useEffect } from 'react';
import { Typography, Switch, Space, Alert, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import { LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { TextFieldWithSubmit } from '../../TextFieldWithSubmit';
import { TEXTFIELD_TYPE_NUMBER, TEXTFIELD_TYPE_TEXT } from '../../TextField';
import { ServerStatusContext } from '../../../../utils/server-status-context';
import { AlertMessageContext } from '../../../../utils/alert-message-context';
import { UpdateArgs } from '../../../../types/config-section';
import { postConfigUpdateToAPI } from '../../../../utils/config-constants';

const { Paragraph, Title, Text } = Typography;

interface RTMPSConfig {
	enabled: boolean;
	port: number;
	certPath: string;
	keyPath: string;
}

export default function RTMPSConfigComponent() {
	const { t } = useTranslation();
	const [formDataValues, setFormDataValues] = useState<RTMPSConfig | null>(null);
	const [saving, setSaving] = useState(false);
	const serverStatusData = useContext(ServerStatusContext);
	const { setMessage } = useContext(AlertMessageContext);

	const { serverConfig } = serverStatusData || {};
	const { rtmps } = serverConfig || {};

	useEffect(() => {
		if (rtmps) {
			setFormDataValues({
				enabled: rtmps.enabled || false,
				port: rtmps.port || 1936,
				certPath: rtmps.certPath || '',
				keyPath: rtmps.keyPath || '',
			});
		}
	}, [rtmps]);

	if (!formDataValues) {
		return null;
	}

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	const showConfigurationRestartMessage = () => {
		setMessage(t('admin.sections.rtmps.restartRequired'));
	};

	const handleEnabledChange = async (enabled: boolean) => {
		setSaving(true);
		try {
			await postConfigUpdateToAPI({
				apiPath: '/rtmps/enabled',
				data: { value: enabled },
			});
			setFormDataValues({
				...formDataValues,
				enabled,
			});
			showConfigurationRestartMessage();
		} catch {
			setMessage(t('admin.sections.rtmps.enableSaveError'));
		}
		setSaving(false);
	};

	const isConfigValid = formDataValues.certPath && formDataValues.keyPath;

	return (
		<div className="rtmps-config-container">
			<Title level={4}>
				<Space>
					<LockOutlined />
					{t('admin.sections.rtmps.title')}
				</Space>
			</Title>

			<Alert
				message={t('admin.sections.rtmps.aboutTitle')}
				description={
					<div>
						<Paragraph>{t('admin.sections.rtmps.aboutDescription')}</Paragraph>
						<Paragraph>
							<Text strong>{t('admin.sections.rtmps.exampleUrlLabel')}</Text>{' '}
							<Text code>rtmps://your-server.com:{formDataValues.port}/live</Text>
						</Paragraph>
					</div>
				}
				type="info"
				showIcon
				style={{ marginBottom: '20px' }}
			/>

			<Row gutter={16} style={{ marginBottom: '24px' }}>
				<Col span={24}>
					<div
						className="rtmps-enable-container"
						style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
					>
						<Switch
							checked={formDataValues.enabled}
							onChange={handleEnabledChange}
							loading={saving}
							checkedChildren={<LockOutlined />}
							unCheckedChildren={<UnlockOutlined />}
						/>
						<Text strong>{t('admin.sections.rtmps.enableLabel')}</Text>
					</div>
					{formDataValues.enabled && !isConfigValid && (
						<Alert
							message={t('admin.sections.rtmps.pathsWarning')}
							type="warning"
							style={{ marginTop: '12px' }}
						/>
					)}
				</Col>
			</Row>

			<div
				style={{
					opacity: formDataValues.enabled ? 1 : 0.5,
					pointerEvents: formDataValues.enabled ? 'auto' : 'none',
				}}
			>
				<TextFieldWithSubmit
					fieldName="port"
					label={t('admin.sections.rtmps.portLabel')}
					tip={t('admin.sections.rtmps.portTip')}
					apiPath="/rtmps/port"
					value={formDataValues.port}
					initialValue={String(rtmps?.port || 1936)}
					type={TEXTFIELD_TYPE_NUMBER}
					onChange={handleFieldChange}
					onSubmit={showConfigurationRestartMessage}
				/>

				<TextFieldWithSubmit
					fieldName="certPath"
					label={t('admin.sections.rtmps.certPathLabel')}
					tip={t('admin.sections.rtmps.certPathTip')}
					apiPath="/rtmps/certpath"
					value={formDataValues.certPath}
					initialValue={rtmps?.certPath || ''}
					type={TEXTFIELD_TYPE_TEXT}
					onChange={handleFieldChange}
					onSubmit={showConfigurationRestartMessage}
				/>

				<TextFieldWithSubmit
					fieldName="keyPath"
					label={t('admin.sections.rtmps.keyPathLabel')}
					tip={t('admin.sections.rtmps.keyPathTip')}
					apiPath="/rtmps/keypath"
					value={formDataValues.keyPath}
					initialValue={rtmps?.keyPath || ''}
					type={TEXTFIELD_TYPE_TEXT}
					onChange={handleFieldChange}
					onSubmit={showConfigurationRestartMessage}
				/>
			</div>

			{formDataValues.enabled && isConfigValid && (
				<Alert
					message={t('admin.sections.rtmps.configuredTitle')}
					description={
						<div>
							<Paragraph style={{ marginBottom: 0 }}>
								{t('admin.sections.rtmps.configuredDescription')}
							</Paragraph>
							<Paragraph style={{ marginBottom: 0 }}>
								<Text strong>{t('admin.sections.rtmps.serverLabel')}</Text>{' '}
								<Text code>rtmps://your-server.com:{formDataValues.port}/live</Text>
							</Paragraph>
						</div>
					}
					type="success"
					showIcon
					style={{ marginTop: '20px' }}
				/>
			)}
		</div>
	);
}
