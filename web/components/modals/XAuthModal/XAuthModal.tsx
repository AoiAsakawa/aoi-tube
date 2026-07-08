import { Alert, Space, Spin, Button, Typography } from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Paragraph } = Typography;

// X (Twitter) icon
const XIcon = () => (
	<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
		<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
	</svg>
);

const CheckCircleOutlined = dynamic(() => import('@ant-design/icons/CheckCircleOutlined'), {
	ssr: false,
});

export type XAuthModalProps = {
	authenticated: boolean;
	displayName: string;
	accessToken: string;
};

export const XAuthModal: FC<XAuthModalProps> = ({
	authenticated,
	displayName: username,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const message = !authenticated ? (
		<span>
			{t('modals.common.authAccountPrefix', { provider: 'X' })} <strong>{username}</strong>{' '}
			{t('modals.common.authAccountSuffix')}
		</span>
	) : (
		<span>
			<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
			<strong>{t('modals.common.alreadyAuthenticated')}</strong>
			{t('modals.common.reauthHint', { provider: 'X' })}
		</span>
	);

	const submitButtonPressed = async () => {
		setLoading(true);
		setErrorMessage(null);

		try {
			const url = `/api/auth/x?accessToken=${accessToken}`;
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
					{t('modals.common.authRedirectExplanation', { provider: 'X' })}
				</Paragraph>

				<Button
					className="auth-provider-button"
					type="primary"
					onClick={submitButtonPressed}
					loading={loading}
					size="large"
					style={{ width: '100%', backgroundColor: '#000000', borderColor: '#000000', color: '#fff' }}
				>
					<XIcon />
					<span style={{ marginLeft: 8 }}>
						{t('modals.common.authWithProvider', { provider: 'X' })}
					</span>
				</Button>
			</Space>
		</Spin>
	);
};
