import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from '@components/compat/Link';
import { useRouter } from '@components/compat/router';
import { ArchiveCard } from '../ArchiveCard/ArchiveCard';
import { Archive } from '../../../interfaces/archive.model';
import { ARCHIVES, getUnauthedData, withArchiveAccessToken } from '../../../utils/apis';
import { useAccessToken } from '../../stores/zustand-store';
import styles from './ArchivesRow.module.scss';

// Maximum number of recordings surfaced on the main page; the full list
// lives on the /archives page.
const MAX_ARCHIVES_SHOWN = 8;

// A self-contained, horizontally scrollable strip of recent stream
// recordings for the viewer main page. Renders nothing while loading, on
// error, or when there are no public recordings, so it is safe to mount
// unconditionally.
export const ArchivesRow: FC = () => {
	const { t } = useTranslation();
	const router = useRouter();
	const accessToken = useAccessToken();
	const [archives, setArchives] = useState<Archive[]>([]);

	// Include the viewer's token so paid archives carry the correct `purchased`
	// flag (and therefore the owned/locked badges) on the top-page strip.
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const data = await getUnauthedData(withArchiveAccessToken(ARCHIVES, accessToken));
				if (!cancelled && Array.isArray(data)) {
					setArchives(data);
				}
			} catch (_error) {
				// Keep rendering nothing when the archive list cannot be loaded.
			}
		};
		load();
		return () => {
			cancelled = true;
		};
	}, [accessToken]);

	if (archives.length === 0) {
		return null;
	}

	return (
		<section className={styles.container} aria-label={t('archives.recentTitle')}>
			<div className={styles.header}>
				<h2 className={styles.heading}>{t('archives.recentTitle')}</h2>
				<Link href="/archives" className={styles.viewAllLink}>
					{t('archives.viewAll')}
				</Link>
			</div>
			<div className={styles.row}>
				{archives.slice(0, MAX_ARCHIVES_SHOWN).map(archive => (
					<div key={archive.id} className={styles.cardWrapper}>
						<ArchiveCard
							archive={archive}
							onClick={() => router.push(`/archives?watch=${encodeURIComponent(archive.id)}`)}
						/>
					</div>
				))}
			</div>
		</section>
	);
};
