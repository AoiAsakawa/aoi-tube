import { Card, Skeleton } from 'antd';
import { FC } from 'react';

/**
 * Loading placeholder for admin config pages: two stacked cards with
 * animated skeletons, matching the card rhythm of the loaded page.
 */
export const PageSkeleton: FC = () => (
	<div>
		<Card style={{ marginBottom: 24 }}>
			<Skeleton active />
		</Card>
		<Card>
			<Skeleton active />
		</Card>
	</div>
);
