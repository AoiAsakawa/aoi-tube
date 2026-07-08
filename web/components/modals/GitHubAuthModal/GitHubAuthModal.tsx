import { Alert, Space, Spin, Button, Typography } from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Paragraph } = Typography;

const CheckCircleOutlined = dynamic(() => import('@ant-design/icons/CheckCircleOutlined'), {
	ssr: false,
});

// GitHub icon SVG (official GitHub mark)
const GitHubIcon = () => (
	<svg viewBox="0 0 16 16" width="1em" height="1em" style={{ marginRight: '8px' }}>
		<path
			fill="#fff"
			d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"
		/>
	</svg>
);

export type GitHubAuthModalProps = {
	authenticated: boolean;
	displayName: string;
	accessToken: string;
};

export const GitHubAuthModal: FC<GitHubAuthModalProps> = ({
	authenticated,
	displayName: username,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const message = !authenticated ? (
		<span>
			{t('modals.common.authAccountPrefix', { provider: 'GitHub' })} <strong>{username}</strong>{' '}
			{t('modals.common.authAccountSuffix')}
		</span>
	) : (
		<span>
			<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
			<strong>{t('modals.common.alreadyAuthenticated')}</strong>
			{t('modals.common.reauthHint', { provider: 'GitHub' })}
		</span>
	);

	const submitButtonPressed = async () => {
		setLoading(true);
		setErrorMessage(null);

		try {
			const url = `/api/auth/github?accessToken=${accessToken}`;
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			});

			const content = await rawResponse.json();
			if (content.message) {
				setErrorMessage(content.message);
				setLoading(false);
				return;
			}

			if (content.redirect) {
				const { redirect } = content;
				window.location = redirect;
			} else {
				setErrorMessage(t('modals.common.redirectUrlMissing'));
				setLoading(false);
			}
		} catch (e) {
			setErrorMessage(e.message);
			setLoading(false);
		}
	};

	return (
		<Spin spinning={loading}>
			<Space direction="vertical" style={{ width: '100%', color: 'var(--color-panel-text)' }}>
				<Paragraph style={{ color: 'var(--color-panel-text)' }}>{message}</Paragraph>

				{errorMessage && (
					<Alert
						message={t('modals.common.error')}
						description={errorMessage}
						type="error"
						showIcon
					/>
				)}

				<Paragraph style={{ color: 'var(--color-panel-text-muted)' }}>
					{t('modals.common.authRedirectExplanation', { provider: 'GitHub' })}
				</Paragraph>

				<Button
					className="auth-provider-button"
					type="primary"
					onClick={submitButtonPressed}
					loading={loading}
					size="large"
					icon={<GitHubIcon />}
					style={{ width: '100%', backgroundColor: '#24292f', borderColor: '#24292f', color: '#fff' }}
				>
					{t('modals.common.authWithProvider', { provider: 'GitHub' })}
				</Button>
			</Space>
		</Spin>
	);
};

export default GitHubAuthModal;
