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
	API_OFFLINE_MEDIA,
	API_OFFLINE_MEDIA_RESET,
	RESET_TIMEOUT,
} from '../../utils/config-constants';
import { postFormData, fetchData, SERVER_CONFIG_UPDATE_URL } from '../../utils/apis';

const UploadOutlined = dynamic(() => import('@ant-design/icons/UploadOutlined'), { ssr: false });

const MAX_OFFLINE_MEDIA_FILESIZE = 50 * 1024 * 1024; // 50MB

export const EditOfflineMedia: FC = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const offlineMediaPath = serverConfig?.instanceDetails?.offlineMediaPath;
	const offlineMediaType = serverConfig?.instanceDetails?.offlineMediaType;
	const hasOfflineMedia = !!offlineMediaPath;

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [mediaKey, setMediaKey] = useState(Date.now());
	let resetTimer = null;

	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	const beforeUpload: UploadProps['beforeUpload'] = file => {
		const name = (file.name || '').toLowerCase();
		const validExt =
			name.endsWith('.mp4') ||
			name.endsWith('.jpg') ||
			name.endsWith('.jpeg') ||
			name.endsWith('.png') ||
			name.endsWith('.gif') ||
			name.endsWith('.webp');

		if (!validExt) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.editOfflineMedia.invalidFileType')),
			);
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			return Upload.LIST_IGNORE;
		}

		if (file.size > MAX_OFFLINE_MEDIA_FILESIZE) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.editOfflineMedia.fileTooLarge')),
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

			await postFormData(`${SERVER_CONFIG_UPDATE_URL}${API_OFFLINE_MEDIA}`, formData, true);

			setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.editOfflineMedia.updated')));
			setMediaKey(Date.now());
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
			await fetchData(`${SERVER_CONFIG_UPDATE_URL}${API_OFFLINE_MEDIA_RESET}`, {
				method: 'POST',
				auth: true,
			});

			setSubmitStatus(createInputStatus(STATUS_SUCCESS, t('admin.layout.editOfflineMedia.deleted')));
			setMediaKey(Date.now());
		} catch (e: any) {
			const msg = e?.message || t('admin.layout.editOfflineMedia.deleteFailed');
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
			);
		}

		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	const statusText = hasOfflineMedia
		? t('admin.layout.editOfflineMedia.configured', {
				type: offlineMediaType || 'unknown',
				path: offlineMediaPath,
			})
		: t('admin.layout.editOfflineMedia.notConfigured');

	const isVideo = offlineMediaType === 'video';
	const previewUrl = hasOfflineMedia ? `/offline-media?_=${mediaKey}` : null;

	return (
		<div className="formfield-container">
			<div className="label-side">
				<span className="formfield-label">{t('admin.layout.editOfflineMedia.label')}</span>
			</div>

			<div className="input-side">
				<div className="input-group" style={{ gap: '10px', display: 'flex', alignItems: 'center' }}>
					<Upload
						accept=".mp4,.jpg,.jpeg,.png,.gif,.webp"
						showUploadList={false}
						beforeUpload={beforeUpload}
						customRequest={handleUpload}
					>
						<Button icon={<UploadOutlined />}>
							{t('admin.layout.editOfflineMedia.uploadButton')}
						</Button>
					</Upload>

					<Button onClick={handleReset} disabled={!hasOfflineMedia}>
						{t('admin.layout.common.delete')}
					</Button>

					<span style={{ opacity: 0.8 }}>
						{t('admin.layout.common.statusLabel')} {statusText}
					</span>
				</div>

				<FormStatusIndicator status={submitStatus} />
				<p className="field-tip">{t('admin.layout.editOfflineMedia.tip')}</p>

				{previewUrl && (
					<div style={{ marginTop: '15px' }}>
						<span style={{ opacity: 0.8, display: 'block', marginBottom: '8px' }}>
							{t('admin.layout.editOfflineMedia.previewLabel')}
						</span>
						{isVideo ? (
							<video
								key={mediaKey}
								src={previewUrl}
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
						) : (
							<img
								key={mediaKey}
								src={previewUrl}
								alt={t('admin.layout.editOfflineMedia.previewAlt')}
								style={{
									maxWidth: '300px',
									maxHeight: '200px',
									borderRadius: '8px',
									border: '1px solid var(--color-panel-border)',
									objectFit: 'contain',
									backgroundColor: 'var(--color-overlay-medium)',
								}}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
};
