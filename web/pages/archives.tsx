import Head from '@components/compat/Head';
import { Button, Skeleton, message } from 'antd';
import dynamic from '@components/compat/dynamic';
import { useRouter } from '@components/compat/router';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveEvent } from '../interfaces/archive.model';
import {
	archiveEventsURL,
	archiveMp4URL,
	archiveStreamURL,
	getUnauthedData,
	withArchiveAccessToken,
} from '../utils/apis';
import { useAccessToken, useChatAuthenticated } from '../components/stores/zustand-store';
import { useArchives } from '../utils/use-archives';
import { ArchiveCard } from '../components/ui/ArchiveCard/ArchiveCard';
import {
	ARCHIVE_PENDING_PURCHASE_KEY,
	ArchivePurchase,
} from '../components/ui/ArchivePurchase/ArchivePurchase';
import { PageShell } from '../components/ui/PageShell/PageShell';
import { PageEmpty, PageLoading } from '../components/ui/AsyncStates/AsyncStates';
import styles from './archives.module.scss';

const LinkOutlined = dynamic(() => import('@ant-design/icons/LinkOutlined'), { ssr: false });

// The replay view pulls in video.js and react-virtuoso, which touch the DOM,
// so it must only run on the client.
const VodReplay = dynamic(
	() => import('../components/video/VodReplay/VodReplay').then(mod => mod.VodReplay),
	{ ssr: false },
);

// An archive the current viewer cannot play yet: a paid archive they have not
// bought, or a members-only (authenticated) archive while they are not logged
// in. Free (public) and entitled archives play directly. Locked archives are
// diverted to the purchase/login panel instead of the player, which would
// only receive a denied (non-M3U8) playlist response.
const isArchiveLocked = (archive: Archive, chatAuthenticated: boolean): boolean =>
	(archive.accessMode === 'paid' && !archive.purchased) ||
	(archive.accessMode === 'authenticated' && !chatAuthenticated);

