import { useTranslation } from 'react-i18next';
import styles from './ChatModeratorNotification.module.scss';
import Icon from '../../../assets/images/moderator.svg?react';

export const ChatModeratorNotification = () => {
	const { t } = useTranslation();

	return (
		<div className={styles.chatModerationNotification}>
			<Icon className={styles.icon} />
			{t('chat.becameModerator')}
		</div>
	);
};
