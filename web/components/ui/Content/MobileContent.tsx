import React, { ComponentType, FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { TabsProps } from 'antd';
import { ErrorBoundary } from 'react-error-boundary';
import { SocialLink } from '../../../interfaces/social-link.model';
import styles from './Content.module.scss';
import { CustomPageContent } from '../CustomPageContent/CustomPageContent';
import { ContentHeader } from '../../common/ContentHeader/ContentHeader';
import { ComponentError } from '../ComponentError/ComponentError';

export type MobileContentProps = {
	name: string;
	summary: string;
	tags: string[];
	socialHandles: SocialLink[];
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

const ComponentErrorFallback = ({ error, resetErrorBoundary }) => (
	<ComponentError
		message={error}
		componentName="MobileContent"
		retryFunction={resetErrorBoundary}
	/>
);

export const MobileContent: FC<MobileContentProps> = ({
	name,
	summary,
	tags,
	socialHandles,
	extraPageContent,
	setShowFollowModal,
	supportFediverseFeatures,
}) => {
	const { t } = useTranslation();
	const aboutTabContent = (
		<>
			<ContentHeader name={name} summary={summary} tags={tags} links={socialHandles} logo="/logo" />
			{!!extraPageContent && (
				<div className={styles.bottomPageContentContainer}>
					<CustomPageContent content={extraPageContent} />
				</div>
			)}
		</>
	);
	const followersTabContent = (
		<div className={styles.bottomPageContentContainer}>
			<FollowerCollection name={name} onFollowButtonClick={() => setShowFollowModal(true)} />
		</div>
	);

	const items = [];

	items.push({ label: t('ui.tabs.about'), key: 'about', children: aboutTabContent });
	if (supportFediverseFeatures) {
		items.push({ label: t('ui.tabs.followers'), key: 'followers', children: followersTabContent });
	}

	return (
		<ErrorBoundary
			fallbackRender={({ error, resetErrorBoundary }) => (
				<ComponentErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
			)}
		>
			{items.length > 1 ? (
				<div className={styles.lowerSectionMobileTabbed}>
					<Tabs defaultActiveKey="about" items={items} />
				</div>
			) : (
				<div>{aboutTabContent}</div>
			)}
		</ErrorBoundary>
	);
};
