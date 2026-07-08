import { Empty, Spin } from 'antd';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';

export type PageLoadingProps = {
	label?: string;
};

// Centered page-level loading state shared by viewer subpages.
export const PageLoading: FC<PageLoadingProps> = ({ label }) => {
	const { t } = useTranslation();
	return (
		<div
			style={{
				minHeight: 240,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 12,
			}}
		>
			<Spin size="large" />
			<span style={{ color: 'var(--color-panel-text-muted)' }}>
				{label ?? t('page.loading')}
			</span>
		</div>
	);
};

export type PageEmptyProps = {
	description?: string;
};

// Shared empty state for lists and missing resources.
export const PageEmpty: FC<PageEmptyProps> = ({ description }) => {
	const { t } = useTranslation();
	return (
		<div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
			<Empty
				description={
					<span style={{ color: 'var(--color-panel-text-muted)' }}>
						{description ?? t('page.notFound')}
					</span>
				}
			/>
		</div>
	);
};
