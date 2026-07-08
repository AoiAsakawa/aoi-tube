import { GoogleOutlined } from '@ant-design/icons';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatUserBadge } from './ChatUserBadge';

export type GoogleAuthBadgeProps = {
	userColor: number;
};

export const GoogleAuthBadge: FC<GoogleAuthBadgeProps> = ({ userColor }) => {
	const { t } = useTranslation();
	return (
		<ChatUserBadge
			badge={<GoogleOutlined />}
			userColor={userColor}
			title={t('chat.googleAuthenticated')}
		/>
	);
};
