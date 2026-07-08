import React, { useState, useContext, useEffect } from 'react';
import { Button, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import CodeMirror from '@uiw/react-codemirror';
import { bbedit } from '@uiw/codemirror-theme-bbedit';
import { languages } from '@codemirror/language-data';
import {
	TextFieldWithSubmit,
	TEXTFIELD_TYPE_TEXTAREA,
	TEXTFIELD_TYPE_URL,
} from '../../TextFieldWithSubmit';
import { ServerStatusContext } from '../../../../utils/server-status-context';
import { useSiteTheme } from '../../../../utils/useSiteTheme';
import {
	postConfigUpdateToAPI,
	TEXTFIELD_PROPS_INSTANCE_URL,
	TEXTFIELD_PROPS_SERVER_NAME,
	TEXTFIELD_PROPS_SERVER_SUMMARY,
	TEXTFIELD_PROPS_SERVER_OFFLINE_MESSAGE,
	API_YP_SWITCH,
	FIELD_PROPS_YP,
	FIELD_PROPS_NSFW,
	FIELD_PROPS_HIDE_VIEWER_COUNT,
	API_SERVER_OFFLINE_MESSAGE,
} from '../../../../utils/config-constants';
import { UpdateArgs } from '../../../../types/config-section';
import { ToggleSwitch } from '../../ToggleSwitch';
import { EditLogo } from '../../EditLogo';
import { EditLivePoster } from '../../EditLivePoster';
import { EditOfflineClip } from '../../EditOfflineClip';
import { EditOfflineMedia } from '../../EditOfflineMedia';
import FormStatusIndicator from '../../FormStatusIndicator';
import { createInputStatus, STATUS_SUCCESS } from '../../../../utils/input-statuses';

const { Title } = Typography;

export default function EditInstanceDetails() {
	const { t } = useTranslation();
	const { theme: siteTheme } = useSiteTheme();
	const [formDataValues, setFormDataValues] = useState(null);
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};

	const { instanceDetails, yp, hideViewerCount } = serverConfig;
	const { instanceUrl } = yp;

	const [offlineMessageSaveStatus, setOfflineMessageSaveStatus] = useState(null);

	useEffect(() => {
		setFormDataValues({
			...instanceDetails,
			...yp,
			hideViewerCount,
		});
	}, [instanceDetails, yp]);

	if (!formDataValues) {
		return null;
	}

	// if instanceUrl is empty, we should also turn OFF the `enabled` field of directory.
	const handleSubmitInstanceUrl = () => {
		if (formDataValues.instanceUrl === '') {
			if (yp.enabled === true) {
				postConfigUpdateToAPI({
					apiPath: API_YP_SWITCH,
					data: { value: false },
				});
			}
		}
	};

	const handleSaveOfflineMessage = () => {
		postConfigUpdateToAPI({
			apiPath: API_SERVER_OFFLINE_MESSAGE,
			data: { value: formDataValues.offlineMessage },
		});
		setOfflineMessageSaveStatus(createInputStatus(STATUS_SUCCESS));
		setTimeout(() => {
			setOfflineMessageSaveStatus(null);
		}, 2000);
	};

	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	function handleHideViewerCountChange(enabled: boolean) {
		handleFieldChange({ fieldName: 'hideViewerCount', value: enabled });
	}

	const hasInstanceUrl = instanceUrl !== '';

	return (
		<div className="edit-general-settings">
			<Title level={3} className="section-title">
				{t('admin.sections.instanceDetails.title')}
			</Title>
			<br />

			<TextFieldWithSubmit
				fieldName="name"
				{...TEXTFIELD_PROPS_SERVER_NAME}
				value={formDataValues.name}
				initialValue={instanceDetails.name}
				onChange={handleFieldChange}
			/>

			<TextFieldWithSubmit
				fieldName="instanceUrl"
				{...TEXTFIELD_PROPS_INSTANCE_URL}
				value={formDataValues.instanceUrl}
				initialValue={yp.instanceUrl}
				type={TEXTFIELD_TYPE_URL}
				onChange={handleFieldChange}
				onSubmit={handleSubmitInstanceUrl}
			/>

			<TextFieldWithSubmit
				fieldName="summary"
				{...TEXTFIELD_PROPS_SERVER_SUMMARY}
				type={TEXTFIELD_TYPE_TEXTAREA}
				value={formDataValues.summary}
				initialValue={instanceDetails.summary}
				onChange={handleFieldChange}
			/>

			<div style={{ marginBottom: '30px' }}>
				<div className="field-container">
					<div className="formfield-label">
						<label>{t('admin.sections.instanceDetails.offlineMessageLabel')}</label>
					</div>
					<div className="field-content" style={{ flex: 1 }}>
						<CodeMirror
							value={formDataValues.offlineMessage}
							{...TEXTFIELD_PROPS_SERVER_OFFLINE_MESSAGE}
							placeholder={t('admin.fields.offlineMessage.placeholder')}
							theme={siteTheme === 'dark' ? 'dark' : bbedit}
							height="150px"
							onChange={value => {
								handleFieldChange({ fieldName: 'offlineMessage', value });
							}}
							extensions={[markdown({ base: markdownLanguage, codeLanguages: languages })]}
						/>
						<div className="field-tip">{t('admin.sections.instanceDetails.offlineMessageTip')}</div>
						<div style={{ textAlign: 'right', marginTop: '10px' }}>
							<Button type="primary" onClick={handleSaveOfflineMessage}>
								{t('admin.sections.instanceDetails.saveMessage')}
							</Button>
							<FormStatusIndicator status={offlineMessageSaveStatus} />
						</div>
					</div>
				</div>
			</div>

			{/* Logo section */}
			<EditLogo />

			{/* Live poster (shown while live before the first thumbnail) */}
			<EditLivePoster />

			{/* Offline clip (waiting screen) */}
			<EditOfflineClip />

			{/* Offline media (image/mp4 for UI) */}
			<EditOfflineMedia />

			<ToggleSwitch
				fieldName="hideViewerCount"
				useSubmit
				{...FIELD_PROPS_HIDE_VIEWER_COUNT}
				checked={formDataValues.hideViewerCount}
				onChange={handleHideViewerCountChange}
			/>

			<br />
			<p className="description">
				{t('admin.sections.instanceDetails.directory.beforeLink')}{' '}
				<a href="https://directory.owncast.online" target="_blank" rel="noreferrer">
					<strong>Owncast Directory</strong>
				</a>
				{t('admin.sections.instanceDetails.directory.afterLink')}{' '}
				<a
					href="https://owncast.online/docs/directory/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.sections.instanceDetails.directory.learnMore')}
				</a>
				.
			</p>
			{!yp.instanceUrl && (
				<p className="description">
					{t('admin.sections.instanceDetails.directoryRequiresUrl.beforeStrong')}{' '}
					<strong>{t('admin.sections.instanceDetails.directoryRequiresUrl.strongText')}</strong>{' '}
					{t('admin.sections.instanceDetails.directoryRequiresUrl.afterStrong')}
				</p>
			)}

			<div className="config-yp-container">
				<ToggleSwitch
					fieldName="enabled"
					useSubmit
					{...FIELD_PROPS_YP}
					checked={formDataValues.enabled}
					disabled={!hasInstanceUrl}
				/>
				<ToggleSwitch
					fieldName="nsfw"
					useSubmit
					{...FIELD_PROPS_NSFW}
					checked={formDataValues.nsfw}
					disabled={!hasInstanceUrl}
				/>
			</div>
		</div>
	);
}
