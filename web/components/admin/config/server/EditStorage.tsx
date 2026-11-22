import { Alert, Button, Collapse } from 'antd';
import React, { useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UpdateArgs } from '../../../../types/config-section';
import { ServerStatusContext } from '../../../../utils/server-status-context';
import { AlertMessageContext } from '../../../../utils/alert-message-context';

import {
	postConfigUpdateToAPI,
	API_S3_INFO,
	RESET_TIMEOUT,
	S3_TEXT_FIELDS_INFO,
} from '../../../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../../../utils/input-statuses';
import { TextField } from '../../TextField';
import { FormStatusIndicator } from '../../FormStatusIndicator';
import { isValidUrl } from '../../../../utils/validators';
import { ToggleSwitch } from '../../ToggleSwitch';

const { Panel } = Collapse;

// The server sends the stored secret as this mask and keeps the stored secret
// when it receives the mask back (controllers/admin: maskS3Secret).
export const MASKED_S3_SECRET = '********';

export type S3FormValues = {
	accessKey: string;
	acl: string;
	bucket: string;
	enabled: boolean;
	endpoint: string;
	forcePathStyle: boolean;
	region: string;
	secret: string;
	servingEndpoint: string;
};

const EMPTY_S3: S3FormValues = {
	accessKey: '',
	acl: '',
	bucket: '',
	enabled: false,
	endpoint: '',
	forcePathStyle: false,
	region: '',
	secret: '',
	servingEndpoint: '',
};

const S3_FIELDS = Object.keys(EMPTY_S3) as (keyof S3FormValues)[];

// withS3Defaults fills in the fields the server leaves out when they are empty.
export function withS3Defaults(values?: Partial<S3FormValues> | null): S3FormValues {
	const filled = { ...EMPTY_S3 };
	S3_FIELDS.forEach(key => {
		const value = values?.[key];
		if (value !== undefined && value !== null) {
			(filled as Record<string, unknown>)[key] = value;
		}
	});
	return filled;
}

// The S3 connection is used by database backups and recordings on its own, so
// it can be saved while live distribution (`enabled`) is off. Before, the
// fields were only shown and saved with live distribution on, which needs a
// public bucket: the only way to set up backups to S3 was to make the bucket
// public as well.
export function checkSaveable(
	formValues: S3FormValues,
	currentValues?: Partial<S3FormValues> | null,
): boolean {
	const current = withS3Defaults(currentValues);
	if (!S3_FIELDS.some(key => formValues[key] !== current[key])) {
		return false;
	}

	const { endpoint, accessKey, secret, bucket, region, enabled } = formValues;
	const complete =
		!!endpoint && isValidUrl(endpoint) && !!accessKey && !!secret && !!bucket && !!region;
	if (complete) {
		return true;
	}

	// Clearing the connection is allowed while live distribution is off.
	const cleared = !endpoint && !accessKey && !secret && !bucket && !region;
	return cleared && !enabled;
}

export default function EditStorage() {
	const { t } = useTranslation();
	const [formDataValues, setFormDataValues] = useState<S3FormValues>(null);
	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);

	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};

	const { setMessage: setAlertMessage } = useContext(AlertMessageContext);

	const { s3 } = serverConfig || {};

	useEffect(() => {
		setFormDataValues(withS3Defaults(s3));
	}, [s3]);

	if (!formDataValues) {
		return null;
	}

	let resetTimer = null;
	const resetStates = () => {
		setSubmitStatus(null);
		resetTimer = null;
		clearTimeout(resetTimer);
	};

	// update individual values in state
	const handleFieldChange = ({ fieldName, value }: UpdateArgs) => {
		setFormDataValues({
			...formDataValues,
			[fieldName]: value,
		});
	};

	// posts the whole state
	const handleSave = async () => {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		const postValue = {
			...formDataValues,
			servingEndpoint: formDataValues.servingEndpoint.replace(/\/+$/g, ''),
		};

		await postConfigUpdateToAPI({
			apiPath: API_S3_INFO,
			data: { value: postValue },
			onSuccess: () => {
				// Keep what a reload would show: the mask, not a typed secret.
				const stored = { ...postValue, secret: postValue.secret ? MASKED_S3_SECRET : '' };
				setFieldInConfigState({ fieldName: 's3', value: stored, path: '' });
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.sections.storage.updated')));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
				setAlertMessage(t('admin.sections.storage.restartNote'));
			},
			onError: (message: string) => {
				setSubmitStatus(createInputStatus(STATUS_ERROR, message));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			},
		});
	};

	const handleLiveDistributionChange = (liveEnabled: boolean) => {
		handleFieldChange({ fieldName: 'enabled', value: liveEnabled });
	};

	const handleForcePathStyleSwitchChange = (forcePathStyleEnabled: boolean) => {
		handleFieldChange({ fieldName: 'forcePathStyle', value: forcePathStyleEnabled });
	};

	const isSaveable = checkSaveable(formDataValues, s3);

	return (
		<div className="edit-storage-container form-module">
			<div className="form-fields">
				<div className="field-container">
					<TextField
						{...S3_TEXT_FIELDS_INFO.endpoint}
						value={formDataValues.endpoint}
						onChange={handleFieldChange}
					/>
				</div>
				<div className="field-container">
					<TextField
						{...S3_TEXT_FIELDS_INFO.accessKey}
						value={formDataValues.accessKey}
						onChange={handleFieldChange}
					/>
				</div>
				<div className="field-container">
					<TextField
						{...S3_TEXT_FIELDS_INFO.secret}
						value={formDataValues.secret}
						onChange={handleFieldChange}
					/>
				</div>
				<div className="field-container">
					<TextField
						{...S3_TEXT_FIELDS_INFO.bucket}
						value={formDataValues.bucket}
						onChange={handleFieldChange}
					/>
				</div>
				<div className="field-container">
					<TextField
						{...S3_TEXT_FIELDS_INFO.region}
						value={formDataValues.region}
						onChange={handleFieldChange}
					/>
				</div>

				<Collapse className="advanced-section">
					<Panel header={t('admin.sections.storage.optionalSettings')} key="1">
						<div className="field-container">
							<TextField
								{...S3_TEXT_FIELDS_INFO.acl}
								value={formDataValues.acl}
								onChange={handleFieldChange}
							/>
						</div>
						<div className="enable-switch">
							<ToggleSwitch
								{...S3_TEXT_FIELDS_INFO.forcePathStyle}
								fieldName="forcePathStyle"
								checked={formDataValues.forcePathStyle}
								onChange={handleForcePathStyleSwitchChange}
							/>
						</div>
					</Panel>
				</Collapse>
			</div>

			<div className="live-distribution">
				<ToggleSwitch
					apiPath=""
					fieldName="enabled"
					label={t('admin.sections.storage.liveDistribution.label')}
					tip={t('admin.sections.storage.liveDistribution.tip')}
					checked={formDataValues.enabled}
					onChange={handleLiveDistributionChange}
				/>
				{formDataValues.enabled && (
					<>
						<Alert
							className="live-distribution-warning"
							type="warning"
							showIcon
							message={t('admin.sections.storage.liveDistribution.warning')}
						/>
						<div className="field-container">
							<TextField
								{...S3_TEXT_FIELDS_INFO.servingEndpoint}
								value={formDataValues.servingEndpoint}
								onChange={handleFieldChange}
							/>
						</div>
					</>
				)}
			</div>

			<div className="button-container">
				<Button type="primary" onClick={handleSave} disabled={!isSaveable}>
					{t('admin.sections.storage.save')}
				</Button>
				<FormStatusIndicator status={submitStatus} />
			</div>
		</div>
	);
}
