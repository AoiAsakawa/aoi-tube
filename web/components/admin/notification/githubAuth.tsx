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

export const GitHubAuth = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { githubAuth } = serverConfig || {};

	const { clientId, clientSecret } = githubAuth || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	// Field metadata is defined inside the component so the strings can be
	// localized with the active language.
	const GITHUB_AUTH_CONFIG_FIELDS = {
		clientId: {
			fieldName: 'clientId',
			configPath: 'githubAuth',
			label: 'Client ID',
			tip: t('admin.sections.githubAuth.clientIdTip'),
			placeholder: t('admin.sections.githubAuth.clientIdPlaceholder'),
		},
		clientSecret: {
			fieldName: 'clientSecret',
			configPath: 'githubAuth',
			label: 'Client Secret',
			tip: t('admin.sections.githubAuth.clientSecretTip'),
			placeholder: t('admin.sections.githubAuth.clientSecretPlaceholder'),
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
			apiPath: '/githubauth',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'githubAuth',
					value: postValue,
					path: '',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.githubAuth.saved')));
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
			<Title level={3}>{t('admin.sections.githubAuth.title')}</Title>
			<Paragraph>{t('admin.sections.githubAuth.description')}</Paragraph>

			<SetupGuide
				title={t('admin.sections.githubAuth.stepsTitle')}
				steps={[
					<>
						<Link
							href="https://github.com/settings/developers"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub Developer Settings
						</Link>
						{t('admin.sections.githubAuth.step1AfterLink')}
					</>,
					t('admin.sections.githubAuth.step2'),
					t('admin.sections.githubAuth.step3'),
					t('admin.sections.githubAuth.step4'),
					<>
						{t('admin.sections.githubAuth.step5')}
						<br />
						<Text
							code
						>{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/github/callback`}</Text>
					</>,
					t('admin.sections.githubAuth.step6'),
				]}
			/>

			<Paragraph>
				<Text type="secondary">{t('admin.sections.githubAuth.clientSecretNote')}</Text>
			</Paragraph>

			{isConfigured && (
				<Alert
					message={t('admin.sections.githubAuth.configuredTitle')}
					description={t('admin.sections.githubAuth.configuredDescription')}
					type="success"
					showIcon
					style={{ marginBottom: '20px' }}
				/>
			)}

			<TextField
				{...GITHUB_AUTH_CONFIG_FIELDS.clientId}
				value={formDataValues.clientId || ''}
				onChange={handleFieldChange}
			/>

			<TextField
				{...GITHUB_AUTH_CONFIG_FIELDS.clientSecret}
				type={TEXTFIELD_TYPE_PASSWORD}
				value={formDataValues.clientSecret || ''}
				onChange={handleFieldChange}
			/>

			<FormStatusIndicator status={submitStatus} />

			<Button type="primary" onClick={handleSave} style={{ marginTop: '10px' }}>
				{t('admin.sections.githubAuth.save')}
			</Button>
		</>
	);
};

export default GitHubAuth;
