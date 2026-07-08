import { Button, Typography, Alert, Card, Divider } from 'antd';
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerStatusContext } from '../../../utils/server-status-context';
import { TextField, TEXTFIELD_TYPE_TEXTAREA, TEXTFIELD_TYPE_PASSWORD } from '../TextField';
import { postConfigUpdateToAPI, RESET_TIMEOUT } from '../../../utils/config-constants';
import { ToggleSwitch } from '../ToggleSwitch';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_SUCCESS,
} from '../../../utils/input-statuses';
import { UpdateArgs } from '../../../types/config-section';
import { FormStatusIndicator } from '../FormStatusIndicator';

const { Paragraph, Link, Text } = Typography;

export const TwitterNotify = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { notifications } = serverConfig || {};
	const { twitter } = notifications || {};

	// Field metadata is defined inside the component so the strings can be
	// localized with the active language.
	const TWITTER_CONFIG_FIELDS = {
		enabled: {
			fieldName: 'enabled',
			configPath: 'notifications',
			label: t('admin.sections.twitterNotify.enableLabel'),
		},
		consumerKey: {
			fieldName: 'consumerKey',
			configPath: 'notifications',
			label: 'API Key (Consumer Key)',
			tip: t('admin.sections.twitterNotify.consumerKeyTip'),
			placeholder: t('admin.sections.twitterNotify.consumerKeyPlaceholder'),
		},
		consumerSecret: {
			fieldName: 'consumerSecret',
			configPath: 'notifications',
			label: 'API Secret (Consumer Secret)',
			tip: t('admin.sections.twitterNotify.consumerSecretTip'),
			placeholder: t('admin.sections.twitterNotify.consumerSecretPlaceholder'),
		},
		accessToken: {
			fieldName: 'accessToken',
			configPath: 'notifications',
			label: 'Access Token',
			tip: t('admin.sections.twitterNotify.accessTokenTip'),
			placeholder: t('admin.sections.twitterNotify.accessTokenPlaceholder'),
		},
		accessTokenSecret: {
			fieldName: 'accessTokenSecret',
			configPath: 'notifications',
			label: 'Access Token Secret',
			tip: 'Access Token Secret',
			placeholder: t('admin.sections.twitterNotify.accessTokenSecretPlaceholder'),
		},
		goLiveMessage: {
			fieldName: 'goLiveMessage',
			configPath: 'notifications',
			label: t('admin.sections.twitterNotify.goLiveMessageLabel'),
			tip: t('admin.sections.twitterNotify.goLiveMessageTip'),
			placeholder: t('admin.sections.twitterNotify.goLiveMessagePlaceholder'),
		},
		hashtags: {
			fieldName: 'hashtags',
			configPath: 'notifications',
			label: t('admin.sections.twitterNotify.hashtagsLabel'),
			tip: t('admin.sections.twitterNotify.hashtagsTip'),
			placeholder: t('admin.sections.twitterNotify.hashtagsPlaceholder'),
		},
		includeTitle: {
			fieldName: 'includeTitle',
			configPath: 'notifications',
			label: t('admin.sections.twitterNotify.includeTitleLabel'),
		},
		includeServerName: {
			fieldName: 'includeServerName',
			configPath: 'notifications',
			label: t('admin.sections.twitterNotify.includeServerNameLabel'),
		},
	};

	const {
		enabled,
		consumerKey,
		consumerSecret,
		accessToken,
		accessTokenSecret,
		goLiveMessage,
		hashtags,
		includeTitle,
		includeServerName,
	} = twitter || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	let resetTimer = null;

	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	useEffect(() => {
		setFormDataValues({
			enabled,
			consumerKey,
			consumerSecret,
			accessToken,
			accessTokenSecret,
			goLiveMessage,
			hashtags,
			includeTitle: includeTitle !== false,
			includeServerName: includeServerName !== false,
		});
	}, [
		enabled,
		consumerKey,
		consumerSecret,
		accessToken,
		accessTokenSecret,
		goLiveMessage,
		hashtags,
		includeTitle,
		includeServerName,
	]);

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	const handleEnabledSwitchChange = (switchEnabled: boolean) => {
		handleFieldChange({ fieldName: 'enabled', value: switchEnabled });
	};

	const handleSave = async () => {
		const postValue = formDataValues;

		await postConfigUpdateToAPI({
			apiPath: '/notifications/twitter',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'twitter',
					value: postValue,
					path: 'notifications',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.twitterNotify.saved')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	const enabled_field = TWITTER_CONFIG_FIELDS.enabled;
	const consumerKey_field = TWITTER_CONFIG_FIELDS.consumerKey;
	const consumerSecret_field = TWITTER_CONFIG_FIELDS.consumerSecret;
	const accessToken_field = TWITTER_CONFIG_FIELDS.accessToken;
	const accessTokenSecret_field = TWITTER_CONFIG_FIELDS.accessTokenSecret;
	const goLiveMessage_field = TWITTER_CONFIG_FIELDS.goLiveMessage;
	const hashtags_field = TWITTER_CONFIG_FIELDS.hashtags;
	const includeTitle_field = TWITTER_CONFIG_FIELDS.includeTitle;
	const includeServerName_field = TWITTER_CONFIG_FIELDS.includeServerName;

	// Generate preview message
	const generatePreview = () => {
		const parts: string[] = [];
		if (formDataValues.includeServerName) {
			parts.push(t('admin.sections.twitterNotify.previewServerName'));
		}
		if (formDataValues.goLiveMessage) {
			parts.push(formDataValues.goLiveMessage);
		}
		if (formDataValues.includeTitle) {
			parts.push(t('admin.sections.twitterNotify.previewTitle'));
		}
		parts.push(`\n${t('admin.sections.twitterNotify.previewUrl')}`);
		if (formDataValues.hashtags) {
			parts.push(`\n${formDataValues.hashtags}`);
		}
		return parts.join('\n');
	};

	return (
		<>
			{/* The module title is rendered by the SettingsCard that hosts this
			    section on the notifications page. */}
			<Paragraph className="description">{t('admin.sections.twitterNotify.description')}</Paragraph>

			<Alert
				message={t('admin.sections.twitterNotify.apiRequiredTitle')}
				description={
					<>
						{t('admin.sections.twitterNotify.apiRequiredLine1')}
						<br />
						<strong>{t('admin.sections.twitterNotify.importantLabel')}</strong>{' '}
						{t('admin.sections.twitterNotify.apiRequiredLine2')}
						<br />
						<Link href="https://developer.x.com/en/portal/dashboard" target="_blank">
							X Developer Portal →
						</Link>
					</>
				}
				type="info"
				showIcon
				style={{ marginBottom: '1rem' }}
			/>

			<ToggleSwitch
				apiPath=""
				fieldName="enabled"
				label={enabled_field.label}
				onChange={handleEnabledSwitchChange}
				checked={formDataValues.enabled}
			/>

			<Divider orientationMargin={0}>{t('admin.sections.twitterNotify.apiCredentials')}</Divider>

			<TextField
				{...consumerKey_field}
				required
				value={formDataValues.consumerKey}
				onChange={handleFieldChange}
				type={TEXTFIELD_TYPE_PASSWORD}
			/>

			<TextField
				{...consumerSecret_field}
				required
				value={formDataValues.consumerSecret}
				onChange={handleFieldChange}
				type={TEXTFIELD_TYPE_PASSWORD}
			/>

			<TextField
				{...accessToken_field}
				required
				value={formDataValues.accessToken}
				onChange={handleFieldChange}
				type={TEXTFIELD_TYPE_PASSWORD}
			/>

			<TextField
				{...accessTokenSecret_field}
				required
				value={formDataValues.accessTokenSecret}
				onChange={handleFieldChange}
				type={TEXTFIELD_TYPE_PASSWORD}
			/>

			<Divider orientationMargin={0}>{t('admin.sections.twitterNotify.postContent')}</Divider>

			<ToggleSwitch
				apiPath=""
				fieldName="includeServerName"
				label={includeServerName_field.label}
				onChange={(checked: boolean) =>
					handleFieldChange({ fieldName: 'includeServerName', value: checked })
				}
				checked={formDataValues.includeServerName}
			/>

			<ToggleSwitch
				apiPath=""
				fieldName="includeTitle"
				label={includeTitle_field.label}
				onChange={(checked: boolean) =>
					handleFieldChange({ fieldName: 'includeTitle', value: checked })
				}
				checked={formDataValues.includeTitle}
			/>

			<TextField
				{...goLiveMessage_field}
				required
				value={formDataValues.goLiveMessage}
				onChange={handleFieldChange}
				type={TEXTFIELD_TYPE_TEXTAREA}
			/>

			<TextField {...hashtags_field} value={formDataValues.hashtags} onChange={handleFieldChange} />

			<Divider orientationMargin={0}>{t('admin.sections.twitterNotify.postPreview')}</Divider>

			<Card
				style={{
					marginBottom: '1rem',
					background: 'linear-gradient(135deg, rgba(29, 155, 240, 0.1), rgba(29, 155, 240, 0.05))',
					border: '1px solid rgba(29, 155, 240, 0.3)',
				}}
			>
				<Text style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{generatePreview()}</Text>
				<div style={{ marginTop: '12px' }}>
					<img
						src="/notification-thumbnail"
						alt={t('admin.sections.twitterNotify.previewImageAlt')}
						style={{
							maxWidth: '100%',
							maxHeight: '200px',
							borderRadius: '12px',
							border: '1px solid rgba(29, 155, 240, 0.3)',
							objectFit: 'cover',
						}}
					/>
					<Text type="secondary" style={{ display: 'block', fontSize: '12px', marginTop: '4px' }}>
						{t('admin.sections.twitterNotify.previewImageNote')}
					</Text>
				</div>
			</Card>

			<Button type="primary" onClick={handleSave}>
				{t('admin.sections.twitterNotify.saveSettings')}
			</Button>

			<FormStatusIndicator status={submitStatus} />
		</>
	);
};
