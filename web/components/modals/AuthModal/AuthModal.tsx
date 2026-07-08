import { Tabs } from 'antd';
import { XOutlined } from '@ant-design/icons';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import { FediAuthModal } from '../FediAuthModal/FediAuthModal';
import { DiscordAuthModal } from '../DiscordAuthModal/DiscordAuthModal';
import { XAuthModal } from '../XAuthModal/XAuthModal';
import { GoogleAuthModal } from '../GoogleAuthModal/GoogleAuthModal';
import { GitHubAuthModal } from '../GitHubAuthModal/GitHubAuthModal';

import styles from './AuthModal.module.scss';
import {
	useCurrentUser,
	useChatAuthenticated,
	useAccessToken,
	useClientConfig,
} from '../../stores/zustand-store';
import { ComponentError } from '../../ui/ComponentError/ComponentError';

// Discord icon SVG
const DiscordIcon = () => (
	<svg viewBox="0 0 24 24" width="1em" height="1em" fill="#5865F2" style={{ marginRight: '4px' }}>
		<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
	</svg>
);

// Google icon SVG
const GoogleIcon = () => (
	<svg viewBox="0 0 24 24" width="1em" height="1em" style={{ marginRight: '4px' }}>
		<path
			fill="#4285F4"
			d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
		/>
		<path
			fill="#34A853"
			d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
		/>
		<path
			fill="#FBBC05"
			d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
		/>
		<path
			fill="#EA4335"
			d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
		/>
	</svg>
);

// GitHub icon SVG (official GitHub mark)
const GitHubIcon = () => (
	<svg viewBox="0 0 16 16" width="1em" height="1em" style={{ marginRight: '4px' }}>
		<path
			fill="#24292f"
			d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
		/>
	</svg>
);

export type AuthModalProps = {
	forceTabs?: boolean;
};

export const AuthModal: FC<AuthModalProps> = ({ forceTabs }) => {
	const authenticated = useChatAuthenticated();
	const accessToken = useAccessToken();
	const currentUser = useCurrentUser();
	const clientConfig = useClientConfig();
	const { t } = useTranslation();

	if (!currentUser) {
		return null;
	}
	const { displayName } = currentUser;
	const { federation, authentication } = clientConfig;
	const { enabled: fediverseEnabled } = federation;
	const discordEnabled = authentication?.discordAuthEnabled || false;
	const xAuthEnabled = authentication?.xAuthEnabled || false;
	const googleEnabled = authentication?.googleAuthEnabled || false;
	const githubEnabled = authentication?.githubAuthEnabled || false;

	const fediAuthTabTitle = (
		<span className={styles.tabContent}>
			<img
				className={styles.icon}
				src="/img/fediverse-black.png"
				alt={t('modals.auth.tab', { provider: 'Fediverse' })}
			/>
			{t('modals.auth.tab', { provider: 'Fediverse' })}
		</span>
	);

	const fediAuthTab = (
		<FediAuthModal
			authenticated={authenticated}
			displayName={displayName}
			accessToken={accessToken}
		/>
	);

	const discordAuthTabTitle = (
		<span className={styles.tabContent}>
			<DiscordIcon />
			{t('modals.auth.tab', { provider: 'Discord' })}
		</span>
	);

	const discordAuthTab = (
		<DiscordAuthModal
			authenticated={authenticated}
			displayName={displayName}
			accessToken={accessToken}
		/>
	);

	const xAuthTabTitle = (
		<span className={styles.tabContent}>
			<XOutlined style={{ color: '#000000', fontSize: '16px', marginRight: '4px' }} />
			{t('modals.auth.tab', { provider: 'X' })}
		</span>
	);

	const xAuthTab = (
		<XAuthModal authenticated={authenticated} displayName={displayName} accessToken={accessToken} />
	);

	const googleAuthTabTitle = (
		<span className={styles.tabContent}>
			<GoogleIcon />
			{t('modals.auth.tab', { provider: 'Google' })}
		</span>
	);

	const googleAuthTab = (
		<GoogleAuthModal
			authenticated={authenticated}
			displayName={displayName}
			accessToken={accessToken}
		/>
	);

	const githubAuthTabTitle = (
		<span className={styles.tabContent}>
			<GitHubIcon />
			{t('modals.auth.tab', { provider: 'GitHub' })}
		</span>
	);

	const githubAuthTab = (
		<GitHubAuthModal
			authenticated={authenticated}
			displayName={displayName}
			accessToken={accessToken}
		/>
	);

	const items = [];

	// X OAuth 2.0 tab first if enabled (new implementation)
	if (xAuthEnabled) {
		items.push({ label: xAuthTabTitle, key: '5', children: xAuthTab });
	}

	// Discord tab if enabled
	if (discordEnabled) {
		items.push({ label: discordAuthTabTitle, key: '4', children: discordAuthTab });
	}

	// Google tab if enabled
	if (googleEnabled) {
		items.push({ label: googleAuthTabTitle, key: '6', children: googleAuthTab });
	}

	// GitHub tab if enabled
	if (githubEnabled) {
		items.push({ label: githubAuthTabTitle, key: '7', children: githubAuthTab });
	}

	// Fediverse tab only if federation is enabled
	if (fediverseEnabled) {
		items.push({ label: fediAuthTabTitle, key: '2', children: fediAuthTab });
	}

	const showTabs =
		fediverseEnabled ||
		discordEnabled ||
		xAuthEnabled ||
		googleEnabled ||
		githubEnabled ||
		forceTabs;

	// Default to first available tab
	const defaultKey = xAuthEnabled
		? '5'
		: discordEnabled
			? '4'
			: googleEnabled
				? '6'
				: githubEnabled
					? '7'
					: '2';

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="AuthModal"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div>
				<Tabs
					defaultActiveKey={defaultKey}
					items={items}
					type="card"
					size="small"
					renderTabBar={showTabs ? null : () => null}
				/>
			</div>
		</ErrorBoundary>
	);
};
