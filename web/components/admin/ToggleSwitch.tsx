// This is a wrapper for the Ant Switch component.
// This one is styled to match the form-textfield component.
// If `useSubmit` is true then it will automatically post to the config API onChange.

import React, { useState, useContext, FC } from 'react';
import { Switch } from 'antd';
import { useTranslation } from 'react-i18next';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { FormStatusIndicator } from './FormStatusIndicator';

import { RESET_TIMEOUT, postConfigUpdateToAPI } from '../../utils/config-constants';
import { ServerStatusContext } from '../../utils/server-status-context';

export type ToggleSwitchProps = {
	fieldName: string;

	apiPath?: string;
	checked?: boolean;
	reversed?: boolean;
	configPath?: string;
	disabled?: boolean;
	label?: string;
	tip?: string;
	useSubmit?: boolean;
	onChange?: (arg: boolean) => void;
};

export const ToggleSwitch: FC<ToggleSwitchProps> = ({
	apiPath = '',
	checked = false,
	reversed = false,
	configPath = '',
	disabled = false,
	fieldName,
	label = '',
	tip = '',
	useSubmit = false,
	onChange = null,
}) => {
	const { t } = useTranslation();
	// `label`/`tip` may be i18n keys provided via config-constants; plain
	// strings fall back to themselves.
	const tr = (text?: string): string => (text ? t(text, { defaultValue: text }) : text);
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	let resetTimer = null;

	const serverStatusData = useContext(ServerStatusContext);
	const { setFieldInConfigState } = serverStatusData || {};

	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	const handleChange = async (isChecked: boolean) => {
		if (useSubmit) {
			setSubmitStatus(createInputStatus(STATUS_PROCESSING));
			const isCheckedSend = reversed ? !isChecked : isChecked;

			await postConfigUpdateToAPI({
				apiPath,
				data: { value: isCheckedSend },
				onSuccess: () => {
					setFieldInConfigState({ fieldName, value: isCheckedSend, path: configPath });
					setSubmitStatus(createInputStatus(STATUS_SUCCESS));
				},
				onError: (message: string) => {
					setSubmitStatus(createInputStatus(STATUS_ERROR, t('admin.fields.toggle.error', { message })));
				},
			});
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
		}
		if (onChange) {
			onChange(isChecked);
		}
	};

	const loading = submitStatus !== null && submitStatus.type === STATUS_PROCESSING;
	return (
		<div className="formfield-container toggleswitch-container">
			{label && (
				<div className="label-side">
					<span className="formfield-label">{tr(label)}</span>
				</div>
			)}

			<div className="input-side">
				<div className="input-group">
					<Switch
						className={`switch field-${fieldName}`}
						loading={loading}
						onChange={handleChange}
						defaultChecked={checked}
						checked={checked}
						checkedChildren={t('admin.fields.toggle.on')}
						unCheckedChildren={t('admin.fields.toggle.off')}
						disabled={disabled}
					/>
					<FormStatusIndicator status={submitStatus} />
				</div>
				<p className="field-tip">{tr(tip)}</p>
			</div>
		</div>
	);
};
