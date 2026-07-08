import { Card } from 'antd';
import { FC, ReactNode } from 'react';
import styles from './SettingsCard.module.scss';

export type SettingsCardProps = {
	title?: ReactNode;
	description?: ReactNode;
	extra?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
};

/**
 * Thin wrapper over antd Card used to group settings on admin config
 * pages. Provides consistent spacing, an optional muted description as
 * the first child and an optional right-aligned footer (e.g. buttons).
 */
export const SettingsCard: FC<SettingsCardProps> = ({
	title,
	description,
	extra,
	footer,
	children,
}) => (
	<Card title={title} extra={extra} className={styles.card}>
		{description && <p className={styles.description}>{description}</p>}
		{children}
		{footer && <div className={styles.footer}>{footer}</div>}
	</Card>
);
