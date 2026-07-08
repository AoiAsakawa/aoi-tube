import React, { ComponentType, FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { TabsProps } from 'antd';
import { ErrorBoundary } from 'react-error-boundary';
import styles from './Content.module.scss';
import { CustomPageContent } from '../CustomPageContent/CustomPageContent';
import { ComponentError } from '../ComponentError/ComponentError';

export type DesktopContentProps = {
	name: string;
	extraPageContent: string;
	setShowFollowModal: (show: boolean) => void;
	supportFediverseFeatures: boolean;
};

// lazy loaded components

const Tabs: ComponentType<TabsProps> = dynamic(() => import('antd').then(mod => mod.Tabs), {
	ssr: false,
});

const FollowerCollection = dynamic(
	() =>
		import('../followers/FollowerCollection/FollowerCollection').then(
			mod => mod.FollowerCollection,
		),
	{
		ssr: false,
	},
);

export const DesktopContent: FC<DesktopContentProps> = ({
	name,
	extraPageContent,
	setShowFollowModal,
	supportFediverseFeatures,
}) => {
	const { t } = useTranslation();
	const aboutTabContent = (
		<div className={styles.bottomPageContentContainer}>
			<CustomPageContent content={extraPageContent} />
		</div>
	);

	const followersTabContent = (
		<div className={styles.bottomPageContentContainer}>
			<FollowerCollection name={name} onFollowButtonClick={() => setShowFollowModal(true)} />
		</div>
	);
	const items = [
		!!extraPageContent && { label: t('ui.tabs.about'), key: 'about', children: aboutTabContent },
	];
	if (supportFediverseFeatures) {
		items.push({ label: t('ui.tabs.followers'), key: 'followers', children: followersTabContent });
	}

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentError
					componentName="DesktopContent"
					message={error instanceof Error ? error.message : String(error)}
					retryFunction={resetErrorBoundary}
				/>
			)}
		>
			<div id="skip-to-content">
				{items.length > 1 ? (
					<Tabs defaultActiveKey="about" items={items} />
				) : (
					!!extraPageContent && aboutTabContent
				)}
			</div>
		</ErrorBoundary>
	);
};
