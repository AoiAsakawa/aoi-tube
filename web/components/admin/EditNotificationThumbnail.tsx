import { Button, Upload, UploadProps } from 'antd';
import React, { FC, useContext, useState, useEffect } from 'react';
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
	API_NOTIFICATION_THUMBNAIL,
	API_NOTIFICATION_THUMBNAIL_RESET,
	RESET_TIMEOUT,
} from '../../utils/config-constants';
import { postFormData, fetchData, SERVER_CONFIG_UPDATE_URL } from '../../utils/apis';

const UploadOutlined = dynamic(() => import('@ant-design/icons/UploadOutlined'), { ssr: false });

const MAX_NOTIFICATION_THUMBNAIL_FILESIZE = 10 * 1024 * 1024; // 10MB

export const EditNotificationThumbnail: FC = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig } = serverStatusData || {};
	const notificationThumbnailPath = serverConfig?.instanceDetails?.notificationThumbnailPath;
	const hasNotificationThumbnail = !!notificationThumbnailPath;

	const [submitStatus, setSubmitStatus] = useState<StatusState>(null);
	const [imageKey, setImageKey] = useState(Date.now());
	let resetTimer = null;

	useEffect(() => {
		// Force refresh preview when path changes
		setImageKey(Date.now());
	}, [notificationThumbnailPath]);

	const resetStates = () => {
		setSubmitStatus(null);
		clearTimeout(resetTimer);
		resetTimer = null;
	};

	const beforeUpload: UploadProps['beforeUpload'] = file => {
		const ext = (file.name || '').toLowerCase();
		const validExt =
			ext.endsWith('.jpg') ||
			ext.endsWith('.jpeg') ||
			ext.endsWith('.png') ||
			ext.endsWith('.gif') ||
			ext.endsWith('.webp');

		if (!validExt) {
			setSubmitStatus(
				createInputStatus(
					STATUS_ERROR,
					t('admin.layout.editNotificationThumbnail.invalidFileType'),
				),
			);
			resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
			return Upload.LIST_IGNORE;
		}

		if (file.size > MAX_NOTIFICATION_THUMBNAIL_FILESIZE) {
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.editNotificationThumbnail.fileTooLarge')),
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

			await postFormData(
				`${SERVER_CONFIG_UPDATE_URL}${API_NOTIFICATION_THUMBNAIL}`,
				formData,
				true,
			);

			setImageKey(Date.now()); // Refresh preview
			setSubmitStatus(
				createInputStatus(STATUS_SUCCESS, t('admin.layout.editNotificationThumbnail.updated')),
			);
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
			await fetchData(`${SERVER_CONFIG_UPDATE_URL}${API_NOTIFICATION_THUMBNAIL_RESET}`, {
				method: 'POST',
				auth: true,
			});

			setImageKey(Date.now()); // Refresh preview
			setSubmitStatus(
				createInputStatus(STATUS_SUCCESS, t('admin.layout.editNotificationThumbnail.resetDone')),
			);
		} catch (e: any) {
			const msg = e?.message || t('admin.layout.common.resetFailed');
			setSubmitStatus(
				createInputStatus(STATUS_ERROR, t('admin.layout.common.error', { message: msg })),
			);
		}

		resetTimer = setTimeout(resetStates, RESET_TIMEOUT);
	};

	// Preview image URL - falls back to logo if no custom thumbnail
	const previewUrl = `/notification-thumbnail?_=${imageKey}`;

	return (
		<div className="formfield-container">
			<div className="label-side">
				<span className="formfield-label">{t('admin.layout.editNotificationThumbnail.label')}</span>
			</div>

			<div className="input-side">
				{/* Preview */}
				<div style={{ marginBottom: '12px' }}>
					<p style={{ marginBottom: '8px', opacity: 0.8, fontSize: '12px' }}>
						{t('admin.layout.editNotificationThumbnail.current')}
						{hasNotificationThumbnail ? '' : t('admin.layout.editNotificationThumbnail.usingLogo')}:
					</p>
					<img
						key={imageKey}
						src={previewUrl}
						alt={t('admin.layout.editNotificationThumbnail.previewAlt')}
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

				<div className="input-group" style={{ gap: '10px', display: 'flex', alignItems: 'center' }}>
					<Upload
						accept=".jpg,.jpeg,.png,.gif,.webp"
						showUploadList={false}
						beforeUpload={beforeUpload}
						customRequest={handleUpload}
					>
						<Button icon={<UploadOutlined />}>
							{t('admin.layout.editNotificationThumbnail.uploadButton')}
						</Button>
					</Upload>

					<Button onClick={handleReset} disabled={!hasNotificationThumbnail}>
						{t('admin.layout.editNotificationThumbnail.resetButton')}
					</Button>

					<span style={{ opacity: 0.8 }}>
						{t('admin.layout.common.statusLabel')}{' '}
						{hasNotificationThumbnail
							? t('admin.layout.editNotificationThumbnail.statusCustom')
							: t('admin.layout.editNotificationThumbnail.statusNone')}
					</span>
				</div>

				<FormStatusIndicator status={submitStatus} />
				<p className="field-tip">{t('admin.layout.editNotificationThumbnail.tip')}</p>
			</div>
		</div>
	);
};
