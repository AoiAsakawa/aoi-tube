import { Alert, Button, Input, Space, Spin, Collapse } from 'antd';
import React, { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import styles from './FediAuthModal.module.scss';
import { isValidFediverseAccount } from '../../../utils/validators';

const { Panel } = Collapse;

// Lazy loaded components

const CheckCircleOutlined = dynamic(() => import('@ant-design/icons/CheckCircleOutlined'), {
	ssr: false,
});

export type FediAuthModalProps = {
	authenticated: boolean;
	displayName: string;
	accessToken: string;
};

export const FediAuthModal: FC<FediAuthModalProps> = ({
	authenticated,
	displayName,
	accessToken,
}) => {
	const { t } = useTranslation();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [valid, setValid] = useState(false);
	const [account, setAccount] = useState('');
	const [code, setCode] = useState('');
	const [verifyingCode, setVerifyingCode] = useState(false);

	const message = !authenticated ? (
		<span>
			{t('modals.fediAuth.messagePrefix')} <strong>{displayName}</strong>
			{t('modals.fediAuth.messageSuffix')}
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

	const validate = (acct: string) => {
		setValid(isValidFediverseAccount(acct));
	};

	const onInput: React.FormEventHandler<HTMLInputElement> = e => {
		const { value } = e.target as HTMLInputElement;
		setAccount(value);
		validate(value);
	};

	const makeRequest = async (url, data) => {
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
		}
	};

	const submitCodePressed = async () => {
		setLoading(true);
		const url = `/api/auth/fediverse/verify?accessToken=${accessToken}`;
		const data = { code };

		try {
			await makeRequest(url, data);

			// Success. Reload the page.
			window.location.href = '/';
		} catch (e) {
			console.error(e);
			setErrorMessage(e);
		}
		setLoading(false);
	};

	const submitAccountPressed = async () => {
		if (!valid) {
			return;
		}

		setLoading(true);
		setErrorMessage(null);
		const url = `/api/auth/fediverse?accessToken=${accessToken}`;
		const normalizedAccount = account.replace(/^@+/, '');
		const data = { account: normalizedAccount };

		try {
			await makeRequest(url, data);
			setVerifyingCode(true);
		} catch (e) {
			console.error(e);
			setErrorMessage(e);
		}
		setLoading(false);
	};

	const inputCodeStep = (
		<div>
			{t('modals.fediAuth.codeInstructions')}
			<div className={styles.codeInputContainer}>
				<Input
					value={code}
					onChange={e => setCode(e.target.value)}
					className={styles.codeInput}
					placeholder="123456"
					maxLength={6}
				/>
				<Button
					type="primary"
					onClick={submitCodePressed}
					disabled={code.length < 6}
					className={styles.submitButton}
				>
					{t('modals.fediAuth.verifyCode')}
				</Button>
			</div>
		</div>
	);

	const inputAccountStep = (
		<>
			<div>{t('modals.fediAuth.accountLabel')}</div>
			<Input.Search
				addonBefore="@"
				onInput={onInput}
				value={account}
				placeholder="youraccount@yourserver.com"
				status={!valid && account.length > 0 ? 'error' : undefined}
				onSearch={submitAccountPressed}
				enterButton={
					<Button type={valid ? 'primary' : 'default'} disabled={!valid || account.length === 0}>
						<CheckCircleOutlined />
					</Button>
				}
			/>
		</>
	);

	return (
		<Spin spinning={loading}>
			<Space direction="vertical" style={{ color: '#e2e8f0' }}>
				<span style={{ color: '#e2e8f0' }}>{message}</span>
				{errorMessageText && (
					<Alert
						message={t('modals.common.error')}
						description={errorMessageText}
						type="error"
						showIcon
						style={{ background: '#1a1d24', border: '1px solid #f5222d' }}
					/>
				)}
				{verifyingCode ? inputCodeStep : inputAccountStep}
				<Collapse ghost style={{ color: '#e2e8f0' }}>
					<Panel
						key="header"
						header={
							<span style={{ color: '#a0aec0' }}>{t('modals.fediAuth.learnMoreHeader')}</span>
						}
					>
						<p style={{ color: '#e2e8f0' }}>{t('modals.fediAuth.learnMoreBody')}</p>
					</Panel>
				</Collapse>
				<div style={{ color: '#a0aec0' }}>
					<strong style={{ color: '#e2e8f0' }}>{t('modals.common.noteLabel')}</strong>:
					{t('modals.common.privacyNote')}
				</div>
			</Space>
		</Spin>
	);
};
