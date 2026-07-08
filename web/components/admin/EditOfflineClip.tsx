import { Button, Upload, UploadProps } from 'antd';
import React, { FC, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { ServerStatusContext } from '../../utils/server-status-context';
import {
	createInputStatus,
	StatusState,
	STATUS_ERROR,
	STATUS_PROCESSING,
	STATUS_SUCCESS,
} from '../../utils/input-statuses';
import { FormStatusIndicator } from './FormStatusIndicator';
import {
	API_OFFLINE_CLIP,
	API_OFFLINE_CLIP_RESET,
	RESET_TIMEOUT,
} from '../../utils/config-constants';
import { postFormData, fetchData, SERVER_CONFIG_UPDATE_URL } from '../../utils/apis';

const UploadOutlined = dynamic(() => import('@ant-design/icons/UploadOutlined'), { ssr: false });

const MAX_OFFLINE_CLIP_FILESIZE = 25 * 1024 * 1024; // 25MB

export const EditOfflineClip: FC = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const hasCustomOfflineClip = serverConfig?.instanceDetails?.hasCustomOfflineClip;

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [clipKey, setClipKey] = useState(Date.now());
	let resetTimer = null;

	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	const beforeUpload: UploadProps['beforeUpload'] = file => {
		const ext = (file.name || '').toLowerCase();
		const validExt = ext.endsWith('.ts') || ext.endsWith('.tsclip');

		if (!validExt) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.editOfflineClip.invalidFileType')),
			);
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			return Upload.LIST_IGNORE;
		}

		if (file.size > MAX_OFFLINE_CLIP_FILESIZE) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.editOfflineClip.fileTooLarge')),
			);
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			return Upload.LIST_IGNORE;
		}

		return true;
	};

	const handleUpload: UploadProps['customRequest'] = async options => {
		const { file, onSuccess, onError } = options;

		setSubmitStatus(createInputStatus(STATUS_PROCESSING));

		try {
			const formData = new FormData();
			formData.append('file', file as Blob);

			await postFormData(`${SERVER_CONFIG_UPDATE_URL}${API_OFFLINE_CLIP}`, formData, true);

			setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.editOfflineClip.updated')));
			setClipKey(Date.now());
			onSuccess?.({});
		} catch (e: any) {
			const msg = e?.message || t('admin.layout.common.uploadFailed');
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
			);
			onError?.(new Error(msg));
		}

		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	const handleReset = async () => {
		setSubmitStatus(createInputStatus(STATUS_PROCESSING));

		try {
			await fetchData(`${SERVER_CONFIG_UPDATE_URL}${API_OFFLINE_CLIP_RESET}`, {
				method: 'POST',
				auth: true,
			});

			setSubmitStatus(
				createInputStatus(STATUS_SUCCESS, t('admin.layout.editOfflineClip.resetDone')),
			);
			setClipKey(Date.now());
		} catch (e: any) {
			const msg = e?.message || t('admin.layout.common.resetFailed');
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
			);
		}

		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	return (
		<div className="formfield-container">
			<div className="label-side">
				<span className="formfield-label">{t('admin.layout.editOfflineClip.label')}</span>
			</div>

			<div className="input-side">
				<div className="input-group" style={{ gap: '10px', display: 'flex', alignItems: 'center' }}>
					<Upload
						accept=".ts,.tsclip"
						showUploadList={false}
						beforeUpload={beforeUpload}
						customRequest={handleUpload}
					>
						<Button icon={<UploadOutlined />}>
							{t('admin.layout.editOfflineClip.uploadButton')}
						</Button>
					</Upload>

					<Button onClick={handleReset} disabled={!hasCustomOfflineClip}>
						{t('admin.layout.editOfflineClip.resetButton')}
					</Button>

					<span style={{ opacity: 0.8 }}>
						{t('admin.layout.common.statusLabel')}{' '}
						{hasCustomOfflineClip
							? t('admin.layout.editOfflineClip.statusCustom')
							: t('admin.layout.editOfflineClip.statusDefault')}
					</span>
				</div>

				<FormStatusIndicator status={submitStatus} />
				<p className="field-tip">{t('admin.layout.editOfflineClip.tip')}</p>

				<div style={{ marginTop: '15px' }}>
					<span style={{ opacity: 0.8, display: 'block', marginBottom: '8px' }}>
						{t('admin.layout.editOfflineClip.previewLabel', {
							type: hasCustomOfflineClip
								? t('admin.layout.editOfflineClip.previewCustom')
								: t('admin.layout.editOfflineClip.previewDefault'),
						})}
					</span>
					<video
						key={clipKey}
						src={`/offline-clip?_=${clipKey}`}
						autoPlay
						loop
						muted
						playsInline
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
