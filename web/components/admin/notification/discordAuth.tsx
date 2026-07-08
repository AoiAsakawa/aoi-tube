import { Button, Typography, Alert } from 'antd';
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerStatusContext } from '../../../utils/server-status-context';
import { TextField, TEXTFIELD_TYPE_PASSWORD } from '../TextField';
import { postConfigUpdateToAPI, RESET_TIMEOUT } from '../../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_SUCCESS,
} from '../../../utils/input-statuses';
import { UpdateArgs } from '../../../types/config-section';
import { FormStatusIndicator } from '../FormStatusIndicator';
import { SetupGuide } from '../SetupGuide';

const { Title, Paragraph, Link, Text } = Typography;

export const DiscordAuth = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { discordAuth } = serverConfig || {};

	const { clientId, clientSecret } = discordAuth || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	// Field metadata is defined inside the component so the strings can be
	// localized with the active language.
	// The fieldNames MUST be 'clientId'/'clientSecret': handleFieldChange
	// writes formDataValues[fieldName] and the inputs read
	// formDataValues.clientId/.clientSecret. A past rename to
	// 'discordAuthClientId'/'discordAuthClientSecret' broke typing entirely
	// (edits landed on unused keys) and saving then overwrote the stored
	// credentials with stale or empty values.
	const DISCORD_AUTH_CONFIG_FIELDS = {
		clientId: {
			fieldName: 'clientId',
			configPath: 'discordAuth',
			label: 'Client ID',
			tip: t('admin.sections.discordAuth.clientIdTip'),
			placeholder: t('admin.sections.discordAuth.clientIdPlaceholder'),
		},
		clientSecret: {
			fieldName: 'clientSecret',
			configPath: 'discordAuth',
			label: 'Client Secret',
			tip: t('admin.sections.discordAuth.clientSecretTip'),
			placeholder: t('admin.sections.discordAuth.clientSecretPlaceholder'),
		},
	};

	let resetTimer = null;

	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	useEffect(() => {
		setFormDataValues({
			clientId,
			clientSecret,
		});
	}, [clientId, clientSecret]);

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	const handleSave = async () => {
		const postValue = formDataValues;

		await postConfigUpdateToAPI({
			apiPath: '/discordauth',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'discordAuth',
					value: postValue,
					path: '',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.discordAuth.saved')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	const isConfigured = clientId && clientSecret;

	return (
		<>
			<Title level={3}>{t('admin.sections.discordAuth.title')}</Title>
			<Paragraph>{t('admin.sections.discordAuth.description')}</Paragraph>

			<SetupGuide
				title={t('admin.sections.discordAuth.stepsTitle')}
				steps={[
					<>
						<Link
							href="https://discord.com/developers/applications"
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord Developer Portal
						</Link>
						{t('admin.sections.discordAuth.step1AfterLink')}
					</>,
					t('admin.sections.discordAuth.step2'),
					t('admin.sections.discordAuth.step3'),
					<>
						{t('admin.sections.discordAuth.step4')}
						<br />
						<Text
							code
						>{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/discord/callback`}</Text>
					</>,
				]}
			/>

			{isConfigured && (
				<Alert
					message={t('admin.sections.discordAuth.configuredTitle')}
					description={t('admin.sections.discordAuth.configuredDescription')}
					type="success"
					showIcon
					style={{ marginBottom: '20px' }}
				/>
			)}

			<TextField
				{...DISCORD_AUTH_CONFIG_FIELDS.clientId}
				value={formDataValues.clientId || ''}
				onChange={handleFieldChange}
			/>

			<TextField
				{...DISCORD_AUTH_CONFIG_FIELDS.clientSecret}
				type={TEXTFIELD_TYPE_PASSWORD}
				value={formDataValues.clientSecret || ''}
				onChange={handleFieldChange}
			/>

			<FormStatusIndicator status={submitStatus} />

			<Button type="primary" onClick={handleSave} style={{ marginTop: '10px' }}>
				{t('admin.sections.discordAuth.save')}
			</Button>
		</>
	);
};

export default DiscordAuth;
