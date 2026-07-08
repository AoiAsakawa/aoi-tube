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

export const GoogleAuth = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { googleAuth } = serverConfig || {};

	const { clientId, clientSecret } = googleAuth || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	// Field metadata is defined inside the component so the strings can be
	// localized with the active language.
	const GOOGLE_AUTH_CONFIG_FIELDS = {
		clientId: {
			fieldName: 'clientId',
			configPath: 'googleAuth',
			label: 'Client ID',
			tip: t('admin.sections.googleAuth.clientIdTip'),
			placeholder: t('admin.sections.googleAuth.clientIdPlaceholder'),
		},
		clientSecret: {
			fieldName: 'clientSecret',
			configPath: 'googleAuth',
			label: 'Client Secret',
			tip: t('admin.sections.googleAuth.clientSecretTip'),
			placeholder: t('admin.sections.googleAuth.clientSecretPlaceholder'),
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
			apiPath: '/googleauth',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'googleAuth',
					value: postValue,
					path: '',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.googleAuth.saved')));
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
			<Title level={3}>{t('admin.sections.googleAuth.title')}</Title>
			<Paragraph>{t('admin.sections.googleAuth.description')}</Paragraph>

			<SetupGuide
				title={t('admin.sections.googleAuth.stepsTitle')}
				steps={[
					<>
						<Link
							href="https://console.cloud.google.com/apis/credentials"
							target="_blank"
							rel="noopener noreferrer"
						>
							Google Cloud Console
						</Link>
						{t('admin.sections.googleAuth.step1AfterLink')}
					</>,
					t('admin.sections.googleAuth.step2'),
					t('admin.sections.googleAuth.step3'),
					t('admin.sections.googleAuth.step4'),
					<>
						{t('admin.sections.googleAuth.step5')}
						<br />
						<Text
							code
						>{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/google/callback`}</Text>
					</>,
					t('admin.sections.googleAuth.step6'),
				]}
			/>

			<Paragraph>
				<Text type="secondary">{t('admin.sections.googleAuth.oauthConsentNote')}</Text>
			</Paragraph>

			{isConfigured && (
				<Alert
					message={t('admin.sections.googleAuth.configuredTitle')}
					description={t('admin.sections.googleAuth.configuredDescription')}
					type="success"
					showIcon
					style={{ marginBottom: '20px' }}
				/>
			)}

			<TextField
				{...GOOGLE_AUTH_CONFIG_FIELDS.clientId}
				value={formDataValues.clientId || ''}
				onChange={handleFieldChange}
			/>

			<TextField
				{...GOOGLE_AUTH_CONFIG_FIELDS.clientSecret}
				type={TEXTFIELD_TYPE_PASSWORD}
				value={formDataValues.clientSecret || ''}
				onChange={handleFieldChange}
			/>

			<FormStatusIndicator status={submitStatus} />

			<Button type="primary" onClick={handleSave} style={{ marginTop: '10px' }}>
				{t('admin.sections.googleAuth.save')}
			</Button>
		</>
	);
};

export default GoogleAuth;
