import { Typography } from 'antd';
import { FC } from 'react';
import styles from './AdminPageHeader.module.scss';

const { Title, Paragraph } = Typography;

export type AdminPageHeaderProps = {
	title: string;
	description?: string;
};

/**
 * Page heading for admin pages. This is the only component that should
 * emit an h1 on an admin page, so each page ends up with exactly one.
 */
export const AdminPageHeader: FC<AdminPageHeaderProps> = ({ title, description }) => (
	<header className={styles.header}>
		<Title level={1} className={styles.title}>
			{title}
		</Title>
		{description && <Paragraph className={styles.description}>{description}</Paragraph>}
	</header>
);
