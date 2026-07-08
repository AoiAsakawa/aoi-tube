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

export const XAuth = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { xAuth } = serverConfig || {};

	const { clientId, clientSecret } = xAuth || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	// Field metadata is defined inside the component so the strings can be
	// localized with the active language.
	// The fieldNames MUST be 'clientId'/'clientSecret': handleFieldChange
	// writes formDataValues[fieldName] and the inputs read
	// formDataValues.clientId/.clientSecret. A past rename to
	// 'xAuthClientId'/'xAuthClientSecret' broke typing entirely (edits landed
	// on unused keys) and saving then overwrote the stored credentials with
	// stale or empty values.
	const X_AUTH_CONFIG_FIELDS = {
		clientId: {
			fieldName: 'clientId',
			configPath: 'xAuth',
			label: 'Client ID',
			tip: t('admin.sections.xAuth.clientIdTip'),
			placeholder: t('admin.sections.xAuth.clientIdPlaceholder'),
		},
		clientSecret: {
			fieldName: 'clientSecret',
			configPath: 'xAuth',
			label: 'Client Secret',
			tip: t('admin.sections.xAuth.clientSecretTip'),
			placeholder: t('admin.sections.xAuth.clientSecretPlaceholder'),
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
			apiPath: '/xauth',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'xAuth',
					value: postValue,
					path: '',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.xAuth.saved')));
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
			<Title level={3}>{t('admin.sections.xAuth.title')}</Title>
			<Paragraph>{t('admin.sections.xAuth.description')}</Paragraph>

			<SetupGuide
				title={t('admin.sections.xAuth.stepsTitle')}
				steps={[
					<>
						<Link
							href="https://developer.x.com/en/portal/dashboard"
							target="_blank"
							rel="noopener noreferrer"
						>
							X Developer Portal
						</Link>
						{t('admin.sections.xAuth.step1AfterLink')}
					</>,
					t('admin.sections.xAuth.step2'),
					t('admin.sections.xAuth.step3'),
					t('admin.sections.xAuth.step4'),
					t('admin.sections.xAuth.step5'),
					<>
						{t('admin.sections.xAuth.step6')}
						<br />
						<Text
							code
						>{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/x/callback`}</Text>
					</>,
					t('admin.sections.xAuth.step7'),
					t('admin.sections.xAuth.step8'),
				]}
			/>

			{isConfigured && (
				<Alert
					message={t('admin.sections.xAuth.configuredTitle')}
					description={t('admin.sections.xAuth.configuredDescription')}
					type="success"
					showIcon
					style={{ marginBottom: '20px' }}
				/>
			)}

			<TextField
				{...X_AUTH_CONFIG_FIELDS.clientId}
				value={formDataValues.clientId || ''}
				onChange={handleFieldChange}
			/>

			<TextField
				{...X_AUTH_CONFIG_FIELDS.clientSecret}
				type={TEXTFIELD_TYPE_PASSWORD}
				value={formDataValues.clientSecret || ''}
				onChange={handleFieldChange}
			/>

			<FormStatusIndicator status={submitStatus} />

			<Button type="primary" onClick={handleSave} style={{ marginTop: '10px' }}>
				{t('admin.sections.xAuth.save')}
			</Button>
		</>
	);
};