const ArchivesPage: FC = () => {
	const { t, i18n } = useTranslation();
	const router = useRouter();
	const accessToken = useAccessToken();
	const chatAuthenticated = useChatAuthenticated();
	const { archives, loading, refresh } = useArchives();
	// Recorded broadcast events for the selected archive. `null` means the
	// events are still loading; `[]` means the archive has no replay.
	const [events, setEvents] = useState<ArchiveEvent[] | null>(null);
	// The archive shown in the purchase panel, kept in local state (not the URL)
	// so it survives the moment `purchased` flips to true after payment and the
	// panel can show the account-binding confirmation instead of jumping away.
	const [buyTargetId, setBuyTargetId] = useState('');
	const buyTarget = archives.find(archive => archive.id === buyTargetId) ?? null;

	// The open replay lives in the URL as ?watch=<id> so it is deep-linkable
	// and the browser back button returns to the list. ?id=<id> is kept as an
	// alias for the admin "play" link; that archive may be hidden, so it is
	// played directly rather than requiring it to appear in the public list.
	const selectedId = router.query.watch || router.query.id || '';
	const isAdminAlias = !!router.query.id && !router.query.watch;
	const selectedArchive = archives.find(archive => archive.id === selectedId);
	const selectedTitle = selectedArchive?.title || '';
	// A public ?watch deep link (e.g. from the top-page strip) to a locked
	// archive is diverted into the purchase panel rather than the player.
	const watchLocked =
		!!selectedArchive && !isAdminAlias && isArchiveLocked(selectedArchive, chatAuthenticated);
	const showReplay = !!selectedId && !watchLocked;

	// Divert a ?watch link that points at a locked archive into the purchase
	// panel, clearing the param so the archive list sits behind it.
	useEffect(() => {
		if (router.query.watch && watchLocked) {
			setBuyTargetId(router.query.watch);
			router.replace('/archives');
		}
	}, [router.query.watch, watchLocked]);

	// Re-open the purchase panel after a full-page payment redirect returns
	// (mobile): the pending marker names the archive that was being bought so
	// the confirmation can be shown once the refreshed list marks it purchased.
	useEffect(() => {
		const pending = window.sessionStorage.getItem(ARCHIVE_PENDING_PURCHASE_KEY);
		if (pending) {
			setBuyTargetId(pending);
		}
	}, []);

	// Returning from a payment (desktop opens the provider in a new tab): refresh
	// the list on focus so a completed purchase flips `purchased` to true.
	useEffect(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				refresh();
			}
		};
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', onVisible);
		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', onVisible);
		};
	}, [refresh]);

	// Load the synchronized replay events whenever a playable archive is opened.
	// Failures fall back to plain video-only playback. Locked archives never
	// reach the player, so their (gated) events are not fetched.
	useEffect(() => {
		if (!showReplay) {
			setEvents(null);
			return undefined;
		}
		// Wait for the access token to hydrate: gated (authenticated/paid)
		// archives 404 an untokenized events request, which showed up as a
		// console error before this effect re-ran with the token.
		if (!accessToken) {
			return undefined;
		}
		let cancelled = false;
		setEvents(null);
		const loadEvents = async () => {
			try {
				// Paid/authenticated archives gate their events too, so send the token.
				const data = await getUnauthedData(
					withArchiveAccessToken(archiveEventsURL(selectedId), accessToken),
				);
				if (!cancelled) {
					setEvents(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				console.error('Failed to fetch archive events:', error);
				if (!cancelled) {
					setEvents([]);
				}
			}
		};
		loadEvents();
		return () => {
			cancelled = true;
		};
	}, [selectedId, showReplay, accessToken]);

	const openArchive = (archive: Archive) => {
		if (isArchiveLocked(archive, chatAuthenticated)) {
			setBuyTargetId(archive.id);
			return;
		}
		router.push(`/archives?watch=${encodeURIComponent(archive.id)}`);
	};

	const closePurchase = () => {
		window.sessionStorage.removeItem(ARCHIVE_PENDING_PURCHASE_KEY);
		setBuyTargetId('');
	};

	const watchPurchased = (id: string) => {
		window.sessionStorage.removeItem(ARCHIVE_PENDING_PURCHASE_KEY);
		setBuyTargetId('');
		router.push(`/archives?watch=${encodeURIComponent(id)}`);
	};

	// Replay view. Only the public ?watch deep link requires the archive to be
	// in the public list; the ?id admin alias keeps playing hidden archives.
	if (showReplay) {
		const waitingForList = !!router.query.watch && loading;
		const notFound = !!router.query.watch && !loading && !selectedArchive;

		// Broadcast metadata row under the title: start date+time, length and
		// the recorded rendition (e.g. 1080p60) when the manifest carries it.
		const startedAt = selectedArchive ? new Date(selectedArchive.startedAt) : null;
		const metaItems: string[] = [];
		if (startedAt && !Number.isNaN(startedAt.getTime())) {
			metaItems.push(
				new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
					startedAt,
				),
			);
		}
		if (selectedArchive?.durationSeconds) {
			// Unit-labelled duration (10分57秒 / 10m 57s): a bare "10:57" chip
			// next to the start time read as a clock time.
			const total = Math.floor(selectedArchive.durationSeconds);
			const hours = Math.floor(total / 3600);
			const minutes = Math.floor((total % 3600) / 60);
			const seconds = total % 60;
			metaItems.push(
				hours >= 1
					? t('ui.statusbar.durationHoursMinutes', { hours, minutes })
					: t('ui.statusbar.durationMinutesSeconds', { minutes, seconds }),
			);
		}
		if (selectedArchive?.quality) {
			metaItems.push(selectedArchive.quality);
		}
		if (selectedArchive?.accessMode === 'authenticated') {
			metaItems.push(t('archives.paid.membersBadge'));
		} else if (selectedArchive?.accessMode === 'paid') {
			metaItems.push(
				selectedArchive.purchased ? t('archives.paid.ownedBadge') : t('archives.paid.lockedBadge'),
			);
		}

		const copyWatchLink = () => {
			const url = `${window.location.origin}/archives?watch=${encodeURIComponent(selectedId)}`;
			navigator.clipboard
				?.writeText(url)
				.then(() => message.success(t('archives.linkCopied')))
				.catch(() => message.info(url));
		};

		const otherArchives = archives.filter(a => a.id !== selectedId).slice(0, 4);

		let body;
		if (events === null || waitingForList) {
			body = <PageLoading />;
		} else if (notFound) {
			body = <PageEmpty />;
		} else {
			body = (
				<>
					<div className={styles.replayMeta}>
						{metaItems.map(item => (
							<span key={item} className={styles.replayMetaItem}>
								{item}
							</span>
						))}
						<Button size="small" icon={<LinkOutlined />} onClick={copyWatchLink}>
							{t('archives.copyLink')}
						</Button>
					</div>
					<VodReplay
						key={selectedId}
						// The single-file MP4 replay plays natively and stays in
						// sync; the HLS playlist is the fallback for archives
						// recorded before the remux existed. Plain <video> requests
						// bypass the VideoJS token hook, so the URL carries it.
						source={
							selectedArchive?.mp4
								? withArchiveAccessToken(archiveMp4URL(selectedId), accessToken)
								: archiveStreamURL(selectedId)
						}
						sourceType={selectedArchive?.mp4 ? 'video/mp4' : undefined}
						title={selectedTitle}
						events={events}
					/>
					{otherArchives.length > 0 && (
						<div className={styles.moreSection}>
							<h2 className={styles.moreTitle}>{t('archives.moreArchives')}</h2>
							<div className={`${styles.grid} ${styles.gridNoHero}`}>
								{otherArchives.map(archive => (
									<ArchiveCard
										key={archive.id}
										archive={archive}
										onClick={() => openArchive(archive)}
									/>
								))}
							</div>
						</div>
					)}
				</>
			);
		}

		return (
			<PageShell
				variant="wide"
				title={notFound ? t('archives.title') : selectedTitle || t('archives.untitled')}
				backTo={{ href: '/archives', label: t('archives.backToList') }}
			>
				<Head>
					<title>{t('archives.title')}</title>
				</Head>
				{body}
			</PageShell>
		);
	}

	// List view.
	return (
		<PageShell
			title={t('archives.title')}
			description={
				loading || archives.length === 0
					? t('archives.description')
					: `${t('archives.description')} ${t('archives.count', { count: archives.length })}`
			}
			backTo={{ href: '/', label: t('archives.backToHome') }}
		>
			<Head>
				<title>{t('archives.title')}</title>
			</Head>
			{loading && (
				<div className={styles.grid} aria-hidden="true">
					{[0, 1, 2, 3, 4, 5].map(i => (
						<div key={i} className={styles.skeletonCard}>
							<div className={styles.skeletonThumb} />
							<Skeleton active paragraph={{ rows: 1 }} title={{ width: '70%' }} />
						</div>
					))}
				</div>
			)}
			{!loading && archives.length === 0 && <PageEmpty description={t('archives.empty')} />}
			{!loading && archives.length > 0 && (
				<div className={styles.grid}>
					{archives.map((archive, index) => (
						<ArchiveCard
							key={archive.id}
							archive={archive}
							hero={index === 0}
							onClick={() => openArchive(archive)}
						/>
					))}
				</div>
			)}
			<ArchivePurchase
				archive={buyTarget}
				open={!!buyTargetId}
				onClose={closePurchase}
				onWatch={watchPurchased}
			/>
		</PageShell>
	);
};

export default ArchivesPage;
