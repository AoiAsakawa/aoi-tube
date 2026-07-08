import { Button, Upload, UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload';
import React, { useState, useContext, FC, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { FormStatusIndicator } from './FormStatusIndicator';
import { ServerStatusContext } from '../../utils/server-status-context';
import {
	postConfigUpdateToAPI,
	RESET_TIMEOUT,
	TEXTFIELD_PROPS_LOGO,
} from '../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { NEXT_PUBLIC_API_HOST } from '../../utils/apis';

import {
	ACCEPTED_IMAGE_TYPES,
	getBase64,
	MAX_IMAGE_FILESIZE,
	readableBytes,
} from '../../utils/images';

// Lazy loaded components

const LoadingOutlined = dynamic(() => import('@ant-design/icons/LoadingOutlined'), {
	ssr: false,
});

const UploadOutlined = dynamic(() => import('@ant-design/icons/UploadOutlined'), {
	ssr: false,
});

export const EditLogo: FC = () => {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
	const [logoCachedbuster, setLogoCacheBuster] = useState(0);
	const logoUrlRef = useRef<string | null>(null);

	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const currentLogoPath = serverConfig?.instanceDetails?.logo || '';

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	let resetTimer = null;

	const { apiPath, tip } = TEXTFIELD_PROPS_LOGO;

	// Clear out any validation states and messaging
	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	// validate file type and create base64 encoded img
	const beforeUpload = (file: RcFile) => {
		setLoading(true);

		return new Promise<void>((res, rej) => {
			if (file.size > MAX_IMAGE_FILESIZE) {
				const msg = `File size is too big: ${readableBytes(file.size)}`;
				setSubmitStatus(createInputStatus(STATUS_ERROR, `There was an error: ${msg}`));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
				setLoading(false);
				return rej();
			}
			if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
				const msg = `File type is not supported: ${file.type}`;
				setSubmitStatus(createInputStatus(STATUS_ERROR, `There was an error: ${msg}`));
				resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
				setLoading(false);
				return rej();
			}

			getBase64(file, (url: string) => {
				logoUrlRef.current = url;
				setTimeout(() => res(), 100);
			});
		});
	};

	// Post new logo to api
	const handleLogoUpdate: UploadProps['customRequest'] = async options => {
		const { onSuccess, onError } = options;
		const newLogoUrl = logoUrlRef.current;

		if (!newLogoUrl) {
			setSubmitStatus(createInputStatus(STATUS_ERROR, t('admin.layout.editLogo.loadFailed')));
			setLoading(false);
			return;
		}

		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		await postConfigUpdateToAPI({
			apiPath,
			data: { value: newLogoUrl },
			onSuccess: () => {
				setFieldInConfigState({ fieldName: 'logo', value: newLogoUrl, path: '' });
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.editLogo.updated')));
				setLoading(false);
				setLogoCacheBuster(Math.floor(Math.random() * 100)); // Force logo to re-load
				onSuccess?.({});
			},
			onError: (msg: string) => {
				setSubmitStatus(
					createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
				);
				setLoading(false);
				onError?.(new Error(msg));
			},
		});
		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	const logoDisplayUrl = `${NEXT_PUBLIC_API_HOST}logo?random=${logoCachedbuster}`;

	return (
		<div className="formfield-container logo-upload-container">
			<div className="label-side">
				<span className="formfield-label">{t('admin.fields.logo.label')}</span>
			</div>

			<div className="input-side">
				<div className="input-group">
					<img src={logoDisplayUrl} alt="avatar" className="logo-preview" />
					<Upload
						name="logo"
						listType="picture"
						className="avatar-uploader"
						showUploadList={false}
						accept={ACCEPTED_IMAGE_TYPES.join(',')}
						beforeUpload={beforeUpload}
						customRequest={handleLogoUpdate}
						disabled={loading}
					>
						{loading ? (
							<LoadingOutlined />
						) : (
							<Button icon={<UploadOutlined />} />
						)}
					</Upload>
				</div>
				<span style={{ opacity: 0.8, display: 'block', marginTop: 8 }}>
					{t('admin.layout.common.statusLabel')}{' '}
					{currentLogoPath
						? t('admin.fields.logo.statusCustom', { file: currentLogoPath })
						: t('admin.fields.logo.statusDefault')}
				</span>
				<FormStatusIndicator status={submitStatus} />
				<p className="field-tip">{t(tip)}</p>
			</div>
		</div>
	);
};
