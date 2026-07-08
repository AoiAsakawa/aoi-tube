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
	TEXTFIELD_PROPS_LIVE_POSTER,
} from '../../utils/config-constants';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';

import {
	ACCEPTED_IMAGE_TYPES,
	getBase64,
	MAX_IMAGE_FILESIZE,
	readableBytes,
} from '../../utils/images';

// Lazy loaded components

const UploadOutlined = dynamic(() => import('@ant-design/icons/UploadOutlined'), {
	ssr: false,
});

// Upload form for the poster image shown while the stream is live but the
// first thumbnail has not been generated yet (start of broadcast / pre-play).
// Mirrors the offline clip / offline media sections: status line, detailed
// description and an always-visible preview of the currently-effective image.
export const EditLivePoster: FC = () => {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);
	const [previewKey, setPreviewKey] = useState(0);
	const posterUrlRef = useRef<string | null>(null);

	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const hasCustomLivePoster = serverConfig?.instanceDetails?.hasCustomLivePoster;

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	let resetTimer = null;

	const { apiPath, tip, label } = TEXTFIELD_PROPS_LIVE_POSTER;

	// Clear out any validation states and messaging
	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	const markCustomState = (isCustom: boolean) => {
		setFieldInConfigState({
			fieldName: 'hasCustomLivePoster',
			value: isCustom,
			path: 'instanceDetails',
		});
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
				posterUrlRef.current = url;
				setTimeout(() => res(), 100);
			});
		});
	};

	// Post the new poster to the api
	const handlePosterUpdate: UploadProps['customRequest'] = async options => {
		const { onSuccess, onError } = options;
		const newPosterUrl = posterUrlRef.current;

		if (!newPosterUrl) {
			setSubmitStatus(createInputStatus(STATUS_ERROR, t('admin.fields.livePoster.loadFailed')));
			setLoading(false);
			return;
		}

		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		await postConfigUpdateToAPI({
			apiPath,
			data: { value: newPosterUrl },
			onSuccess: () => {
				setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.fields.livePoster.updated')));
				setLoading(false);
				setPreviewKey(k => k + 1);
				markCustomState(true);
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

	// Reset to the built-in "LIVE" placeholder.
	const handleReset = async () => {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));
		await postConfigUpdateToAPI({
			apiPath,
			data: { value: '' },
			onSuccess: () => {
				setSubmitStatus(
					createInputStatus(STATUS_SUCCESS, t('admin.fields.livePoster.resetSuccess')),
				);
				setPreviewKey(k => k + 1);
				markCustomState(false);
			},
			onError: (msg: string) => {
				setSubmitStatus(
					createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
				);
			},
		});
		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	return (
		<div className="formfield-container">
			<div className="label-side">
				<span className="formfield-label">{t(label)}</span>
			</div>

			<div className="input-side">
				<div className="input-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<Upload
						name="livePoster"
						listType="picture"
						className="avatar-uploader"
						showUploadList={false}
						accept={ACCEPTED_IMAGE_TYPES.join(',')}
						beforeUpload={beforeUpload}
						customRequest={handlePosterUpdate}
						disabled={loading}
					>
						<Button icon={<UploadOutlined />} loading={loading}>
							{t('admin.fields.livePoster.uploadButton')}
						</Button>
					</Upload>

					<Button onClick={handleReset} disabled={!hasCustomLivePoster}>
						{t('admin.fields.livePoster.resetButton')}
					</Button>

					<span style={{ opacity: 0.8 }}>
						{t('admin.layout.common.statusLabel')}{' '}
						{hasCustomLivePoster
							? t('admin.fields.livePoster.statusCustom')
							: t('admin.fields.livePoster.statusDefault')}
					</span>
				</div>

				<FormStatusIndicator status={submitStatus} />
				<p className="field-tip">{t(tip)}</p>

				<div style={{ marginTop: '15px' }}>
					<span style={{ opacity: 0.8, display: 'block', marginBottom: '8px' }}>
						{t('admin.fields.livePoster.previewLabel', {
							type: hasCustomLivePoster
								? t('admin.fields.livePoster.statusCustom')
								: t('admin.fields.livePoster.statusDefault'),
						})}
					</span>
					<img
						key={previewKey}
						src={`/liveposter?_=${previewKey}`}
						alt=""
						style={{
							maxWidth: '300px',
							maxHeight: '200px',
							borderRadius: '8px',
							border: '1px solid var(--color-panel-border)',
							objectFit: 'contain',
							backgroundColor: 'var(--color-overlay-medium)',
						}}
					/>
				</div>
			</div>
		</div>
	);
};
