import dynamic from '@components/compat/dynamic';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatUserBadge } from './ChatUserBadge';

// Lazy loaded components

const XOutlined = dynamic(() => import('@ant-design/icons/XOutlined'), {
	ssr: false,
});

export type TwitterAuthBadgeProps = {
	userColor: number;
};

export const TwitterAuthBadge: FC<TwitterAuthBadgeProps> = ({ userColor }) => {
	const { t } = useTranslation();
	return (
		<ChatUserBadge badge={<XOutlined />} userColor={userColor} title={t('chat.xAuthenticated')} />
	);
};
