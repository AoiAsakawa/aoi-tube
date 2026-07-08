import React, { FC } from 'react';
import { Table, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import Linkify from '../common/Linkify/Linkify';
import type { SortOrder } from 'antd/es/table/interface';
import { format } from 'date-fns';

const { Title } = Typography;

function renderMessage(text) {
	return <Linkify>{text}</Linkify>;
}

export type LogTableProps = {
	logs: object[];
	pageSize: number;
};

export const LogTable: FC<LogTableProps> = ({ logs, pageSize }) => {
	const { t } = useTranslation();
	if (!logs?.length) {
		return null;
	}

	// These labels used to be a module-scope constant; they moved inside the
	// component so they re-render when the language changes.
	const levelLabels: Record<string, string> = {
		info: t('admin.layout.logTable.levelInfo'),
		warning: t('admin.layout.logTable.levelWarning'),
		error: t('admin.layout.logTable.levelError'),
	};

	const renderColumnLevel = (text, entry) => {
		let color = 'default';

		if (entry.level === 'warning') {
			color = 'orange';
		} else if (entry.level === 'error') {
			color = 'red';
		}

		const label = levelLabels?.[entry.level] ?? text;
		return <Tag color={color}>{label}</Tag>;
	};

	const columns = [
		{
			title: t('admin.layout.logTable.colLevel'),
			dataIndex: 'level',
			key: 'level',
			filters: [
				{
					text: t('admin.layout.logTable.levelInfo'),
					value: 'info',
				},
				{
					text: t('admin.layout.logTable.levelWarning'),
					value: 'warning',
				},
				{
					text: t('admin.layout.logTable.levelError'),
					value: 'error',
				},
			],
			onFilter: (level, row) => row.level.indexOf(level) === 0,
			render: renderColumnLevel,
		},
		{
			title: t('admin.layout.logTable.colTime'),
			dataIndex: 'time',
			key: 'time',
			render: timestamp => {
				const dateObject = new Date(timestamp);
				return format(dateObject, 'pp P');
			},
			sorter: (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
			defaultSortOrder: 'descend' as SortOrder,
		},
		{
			title: t('admin.layout.logTable.colMessage'),
			dataIndex: 'message',
			key: 'message',
			render: renderMessage,
		},
	];

	return (
		<div className="logs-section">
			<Title>{t('admin.layout.logTable.title')}</Title>
			<Table
				size="middle"
				dataSource={logs}
				columns={columns}
				rowKey={row => row.time}
				pagination={{ pageSize: pageSize || 20 }}
			/>
		</div>
	);
};
