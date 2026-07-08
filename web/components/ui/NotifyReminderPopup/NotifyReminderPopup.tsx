import { Popover } from 'antd';
import React, { useState, useEffect, FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import styles from './NotifyReminderPopup.module.scss';

// Lazy loaded components

const CloseOutlined = dynamic(() => import('@ant-design/icons/CloseOutlined'), {
	ssr: false,
});

export type NotifyReminderPopupProps = {
	open: boolean;
	children: React.ReactNode;
	notificationClicked: () => void;
	notificationClosed: () => void;
};

export const NotifyReminderPopup: FC<NotifyReminderPopupProps> = ({
	children,
	open,
	notificationClicked,
	notificationClosed,
}) => {
	const { t } = useTranslation();
	const [openPopup, setOpenPopup] = useState(open);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setOpenPopup(open);
	}, [open]);

	useEffect(() => {
		setMounted(true);
	}, []);

	const title = <div className={styles.title}>{t('ui.notifyReminder.title')}</div>;
	const popupStyle = {
		borderRadius: '5px',
		cursor: 'pointer',
		paddingTop: '10px',
		paddingRight: '10px',
		fontSize: '14px',
	};

	const popupClicked = e => {
		e.stopPropagation();
		notificationClicked();
	};

	const popupClosed = e => {
		e.stopPropagation();
		setOpenPopup(false);
		notificationClosed();
	};

	const content = (
		<div onClick={popupClicked} onKeyDown={popupClicked} role="menuitem" tabIndex={0}>
			<button type="button" className={styles.closebutton} onClick={popupClosed}>
				<CloseOutlined />
			</button>
			<div className={styles.contentbutton}>
				{t('ui.notifyReminder.line1')}
				<br />
				{t('ui.notifyReminder.line2')}
			</div>
		</div>
	);

	return (
		mounted && (
			<Popover
				placement="topRight"
				defaultOpen={openPopup}
				open={openPopup}
				destroyTooltipOnHide
				title={title}
				content={content}
				overlayInnerStyle={popupStyle}
				color="var(--theme-color-components-primary-button-background)"
			>
				{children}
			</Popover>
		)
	);
};
