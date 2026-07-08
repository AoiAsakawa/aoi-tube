import { FC } from 'react';
import cn from 'classnames';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
	formatDonationAmount,
	getScreenEffectEmoji,
	getSuperchatTier,
	isHighValueDonation,
	isSuperHighValueDonation,
} from '../../../interfaces/donation.model';
import styles from './ChatDonationMessage.module.scss';

export interface ChatDonationMessageProps {
	amount: number;
	currency: string;
	// JPY value recorded by the server at confirmation time (crypto purchases
	// only); 0 or missing means no conversion was available.
	amountJpy?: number;
	displayName: string;
	message?: string;
	isAnonymous?: boolean;
	timestamp?: Date;
	// What was purchased: "superchat" (default, may be omitted) or "effect".
	itemType?: string;
	// The screen effect purchased when itemType is "effect".
	effectType?: string;
}

export const ChatDonationMessage: FC<ChatDonationMessageProps> = ({
	amount,
	currency,
	amountJpy,
	displayName,
	message,
	isAnonymous = false,
	timestamp,
	itemType,
	effectType,
}) => {
	const { t } = useTranslation();

	const displayNameText = isAnonymous ? t('chat.anonymous') : displayName;

	// Screen effect purchases render as a single celebratory line instead of a
	// superchat card.
	if (itemType === 'effect') {
		const effectName = t(`screenEffects.${effectType}`, { defaultValue: effectType || '' });
		return (
			<div className={styles.effectLine}>
				<span className={styles.effectLineEmoji}>{getScreenEffectEmoji(effectType)}</span>
				<span>{t('screenEffects.sentEffect', { name: displayNameText, effect: effectName })}</span>
			</div>
		);
	}

	const timeAgo = timestamp
		? formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: ja })
		: '';

	// Fiat superchats use YouTube-style amount tier colors keyed on their own
	// currency. Crypto superchats (nativeTier === null) with a server-recorded
	// JPY conversion get the JPY tier colors and a "¥1,234（0.01 ETH）" amount;
	// crypto without a conversion keeps the classic gold styling below.
	const nativeTier = getSuperchatTier(amount, currency);
	const hasJpyConversion = !nativeTier && typeof amountJpy === 'number' && amountJpy > 0;
	const tier = nativeTier ?? (hasJpyConversion ? getSuperchatTier(amountJpy, 'JPY') : null);

	const formattedAmount = hasJpyConversion
		? `${formatDonationAmount(amountJpy, 'JPY')}（${formatDonationAmount(amount, currency)}）`
		: formatDonationAmount(amount, currency);

	if (tier) {
		return (
			<div className={styles.superchatCard} style={{ backgroundColor: tier.body }}>
				<div
					className={styles.superchatHeader}
					style={{ backgroundColor: tier.header, color: tier.headerText }}
				>
					<span className={styles.superchatName}>{displayNameText}</span>
					<span className={styles.superchatAmount}>{formattedAmount}</span>
				</div>
				{(message || timeAgo) && (
					<div className={styles.superchatBody} style={{ color: tier.bodyText }}>
						{message && <div className={styles.superchatMessage}>{message}</div>}
						{timeAgo && <div className={styles.superchatTimestamp}>{timeAgo}</div>}
					</div>
				)}
			</div>
		);
	}

	const isSuperHigh = isSuperHighValueDonation(amount, currency);
	const isHigh = isHighValueDonation(amount, currency);

	const containerClasses = cn(styles.donationContainer, {
		[styles.superHighValue]: isSuperHigh,
		[styles.highValue]: isHigh && !isSuperHigh,
		[styles.anonymous]: isAnonymous,
	});

	return (
		<div className={containerClasses}>
			<div className={styles.donationHeader}>
				<div className={styles.donorInfo}>
					<span className={styles.donationIcon}>💰</span>
					<span className={styles.donorName}>{displayNameText}</span>
				</div>
				<span className={styles.amount}>{formattedAmount}</span>
			</div>
			{message && <div className={styles.message}>{message}</div>}
			{timeAgo && <div className={styles.timestamp}>{timeAgo}</div>}
		</div>
	);
};

export default ChatDonationMessage;
