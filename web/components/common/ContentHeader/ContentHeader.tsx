import cn from 'classnames';
import { FC, ReactNode } from 'react';
import Linkify from '../../common/Linkify/Linkify';
import { Logo } from '../../ui/Logo/Logo';
import { SocialLinks } from '../../ui/SocialLinks/SocialLinks';
import { SocialLink } from '../../../interfaces/social-link.model';
import styles from './ContentHeader.module.scss';

export type ContentHeaderProps = {
	name: string;
	summary: string;
	tags: string[];
	links: SocialLink[];
	logo: string;
	// Right-aligned slot for the follow/notify/external action buttons so the
	// identity row and actions form one section on desktop.
	actions?: ReactNode;
};

export const ContentHeader: FC<ContentHeaderProps> = ({
	name,
	summary,
	logo,
	tags,
	links,
	actions,
}) => (
	<div className={styles.root}>
		<div className={styles.logoTitleSection}>
			<div className={styles.logo}>
				<Logo src={logo} />
			</div>
			<div className={styles.titleSection}>
				<h1 className={cn(styles.title, styles.row, 'header-title')}>{name}</h1>
				<p className={cn(styles.subtitle, styles.row, 'header-subtitle')}>
					<Linkify>{summary}</Linkify>
				</p>
				<div className={cn(styles.tagList, styles.row)}>
					{tags.length > 0 && tags.map(tag => <span key={tag}>#{tag}&nbsp;</span>)}
				</div>
				<div className={cn(styles.socialLinks, styles.row)}>
					<SocialLinks links={links} />
				</div>
			</div>
		</div>
		{actions && <div className={styles.actions}>{actions}</div>}
	</div>
);
