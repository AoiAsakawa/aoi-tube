import { Collapse, Steps } from 'antd';
import { FC, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type SetupGuideProps = {
	steps: ReactNode[];
	/** Panel label. Defaults to the shared "setup steps" heading. */
	title?: ReactNode;
	defaultOpen?: boolean;
	/** Optional extra content (e.g. a note Alert) rendered below the steps. */
	footer?: ReactNode;
};

/**
 * Collapsible provider setup instructions. Replaces the ordered-list
 * "instruction walls" so configured pages are not dominated by one-time
 * setup copy. Collapsed by default.
 */
export const SetupGuide: FC<SetupGuideProps> = ({ steps, title, defaultOpen, footer }) => {
	const { t } = useTranslation();

	return (
		<Collapse
			ghost
			defaultActiveKey={defaultOpen ? ['guide'] : []}
			style={{ marginBottom: 24 }}
			items={[
				{
					key: 'guide',
					label: title ?? t('admin.config.shared.setupSteps'),
					children: (
						<>
							<Steps
								direction="vertical"
								size="small"
								items={steps.map(step => ({ title: step, status: 'process' as const }))}
							/>
							{footer && <div style={{ marginTop: 8 }}>{footer}</div>}
						</>
					),
				},
			]}
		/>
	);
};
