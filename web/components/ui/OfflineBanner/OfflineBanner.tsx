import { Divider } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { getDateFnsLocale } from '../../../utils/dateFnsLocale';
import dynamic from '@components/compat/dynamic';
import classNames from 'classnames';
import styles from './OfflineBanner.module.scss';

// Lazy loaded components

const ClockCircleOutlined = dynamic(() => import('@ant-design/icons/ClockCircleOutlined'), {
	ssr: false,
});

export type OfflineBannerProps = {
	streamName: string;
	customText?: string;
	lastLive?: Date;
	notificationsEnabled: boolean;
	fediverseAccount?: string;
	twitterProfileUrl?: string;
	offlineMediaUrl?: string;
	offlineMediaType?: string;
	showsHeader?: boolean;
	onNotifyClick?: () => void;
	onFollowClick?: () => void;
	className?: string;
};

export const OfflineBanner: FC<OfflineBannerProps> = ({
	streamName,
	customText,
	lastLive,
	notificationsEnabled,
	fediverseAccount,
	twitterProfileUrl,
	offlineMediaUrl,
	offlineMediaType,
	showsHeader = true,
	onNotifyClick,
	onFollowClick,
	className,
}) => {
	const { t, i18n } = useTranslation();

	let text;
	if (customText) {
		text = customText;
	} else if (!customText && notificationsEnabled && fediverseAccount && twitterProfileUrl) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onNotifyClick}>
					{t('ui.offlineBanner.getNotified')}
				</span>
				{t('ui.offlineBanner.notifySuffix', { streamName })}
				{t('ui.offlineBanner.orFollowFediverse')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onFollowClick}>
					{t('ui.offlineBanner.followFediverseAccount', { fediverseAccount })}
				</span>
				{t('ui.offlineBanner.followSuffix')}
				{t('ui.offlineBanner.alsoFollowTwitterPrefix')}{' '}
				<a
					className={styles.actionLink}
					href={twitterProfileUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('ui.offlineBanner.follow')}
				</a>
				{t('ui.offlineBanner.alsoFollowTwitterSuffix')}
			</span>
		);
	} else if (!customText && notificationsEnabled && fediverseAccount) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onNotifyClick}>
					{t('ui.offlineBanner.getNotified')}
				</span>
				{t('ui.offlineBanner.notifySuffix', { streamName })}
				{t('ui.offlineBanner.orFollowFediverse')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onFollowClick}>
					{t('ui.offlineBanner.followFediverseAccount', { fediverseAccount })}
				</span>
				{t('ui.offlineBanner.followSuffix')}
			</span>
		);
	} else if (!customText && notificationsEnabled && twitterProfileUrl) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onNotifyClick}>
					{t('ui.offlineBanner.getNotified')}
				</span>
				{t('ui.offlineBanner.notifySuffix', { streamName })}
				{t('ui.offlineBanner.orFollowTwitter')}{' '}
				<a
					className={styles.actionLink}
					href={twitterProfileUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('ui.offlineBanner.follow')}
				</a>
				{t('ui.offlineBanner.followSuffix')}
			</span>
		);
	} else if (!customText && notificationsEnabled) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onNotifyClick}>
					{t('ui.offlineBanner.getNotified')}
				</span>
				{t('ui.offlineBanner.notifySuffix', { streamName })}
			</span>
		);
	} else if (!customText && fediverseAccount && twitterProfileUrl) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onFollowClick}>
					{t('ui.offlineBanner.followFediverseAccount', { fediverseAccount })}
				</span>
				{t('ui.offlineBanner.checkBackSuffix', { streamName })}
				{t('ui.offlineBanner.alsoFollowTwitterPrefix')}{' '}
				<a
					className={styles.actionLink}
					href={twitterProfileUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('ui.offlineBanner.follow')}
				</a>
				{t('ui.offlineBanner.alsoFollowTwitterSuffix')}
			</span>
		);
	} else if (!customText && fediverseAccount) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}{' '}
				<span role="link" tabIndex={0} className={styles.actionLink} onClick={onFollowClick}>
					{t('ui.offlineBanner.followFediverseAccount', { fediverseAccount })}
				</span>
				{t('ui.offlineBanner.checkBackSuffix', { streamName })}
			</span>
		);
	} else if (!customText && twitterProfileUrl) {
		text = (
			<span>
				{t('ui.offlineBanner.offline')}
				{t('ui.offlineBanner.onTwitterPrefix')}{' '}
				<a
					className={styles.actionLink}
					href={twitterProfileUrl}
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('ui.offlineBanner.follow')}
				</a>
				{t('ui.offlineBanner.checkBackNoNameSuffix')}
			</span>
		);
	} else {
		text = t('ui.offlineBanner.offlineCheckBackLater');
	}

	return (
		<div id="offline-banner" className={classNames(styles.outerContainer, className)}>
			<div className={styles.innerContainer}>
				{offlineMediaUrl && (
					<div className={styles.mediaContainer}>
						{offlineMediaType === 'video' ? (
							<video
								className={styles.offlineVideo}
								src={offlineMediaUrl}
								autoPlay
								loop
								muted
								playsInline
								controls={false}
							/>
						) : (
							<img className={styles.offlineImage} src={offlineMediaUrl} alt="offline media" />
						)}
					</div>
				)}
				{showsHeader && (
					<>
						<div className={styles.header}>{streamName}</div>
						<Divider className={styles.separator} />
					</>
				)}
				{customText ? (
					<div className={styles.bodyText} dangerouslySetInnerHTML={{ __html: text }} />
				) : (
					<div className={styles.bodyText}>{text}</div>
				)}

				{lastLive && (
					<div className={styles.lastLiveDate}>
						<ClockCircleOutlined className={styles.clockIcon} />
						{t('ui.offlineBanner.lastLive', {
							time: formatDistanceToNow(new Date(lastLive), { locale: getDateFnsLocale(i18n.language) }),
						})}
					</div>
				)}
			</div>
		</div>
	);
};
