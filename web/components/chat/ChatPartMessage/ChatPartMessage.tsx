import { FC } from 'react';
import dynamic from '@components/compat/dynamic';
import { useTranslation } from 'react-i18next';
import { ModerationBadge } from '../ChatUserBadge/ModerationBadge';

import styles from './ChatPartMessage.module.scss';

// Lazy loaded components

const LogoutOutlined = dynamic(() => import('@ant-design/icons/LogoutOutlined'), {
	ssr: false,
});

export type ChatPartMessageProps = {
	isAuthorModerator: boolean;
	userColor: number;
	displayName: string;
};

export const ChatPartMessage: FC<ChatPartMessageProps> = ({
	isAuthorModerator,
	userColor,
	displayName,
}) => {
	const { t } = useTranslation();
	const color = `var(--theme-color-users-${userColor})`;

	return (
		<div className={styles.root}>
			<span style={{ color }}>
				<span className={styles.icon}>
					<LogoutOutlined />
				</span>
				<span className={styles.user}>{displayName}</span>
				{isAuthorModerator && (
					<span>
						<ModerationBadge userColor={userColor} />
					</span>
				)}
			</span>{' '}
			{t('chat.leftChat')}
		</div>
	);
};
