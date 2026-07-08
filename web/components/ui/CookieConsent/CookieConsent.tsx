import { FC, useState, useEffect } from 'react';
import { Button, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import styles from './CookieConsent.module.scss';

const { Text } = Typography;

const COOKIE_CONSENT_KEY = 'cookie_consent_accepted';

export const CookieConsent: FC = () => {
	const { t } = useTranslation();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
		if (!consent) {
			setVisible(true);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
		setVisible(false);
	};

	if (!visible) {
		return null;
	}

	return (
		<div className={styles.container}>
			<div className={styles.content}>
				<Text className={styles.text}>{t('ui.cookieConsent.message')}</Text>
				<Space>
					<Button type="primary" onClick={handleAccept}>
						{t('ui.cookieConsent.accept')}
					</Button>
				</Space>
			</div>
		</div>
	);
};

export default CookieConsent;
