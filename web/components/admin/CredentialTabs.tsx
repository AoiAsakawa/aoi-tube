import { Badge, Tabs } from 'antd';
import { FC, ReactNode } from 'react';

export type CredentialTab = {
	key: string;
	label: ReactNode;
	/** Marks the tab with a success badge when its credentials are filled in. */
	configured: boolean;
	children: ReactNode;
};

export type CredentialTabsProps = {
	tabs: CredentialTab[];
	defaultActiveKey?: string;
};

/**
 * Environment credential tabs (sandbox/test vs production). Configured tabs
 * get a success Badge on the label, replacing the old string-appended check
 * marks.
 */
export const CredentialTabs: FC<CredentialTabsProps> = ({ tabs, defaultActiveKey }) => (
	<Tabs
		defaultActiveKey={defaultActiveKey}
		items={tabs.map(tab => ({
			key: tab.key,
			label: (
				<span>
					{tab.label}
					{tab.configured && <Badge status="success" style={{ marginLeft: 8 }} />}
				</span>
			),
			children: tab.children,
		}))}
	/>
);
