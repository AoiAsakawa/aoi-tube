import { Button, ButtonProps } from 'antd';

import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import styles from './ActionButton/ActionButton.module.scss';

// Lazy loaded components

const HeartFilled = dynamic(() => import('@ant-design/icons/HeartFilled'), {
	ssr: false,
});

export type FollowButtonProps = ButtonProps & {
	onClick?: () => void;
};

export const FollowButton: FC<FollowButtonProps> = ({ onClick, ...props }) => {
	const { t } = useTranslation();
	return (
		<Button
			{...props}
			type="primary"
			className={styles.button}
			icon={<HeartFilled />}
			onClick={onClick}
			id="follow-button"
		>
			{t('ui.buttons.follow')}
		</Button>
	);
};
