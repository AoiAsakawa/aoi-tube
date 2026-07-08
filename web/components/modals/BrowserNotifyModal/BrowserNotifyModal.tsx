import { Row, Spin, Typography, Button } from 'antd';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { useAccessToken, useClientConfig } from '../../stores/zustand-store';
import {
	registerWebPushNotifications,
	saveNotificationRegistration,
} from '../../../services/notifications-service';
import styles from './BrowserNotifyModal.module.scss';
import isPushNotificationSupported from '../../../utils/browserPushNotifications';
import { ComponentError } from '../../ui/ComponentError/ComponentError';

const { Title } = Typography;

const NotificationsNotSupported = () => {
	const { t } = useTranslation();
	return <div style={{ color: '#e2e8f0' }}>{t('modals.browserNotify.notSupported')}</div>;
};

const NotificationsNotSupportedLocal = () => {
	const { t } = useTranslation();
	return <div style={{ color: '#e2e8f0' }}>{t('modals.browserNotify.notSupportedLocal')}</div>;
};

export type PermissionPopupPreviewProps = {
	start: () => void;
};

const PermissionPopupPreview: FC<PermissionPopupPreviewProps> = ({ start }) => {
	const { t } = useTranslation();
	return (
		<div id="browser-push-preview-box" className={styles.pushPreview}>
			<div className={styles.inner}>
				<div className={styles.title}>{window.location.toString()} wants to</div>
				<div className={styles.permissionLine}>
					<svg
						className={styles.bell}
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M14 12.3333V13H2V12.3333L3.33333 11V7C3.33333 4.93333 4.68667 3.11333 6.66667 2.52667C6.66667 2.46 6.66667 2.4 6.66667 2.33333C6.66667 1.97971 6.80714 1.64057 7.05719 1.39052C7.30724 1.14048 7.64638 1 8 1C8.35362 1 8.69276 1.14048 8.94281 1.39052C9.19286 1.64057 9.33333 1.97971 9.33333 2.33333C9.33333 2.4 9.33333 2.46 9.33333 2.52667C11.3133 3.11333 12.6667 4.93333 12.6667 7V11L14 12.3333ZM9.33333 13.6667C9.33333 14.0203 9.19286 14.3594 8.94281 14.6095C8.69276 14.8595 8.35362 15 8 15C7.64638 15 7.30724 14.8595 7.05719 14.6095C6.80714 14.3594 6.66667 14.0203 6.66667 13.6667"
							fill="#676670"
						/>
					</svg>
					<span className={styles.showNotificationsText}>
						{t('modals.browserNotify.showNotifications')}
					</span>
				</div>
				<div className={styles.buttonRow}>
					<Button
						type="primary"
						onClick={() => {
							start();
						}}
					>
						{t('modals.browserNotify.allow')}
					</Button>
					<button type="button" className={styles.disabled}>
						{t('modals.browserNotify.block')}
					</button>
				</div>
			</div>
		</div>
	);
};

const NotificationsEnabled = () => {
	const { t } = useTranslation();
	return (
		<div>
			<Title level={2}>{t('modals.browserNotify.enabledTitle')}</Title>
			{t('modals.browserNotify.enabledDescription', {
				host: window.location.hostname.toString(),
			})}
			<a href="https://owncast.online/docs/notifications">{t('modals.browserNotify.learnMore')}</a>
		</div>
	);
};

export const BrowserNotifyModal = () => {
	const { t } = useTranslation();
	const [error, setError] = useState<string>(null);
	const accessToken = useAccessToken();
	const config = useClientConfig();
	const [browserPushPermissionsPending, setBrowserPushPermissionsPending] =
		useState<boolean>(false);
	const notificationsPermitted =
		isPushNotificationSupported() && Notification.permission !== 'default';

	const { notifications } = config;
	const { browser } = notifications;
	const { publicKey } = browser;

	const browserPushSupported = browser.enabled && isPushNotificationSupported();

	// If notification permissions are granted, show user info how to disable them
	if (notificationsPermitted) {
		return <NotificationsEnabled />;
	}

	const startBrowserPushRegistration = async () => {
		// If notification permissions are already denied or granted, don't do anything.
		if (isPushNotificationSupported() && Notification.permission !== 'default') {
			return;
		}

		setBrowserPushPermissionsPending(true);
		try {
			const subscription = await registerWebPushNotifications(publicKey);
			saveNotificationRegistration('BROWSER_PUSH_NOTIFICATION', subscription, accessToken);
			setError(null);
		} catch (e) {
			setError(t('modals.browserNotify.registrationError', { message: e.message }));
		}
		setBrowserPushPermissionsPending(false);
	};

	if (window.location.hostname === 'localhost') {
		return <NotificationsNotSupportedLocal />;
	}

	if (!browserPushSupported) {
		return <NotificationsNotSupported />;
	}

	return (
		<ErrorBoundary
			fallbackRender={({ error: e, resetErrorBoundary }) => (
				<ComponentError
					componentName="BrowserNotifyModal"
					message={e instanceof Error ? e.message : String(e)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<Spin spinning={browserPushPermissionsPending}>
				<Row className={styles.description}>
					{t('modals.browserNotify.description')}
					<a href="https://owncast.online/docs/notifications/#browser-notifications">
						{t('modals.browserNotify.docsLink')}
					</a>
					{t('modals.browserNotify.descriptionSuffix')}
				</Row>
				<Row>{error}</Row>
				<PermissionPopupPreview start={() => startBrowserPushRegistration()} />
			</Spin>
		</ErrorBoundary>
	);
};
