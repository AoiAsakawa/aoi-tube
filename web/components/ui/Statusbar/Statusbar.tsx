import { formatDistanceToNow, intervalToDuration } from 'date-fns';
import { getDateFnsLocale } from '../../../utils/dateFnsLocale';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import dynamic from '@components/compat/dynamic';
import classNames from 'classnames';
import styles from './Statusbar.module.scss';

// Lazy loaded components

const EyeFilled = dynamic(() => import('@ant-design/icons/EyeFilled'), {
	ssr: false,
});

export type StatusbarProps = {
	online: boolean;
	lastConnectTime?: Date;
	lastDisconnectTime?: Date;
	viewerCount: number;
	className?: string;
};

function makeDurationString(lastConnectTime: Date, t: TFunction): string {
	const diff = intervalToDuration({ start: lastConnectTime, end: new Date() });

	const days = diff.days ?? 0;
	const hours = diff.hours ?? 0;
	const minutes = diff.minutes ?? 0;
	const seconds = diff.seconds ?? 0;

	if (days >= 1) {
		return t('ui.statusbar.durationDaysHours', { days, hours });
	}
	if (hours >= 1) {
		return t('ui.statusbar.durationHoursMinutes', { hours, minutes });
	}

	return t('ui.statusbar.durationMinutesSeconds', { minutes, seconds });
}

export const Statusbar: FC<StatusbarProps> = ({
	online,
	lastConnectTime = null,
	lastDisconnectTime = null,
	viewerCount,
	className,
}) => {
	const { t, i18n } = useTranslation();
	const [, setNow] = useState(new Date());

	// Set a timer to update the status bar.
	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), 1000);
		return () => {
			clearInterval(interval);
		};
	}, []);

	let onlineMessage = '';
	let rightSideMessage: any;
	if (online && lastConnectTime) {
		const duration = makeDurationString(new Date(lastConnectTime), t);
		onlineMessage = online ? t('ui.statusbar.streamingFor', { duration }) : t('ui.statusbar.offline');
		rightSideMessage = viewerCount > 0 && (
			<>
				<span className={styles.viewerIcon}>
					<EyeFilled />
				</span>
				<span>{` ${viewerCount}`}</span>
			</>
		);
	} else if (!online) {
		onlineMessage = t('ui.statusbar.offline');
		if (lastDisconnectTime) {
			rightSideMessage = t('ui.statusbar.lastLive', {
				time: formatDistanceToNow(new Date(lastDisconnectTime), { locale: getDateFnsLocale(i18n.language) }),
			});
		}
	}

	return (
		<div className={classNames(styles.statusbar, className)} role="status">
			<span className={styles.onlineMessage}>{onlineMessage}</span>
			<span className={styles.viewerCount}>{rightSideMessage}</span>
		</div>
	);
};
