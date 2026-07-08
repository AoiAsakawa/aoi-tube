import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, formatArchivePrice } from '../../../interfaces/archive.model';
import { archiveThumbnailURL } from '../../../utils/apis';
import styles from './ArchiveCard.module.scss';

export type ArchiveCardProps = {
	archive: Archive;
	onClick: () => void;
	// Hero treatment for the newest recording: the list's first card spans two
	// grid columns with a larger title.
	hero?: boolean;
};

// Format a duration as H:MM:SS, omitting the hours part when zero, matching
// the compact timestamps video sites overlay on their previews.
const formatDuration = (durationSeconds: number): string => {
	const total = Number.isFinite(durationSeconds) ? Math.max(0, Math.floor(durationSeconds)) : 0;
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	const paddedMinutes = String(minutes).padStart(2, '0');
	const paddedSeconds = String(seconds).padStart(2, '0');
	return hours > 0
		? `${hours}:${paddedMinutes}:${paddedSeconds}`
		: `${paddedMinutes}:${paddedSeconds}`;
};

// A preview card for a single recorded stream: 16:9 thumbnail (or a themed
// placeholder), duration badge, title and start date. The whole card is a
// real <button> so it is keyboard-accessible out of the box.
export const ArchiveCard: FC<ArchiveCardProps> = ({ archive, onClick, hero = false }) => {
	const { t, i18n } = useTranslation();
	// Fall back to the placeholder if the thumbnail image fails to load.
	const [thumbnailFailed, setThumbnailFailed] = useState(false);

	const startedAt = new Date(archive.startedAt);
	const startedAtText = Number.isNaN(startedAt.getTime())
		? ''
		: // Date AND start time: titles repeat across broadcasts, so the time is
			// what tells same-day recordings apart.
			new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
				startedAt,
			);
	const showThumbnail = !!archive.thumbnail && !thumbnailFailed;

	// Access badges. A purchased paid archive shows an "owned" badge; an
	// unpurchased paid one shows a lock + price so a buyer on the wrong account
	// sees it locked (a hint to check which account they are logged in as); an
	// authenticated-only archive shows a members badge.
	const isPaid = archive.accessMode === 'paid';
	const isPurchased = !!archive.purchased;
	const isMembersOnly = archive.accessMode === 'authenticated';
	const priceText = isPaid
		? formatArchivePrice(archive.price ?? 0, archive.currency, i18n.language)
		: '';

	return (
		<button
			type="button"
			className={hero ? `${styles.card} ${styles.hero}` : styles.card}
			onClick={onClick}
		>
			{/* Decorative: the title below already labels the card. */}
			<div className={styles.thumbnail} aria-hidden="true">
				{showThumbnail ? (
					<img
						className={styles.thumbnailImage}
						src={archiveThumbnailURL(archive.id)}
						alt=""
						loading="lazy"
						onError={() => setThumbnailFailed(true)}
					/>
				) : (
					<span className={styles.placeholderGlyph}>▶</span>
				)}
				{isPurchased && (
					<span className={`${styles.badge} ${styles.ownedBadge}`}>
						{t('archives.paid.ownedBadge')}
					</span>
				)}
				{isPaid && !isPurchased && (
					<span className={`${styles.badge} ${styles.paidBadge}`}>{`🔒 ${priceText}`}</span>
				)}
				{isMembersOnly && (
					<span className={`${styles.badge} ${styles.membersBadge}`}>
						{t('archives.paid.membersBadge')}
					</span>
				)}
				<span className={styles.duration}>{formatDuration(archive.durationSeconds)}</span>
				<span className={styles.playGlyph}>▶</span>
			</div>
			<div className={styles.details}>
				<div className={styles.title}>{archive.title || t('archives.untitled')}</div>
				{(startedAtText || archive.quality) && (
					<div className={styles.date}>
						{startedAtText && <time dateTime={archive.startedAt}>{startedAtText}</time>}
						{archive.quality && <span className={styles.quality}>{archive.quality}</span>}
					</div>
				)}
			</div>
		</button>
	);
};
