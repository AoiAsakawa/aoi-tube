import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from '@components/compat/Link';
import styles from './Footer.module.scss';
import { useServerStatus } from '../../stores/zustand-store';
import { fetchData, TOKUSHOHO_PUBLIC, FAQ_PUBLIC } from '../../../utils/apis';
import { useArchives } from '../../../utils/use-archives';

export const Footer: FC = () => {
	const { t } = useTranslation();
	const clientStatus = useServerStatus();
	const { versionNumber } = clientStatus;
	const [tokushohoEnabled, setTokushohoEnabled] = useState<boolean>(false);
	// Operator-set custom title for the legal disclosure link; empty falls back
	// to the localized default label.
	const [tokushohoTitle, setTokushohoTitle] = useState<string>('');
	const [faqEnabled, setFaqEnabled] = useState<boolean>(false);
	// Only surface the archives link when at least one recording is public.
	const { archives } = useArchives();
	const hasArchives = archives.length > 0;

	useEffect(() => {
		const checkTokushoho = async () => {
			try {
				const response = await fetchData(TOKUSHOHO_PUBLIC);
				setTokushohoEnabled(response && response.enabled);
				setTokushohoTitle((response && response.title) || '');
			} catch (_error) {
				setTokushohoEnabled(false);
			}
		};
		const checkFaq = async () => {
			try {
				const response = await fetchData(FAQ_PUBLIC);
				setFaqEnabled(response && response.enabled);
			} catch (_error) {
				setFaqEnabled(false);
			}
		};
		checkTokushoho();
		checkFaq();
	}, []);

	return (
		<footer className={styles.footer} id="footer">
			<span>
				Powered by <a href="https://github.com/AoiAsakawa/aoitube">AoiTube v{versionNumber}</a>
			</span>
			<span className={styles.links}>
				{hasArchives && <Link href="/archives">{t('ui.footer.archives')}</Link>}
				{tokushohoEnabled && (
					<Link href="/tokushoho">{tokushohoTitle || t('ui.footer.tokushoho')}</Link>
				)}
				{faqEnabled && <Link href="/faq">{t('ui.footer.faq')}</Link>}
				<a href="https://github.com/AoiAsakawa/aoitube/tree/main/docs" target="_blank" rel="noreferrer">
					{t('ui.footer.documentation')}
				</a>
				<a href="https://github.com/AoiAsakawa/aoitube/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer">
					{t('ui.footer.contribute')}
				</a>
				<a href="https://github.com/AoiAsakawa/aoitube" target="_blank" rel="noreferrer">
					{t('ui.footer.sourceCode')}
				</a>
			</span>
		</footer>
	);
};
