import { Button } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import styles from './ActionButton/ActionButton.module.scss';

// Lazy loaded components

const BellFilled = dynamic(() => import('@ant-design/icons/BellFilled'), {
	ssr: false,
});

export type NotifyButtonProps = {
	text?: string;
	onClick?: () => void;
};

export const NotifyButton: FC<NotifyButtonProps> = ({ onClick, text }) => {
	const { t } = useTranslation();
	return (
		<Button
			type="primary"
			className={`${styles.button}`}
			icon={<BellFilled />}
			onClick={onClick}
			id="notify-button"
		>
			{text || t('ui.buttons.notify')}
		</Button>
	);
};
