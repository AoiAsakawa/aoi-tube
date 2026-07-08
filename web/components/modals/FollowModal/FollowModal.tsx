import { Input, Button, Alert, Spin, Space } from 'antd';
import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './FollowModal.module.scss';
import { isValidFediverseAccount } from '../../../utils/validators';

const ENDPOINT = '/api/remotefollow';

export type FollowModalProps = {
	handleClose: () => void;
	account: string;
	name: string;
};

export const FollowModal: FC<FollowModalProps> = ({ handleClose, account, name }) => {
	const { t } = useTranslation();
	const [remoteAccount, setRemoteAccount] = useState(null);
	const [valid, setValid] = useState(false);
	const [loading, setLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState(null);

	const handleAccountChange = a => {
		setRemoteAccount(a);
		if (isValidFediverseAccount(a)) {
			setValid(true);
		} else {
			setValid(false);
		}
	};

	const joinButtonPressed = () => {
		window.open('https://owncast.online/join-fediverse', '_blank');
	};

	const remoteFollowButtonPressed = async () => {
		if (!valid) {
			return;
		}

		setLoading(true);

		try {
			const sanitizedAccount = remoteAccount.replace(/^@+/, '');
			const request = { account: sanitizedAccount };
			const rawResponse = await fetch(ENDPOINT, {
				method: 'POST',
				body: JSON.stringify(request),
			});
			const result = await rawResponse.json();

			if (result.redirectUrl) {
				window.open(result.redirectUrl, '_blank');
				handleClose();
			}
			if (!result.success) {
				setErrorMessage(result.message);
				setLoading(false);
				return;
			}
			if (!result.redirectUrl) {
				setErrorMessage('Unable to follow.');
				setLoading(false);
				return;
			}
		} catch (e) {
			setErrorMessage(e.message);
		}
		setLoading(false);
	};

	return (
		<Space direction="vertical" id="follow-modal">
			<div className={styles.header}>
				{t('modals.follow.headerPrefix')}
				<a href="https://owncast.online/join-fediverse" target="_blank" rel="noreferrer">
					&nbsp;{t('modals.follow.learnFediverseLink')}&nbsp;
				</a>
				{t('modals.follow.headerSuffix')}
			</div>

			<Spin spinning={loading}>
				{errorMessage && (
					<Alert
						message={t('modals.follow.errorTitle')}
						description={errorMessage}
						type="error"
						showIcon
					/>
				)}
				<div className={styles.account}>
					<img src="/logo" alt="logo" className={styles.logo} />
					<div className={styles.username}>
						<div className={styles.name}>{name}</div>
						<div>{account}</div>
					</div>
				</div>

				<div>
					<div className={styles.instructions}>{t('modals.follow.instructions')}</div>
					<Input
						value={remoteAccount}
						size="large"
						onChange={e => handleAccountChange(e.target.value)}
						placeholder={t('modals.follow.accountPlaceholder')}
						defaultValue={remoteAccount}
					/>
					<div className={styles.footer}>{t('modals.follow.footer')}</div>
				</div>
				<Space className={styles.buttons}>
					<Button disabled={!valid} type="primary" onClick={remoteFollowButtonPressed}>
						{t('modals.follow.followButton')}
					</Button>
					<Button onClick={joinButtonPressed} type="primary">
						{t('modals.follow.joinButton')}
					</Button>
				</Space>
			</Spin>
		</Space>
	);
};
