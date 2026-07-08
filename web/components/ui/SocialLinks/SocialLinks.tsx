import { FC } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { SocialLink } from '../../../interfaces/social-link.model';
import { ComponentError } from '../ComponentError/ComponentError';
import styles from './SocialLinks.module.scss';

export type SocialLinksProps = {
	links: SocialLink[];
};

export const SocialLinks: FC<SocialLinksProps> = ({ links }) => {
	if (!links?.length) {
		return null;
	}

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="SocialLinks"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div className={styles.links} id="social-links">
				{links?.map(link => (
					<a
						key={link.platform}
						href={link.url}
						className={styles.link}
						target="_blank"
						rel="noreferrer me"
					>
						<img
							src={link.icon || '/img/platformlogos/default.svg'}
							alt={link.platform}
							width="30"
							height="30"
						/>
					</a>
				))}
			</div>
		</ErrorBoundary>
	);
};
