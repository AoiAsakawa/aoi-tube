import { Button } from 'antd';
import React, { useState, useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerStatusContext } from '../../../utils/server-status-context';
import { TextField } from '../TextField';
import { FormStatusIndicator } from '../FormStatusIndicator';
import {
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
	DISCORD_CONFIG_FIELDS,
} from '../../../utils/config-constants';
import { ToggleSwitch } from '../ToggleSwitch';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_SUCCESS,
} from '../../../utils/input-statuses';
import { UpdateArgs } from '../../../types/config-section';

export const DiscordNotify = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const { notifications } = serverConfig || {};
	const { discord } = notifications || {};

	const { enabled, webhook, goLiveMessage } = discord || {};

	const [formDataValues, setFormDataValues] = useState<any>({});
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	const [enableSaveButton, setEnableSaveButton] = useState<boolean>(false);

	useEffect(() => {
		setFormDataValues({
			enabled,
			webhook,
			goLiveMessage,
		});
	}, [notifications, discord]);

	const canSave = (): boolean => {
		if (webhook === '' || goLiveMessage === '') {
			return false;
		}

		return true;
	};

	// update individual values in state
	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});

		setEnableSaveButton(canSave());
	};

	let resetTimer = null;
	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	const save = async () => {
		const postValue = formDataValues;

		await postConfigUpdateToAPI({
			apiPath: '/notifications/discord',
			data: { value: postValue },
			onSuccess: () => {
				setFieldInConfigState({
					fieldName: 'discord',
					value: postValue,
					path: 'notifications',
				});
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.discordNotify.updated')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	// toggle switch.
	const handleSwitchChange = (switchEnabled: boolean) => {
		// setShouldDisplayForm(storageEnabled);
		handleFieldChange({ fieldName: 'enabled', value: switchEnabled });
	};

	return (
		<>
			{/* The module title is rendered by the SettingsCard that hosts this
			    section on the notifications page. */}
			<p className="description reduced-margins">{t('admin.sections.discordNotify.description')}</p>
			<p className="description reduced-margins">
				<a
					href="https://support.discord.com/hc/en-us/articles/228383668"
					target="_blank"
					rel="noreferrer"
				>
					{t('admin.sections.discordNotify.webhookLinkText')}
				</a>{' '}
				{t('admin.sections.discordNotify.instructionsBeforeItalic')}{' '}
				<i>{t('admin.sections.discordNotify.instructionsItalicText')}</i>{' '}
				{t('admin.sections.discordNotify.instructionsAfterItalic')}
			</p>

			<ToggleSwitch
				apiPath=""
				fieldName="discordEnabled"
				label={t('admin.sections.discordNotify.enableLabel')}
				checked={formDataValues.enabled}
				onChange={handleSwitchChange}
			/>
			<div style={{ display: formDataValues.enabled ? 'block' : 'none' }}>
				<TextField
					{...DISCORD_CONFIG_FIELDS.webhookUrl}
					required
					value={formDataValues.webhook}
					onChange={handleFieldChange}
				/>
			</div>
			<div style={{ display: formDataValues.enabled ? 'block' : 'none' }}>
				<TextField
					{...DISCORD_CONFIG_FIELDS.goLiveMessage}
					required
					value={formDataValues.goLiveMessage}
					onChange={handleFieldChange}
				/>
			</div>

			<Button
				type="primary"
				onClick={save}
				style={{
					display: enableSaveButton ? 'inline-block' : 'none',
					position: 'relative',
					marginLeft: 'auto',
					right: '0',
					marginTop: '20px',
				}}
			>
				{t('admin.sections.discordNotify.save')}
			</Button>
			<FormStatusIndicator status={submitStatus} />
		</>
	);
};
