import { FC, ReactNode } from 'react';
import Link from '@components/compat/Link';
import { ClientConfigStore } from '../../stores/ClientConfigStore';
import { useClientConfig, useIsOnline } from '../../stores/zustand-store';
import { Theme } from '../../theme/Theme';
import Header from '../Header/Header';
import { Footer } from '../Footer/Footer';
import styles from './PageShell.module.scss';

export type PageShellProps = {
	children: ReactNode;
	// default: 1200px lists/content, prose: 800px documents, wide: no cap.
	variant?: 'default' | 'prose' | 'wide';
	title?: string;
	description?: string;
	backTo?: { href: string; label: string };
	actions?: ReactNode;
};

// Standard scaffold for viewer subpages (/archives, /faq, /tokushoho):
// mounts the config store (site name, theme, footer flags), global header and
// footer around a width-constrained content column with an optional page
// header (back link, h1, description, actions).
export const PageShell: FC<PageShellProps> = ({
	children,
	variant = 'default',
	title,
	description,
	backTo,
	actions,
}) => {
	const clientConfig = useClientConfig();
	const online = useIsOnline();

	return (
		<>
			<ClientConfigStore />
			<Theme />
			{/* The user menu stays available so viewers can see their identity
			    (guest vs. logged in) and sign in — needed on /archives where
			    paid archives require an account. The chat toggle is hidden
			    since these pages have no chat panel. */}
			<Header
				name={clientConfig.name}
				chatAvailable={false}
				chatDisabled={false}
				showChatToggle={false}
				online={online}
			/>
			<main className={`${styles.content} ${styles[variant]}`}>
				{(title || backTo) && (
					<div className={styles.pageHeader}>
						{backTo && (
							<Link href={backTo.href} className={styles.backLink}>
								← {backTo.label}
							</Link>
						)}
						<div className={styles.titleRow}>
							{title && <h1 className="pageTitle">{title}</h1>}
							{actions && <div className={styles.actions}>{actions}</div>}
						</div>
						{description && <p className="pageDescription">{description}</p>}
					</div>
				)}
				{children}
			</main>
			<Footer />
		</>
	);
};
