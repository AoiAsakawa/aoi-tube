import Head from '@components/compat/Head';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import { fetchData } from '../../../utils/apis';
import { PageShell } from '../PageShell/PageShell';
import { PageEmpty, PageLoading } from '../AsyncStates/AsyncStates';
import '../../../styles/prose.scss';

// Configure marked for security
marked.setOptions({
	breaks: true, // Convert \n to <br>
	gfm: true, // GitHub Flavored Markdown
});

// Server-configured markdown document shape shared by the FAQ and tokushoho
// endpoints: the page only exists while the admin has it enabled. An optional
// title overrides the localized default (used by the legal disclosure page so
// operators can label it for their own jurisdiction).
type MarkdownDocInfo = {
	enabled: boolean;
	title?: string;
	markdownContent: string;
};

export type MarkdownDocPageProps = {
	// i18n key for the default page (and document) title, used when the server
	// provides no custom title.
	titleKey: string;
	// Public API endpoint returning { enabled, title?, markdownContent }.
	endpoint: string;
};

// A viewer subpage that renders an admin-authored markdown document
// (/faq, /tokushoho) on the shared prose PageShell. Disabled or missing
// documents render a not-found empty state.
export const MarkdownDocPage: FC<MarkdownDocPageProps> = ({ titleKey, endpoint }) => {
	const { t } = useTranslation();
	const [info, setInfo] = useState<MarkdownDocInfo | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			try {
				const data = await fetchData(endpoint);
				if (!cancelled) {
					setInfo(data && data.enabled ? data : null);
				}
			} catch (err) {
				console.error('Failed to fetch markdown document:', err);
				if (!cancelled) {
					setInfo(null);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};
		load();
		return () => {
			cancelled = true;
		};
	}, [endpoint]);

	let body;
	if (loading) {
		body = <PageLoading />;
	} else if (!info) {
		body = <PageEmpty />;
	} else {
		body = (
			<div
				className="markdownProse"
				dangerouslySetInnerHTML={{ __html: marked.parse(info.markdownContent) as string }}
			/>
		);
	}

	// Operator-set custom title wins; otherwise the localized default label.
	const pageTitle = info?.title?.trim() || t(titleKey);

	return (
		<PageShell
			variant="prose"
			title={pageTitle}
			backTo={{ href: '/', label: t('page.backToHome') }}
		>
			<Head>
				<title>{pageTitle}</title>
			</Head>
			{body}
		</PageShell>
	);
};
