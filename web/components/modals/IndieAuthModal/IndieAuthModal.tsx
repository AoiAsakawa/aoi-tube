import { Alert, Input, Space, Spin, Collapse, Typography, Button } from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidUrl } from '../../../utils/validators';

const { Panel } = Collapse;
const { Link } = Typography;

// Lazy loaded components

const CheckCircleOutlined = dynamic(() => import('@ant-design/icons/CheckCircleOutlined'), {
	ssr: false,
});

export type IndieAuthModalProps = {
	authenticated: boolean;
	displayName: string;
	accessToken: string;
};

export const IndieAuthModal: FC<IndieAuthModalProps> = ({
	authenticated,
	displayName: username,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [valid, setValid] = useState(false);
	const [host, setHost] = useState('');

	const message = !authenticated ? (
		<span>
			{t('modals.indieAuth.messagePrefix')} <span>{username}</span>{' '}
			{t('modals.indieAuth.messageSuffix')}
		</span>
	) : (
		<span>
			<b>{t('modals.common.alreadyAuthenticated')}</b>
			{t('modals.common.reauthHintDomain')}
		</span>
	);

	let errorMessageText = errorMessage;
	if (errorMessageText) {
		if (errorMessageText.includes('url does not support indieauth')) {
			errorMessageText = t('modals.common.indieAuthUrlInvalid');
		}
	}

	const validate = (url: string) => {
		if (!isValidUrl(url)) {
			setValid(false);
			return;
		}

		if (!url.includes('.')) {
			setValid(false);
			return;
		}

		setValid(true);
	};

	const onInput: React.FormEventHandler<HTMLInputElement> = e => {
		const { value } = e.target as HTMLInputElement;
		// Don't allow people to type custom ports or protocols.
		const char = (e.nativeEvent as any).data;
		if (char === ':') {
			return;
		}

		setHost(value);
		const h = `https://${value}`;
		validate(h);
	};

	const submitButtonPressed = async () => {
		if (!valid) {
			return;
		}

		setLoading(true);

		try {
			const url = `/api/auth/indieauth?accessToken=${accessToken}`;
			const h = `https://${host}`;
			const data = { authHost: h };
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			});

			const content = await rawResponse.json();
			if (content.message) {
				setErrorMessage(content.message);
				setLoading(false);
				return;
			}
			if (!content.redirect) {
				setErrorMessage('Auth provider did not return a redirect URL.');
				setLoading(false);
				return;
			}

			if (content.redirect) {
				const { redirect } = content;
				window.location = redirect;
			}
		} catch (e) {
			setErrorMessage(e.message);
		}

		setLoading(false);
	};

	return (
		<Spin spinning={loading}>
			<Space direction="vertical">
				{message}
				{errorMessageText && (
					<Alert
						message={t('modals.common.error')}
						description={errorMessageText}
						type="error"
						showIcon
					/>
				)}
				<div>{t('modals.indieAuth.domainLabel')}</div>
				<Input.Search
					addonBefore="https://"
					onInput={onInput}
					type="url"
					value={host}
					placeholder="yoursite.com"
					status={!valid && host.length > 0 ? 'error' : undefined}
					onSearch={submitButtonPressed}
					enterButton={
						<Button type={valid ? 'primary' : 'default'} disabled={!valid || host.length === 0}>
							<CheckCircleOutlined />
						</Button>
					}
				/>

				<Collapse ghost>
					<Panel key="header" header={t('modals.indieAuth.learnMoreHeader')}>
						<p>{t('modals.indieAuth.learnMoreBody1')}</p>

						<p>
							{t('modals.indieAuth.learnMoreBody2Prefix')}{' '}
							<Link href="https://indieauth.net/#providers">
								{t('modals.indieAuth.learnMoreLink')}
							</Link>
							{t('modals.indieAuth.learnMoreBody2Suffix')}
						</p>
					</Panel>
				</Collapse>
				<div>
					<strong>{t('modals.common.noteLabel')}</strong>:{t('modals.common.privacyNote')}
				</div>
			</Space>
		</Spin>
	);
};
