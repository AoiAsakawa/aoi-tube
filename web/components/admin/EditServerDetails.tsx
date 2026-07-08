import React, { useState, useContext, useEffect } from 'react';
import { Collapse, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { TEXTFIELD_TYPE_NUMBER, TEXTFIELD_TYPE_URL } from './TextField';
import { TextFieldWithSubmit } from './TextFieldWithSubmit';
import { ServerStatusContext } from '../../utils/server-status-context';
import { AlertMessageContext } from '../../utils/alert-message-context';
import {
	TEXTFIELD_PROPS_FFMPEG,
	TEXTFIELD_PROPS_RTMP_PORT,
	TEXTFIELD_PROPS_SOCKET_HOST_OVERRIDE,
	TEXTFIELD_PROPS_WEB_PORT,
} from '../../utils/config-constants';
import { UpdateArgs } from '../../types/config-section';
import { ResetYP } from './ResetYP';

const { Panel } = Collapse;

export default function EditInstanceDetails() {
	const { t } = useTranslation();
	const [formDataValues, setFormDataValues] = useState(null);
	const serverStatusData = useContext(ServerStatusContext);
	const { setMessage } = useContext(AlertMessageContext);

	const { serverConfig } = serverStatusData || {};

	const { ffmpegPath, rtmpServerPort, webServerPort, yp, socketHostOverride } = serverConfig || {};

	useEffect(() => {
		setFormDataValues({
			ffmpegPath,
			rtmpServerPort,
			webServerPort,
			socketHostOverride,
		});
	}, [serverConfig]);

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
		setMessage(t('admin.layout.editServerDetails.restartRequired'));
	};

	const showFfmpegChangeMessage = () => {
		if (serverStatusData.online) {
			setMessage(t('admin.layout.editServerDetails.ffmpegApplied'));
		}
	};

	return (
		<div className="edit-server-details-container">
			{/* The internal Basic auth password is managed by the auth proxy and
			    must not be edited here — changing it locks the admin out. Login
			    passwords and keys live on the login-settings page instead. */}
			<TextFieldWithSubmit
				fieldName="ffmpegPath"
				{...TEXTFIELD_PROPS_FFMPEG}
				value={formDataValues.ffmpegPath}
				initialValue={ffmpegPath}
				onChange={handleFieldChange}
				onSubmit={showFfmpegChangeMessage}
			/>
			<TextFieldWithSubmit
				fieldName="webServerPort"
				{...TEXTFIELD_PROPS_WEB_PORT}
				value={formDataValues.webServerPort}
				initialValue={webServerPort}
				type={TEXTFIELD_TYPE_NUMBER}
				onChange={handleFieldChange}
				onSubmit={showConfigurationRestartMessage}
			/>
			<TextFieldWithSubmit
				fieldName="rtmpServerPort"
				{...TEXTFIELD_PROPS_RTMP_PORT}
				value={formDataValues.rtmpServerPort}
				initialValue={rtmpServerPort}
				type={TEXTFIELD_TYPE_NUMBER}
				onChange={handleFieldChange}
				onSubmit={showConfigurationRestartMessage}
			/>
			<Collapse className="advanced-settings">
				<Panel header={t('admin.layout.common.advancedSettings')} key="1">
					<Typography.Paragraph>
						{t('admin.layout.editServerDetails.socketOverrideDesc')}
					</Typography.Paragraph>
					<TextFieldWithSubmit
						fieldName="socketHostOverride"
						{...TEXTFIELD_PROPS_SOCKET_HOST_OVERRIDE}
						value={formDataValues.socketHostOverride}
						initialValue={socketHostOverride || ''}
						type={TEXTFIELD_TYPE_URL}
						onChange={handleFieldChange}
					/>
					{yp.enabled && <ResetYP />}
				</Panel>
			</Collapse>
		</div>
	);
}
