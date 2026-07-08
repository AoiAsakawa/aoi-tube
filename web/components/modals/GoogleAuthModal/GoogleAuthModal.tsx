import { Alert, Space, Spin, Button, Typography } from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Paragraph } = Typography;

const CheckCircleOutlined = dynamic(() => import('@ant-design/icons/CheckCircleOutlined'), {
	ssr: false,
});

// Google icon SVG
const GoogleIcon = () => (
	<svg viewBox="0 0 24 24" width="1em" height="1em" style={{ marginRight: '8px' }}>
		<path
			fill="#fff"
			d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
		/>
		<path
			fill="#fff"
			d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
		/>
		<path
			fill="#fff"
			d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
		/>
		<path
			fill="#fff"
			d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
		/>
	</svg>
);

export type GoogleAuthModalProps = {
	authenticated: boolean;
	displayName: string;
	accessToken: string;
};

export const GoogleAuthModal: FC<GoogleAuthModalProps> = ({
	authenticated,
	displayName: username,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const message = !authenticated ? (
		<span>
			{t('modals.common.authAccountPrefix', { provider: 'Google' })} <strong>{username}</strong>{' '}
			{t('modals.common.authAccountSuffix')}
		</span>
	) : (
		<span>
			<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
			<strong>{t('modals.common.alreadyAuthenticated')}</strong>
			{t('modals.common.reauthHint', { provider: 'Google' })}
		</span>
	);

	const submitButtonPressed = async () => {
		setLoading(true);
		setErrorMessage(null);

		try {
			const url = `/api/auth/google?accessToken=${accessToken}`;
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
					{t('modals.common.authRedirectExplanation', { provider: 'Google' })}
				</Paragraph>

				<Button
					className="auth-provider-button"
					type="primary"
					onClick={submitButtonPressed}
					loading={loading}
					size="large"
					icon={<GoogleIcon />}
					style={{ width: '100%', backgroundColor: '#4285F4', borderColor: '#4285F4', color: '#fff' }}
				>
					{t('modals.common.authWithProvider', { provider: 'Google' })}
				</Button>
			</Space>
		</Spin>
	);
};

export default GoogleAuthModal;
