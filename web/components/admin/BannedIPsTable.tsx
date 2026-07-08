import { Table, Button } from 'antd';
import { format } from 'date-fns';
import type { SortOrder } from 'antd/es/table/interface';
import React, { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { User } from '../../types/chat';
import { BANNED_IP_REMOVE, fetchData } from '../../utils/apis';

// Lazy loaded components

const StopTwoTone = dynamic(() => import('@ant-design/icons/StopTwoTone'), {
	ssr: false,
});

function formatDisplayDate(date: string | Date) {
	return format(new Date(date), 'yyyy/MM/dd HH:mm');
}

async function removeIPAddressBan(ipAddress: String) {
	try {
		await fetchData(BANNED_IP_REMOVE, {
			data: { value: ipAddress },
			method: 'POST',
			auth: true,
		});
	} catch (e) {
		console.error(e);
	}
}

export type UserTableProps = {
	data: User[];
};

export const BannedIPsTable: FC<UserTableProps> = ({ data }) => {
	const { t } = useTranslation();
	const columns = [
		{
			title: t('admin.layout.bannedIPsTable.colIpAddress'),
			dataIndex: 'ipAddress',
			key: 'ipAddress',
		},
		{
			title: t('admin.layout.bannedIPsTable.colReason'),
			dataIndex: 'notes',
			key: 'notes',
		},
		{
			title: t('admin.layout.bannedIPsTable.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (date: Date) => formatDisplayDate(date),
			sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
		},
		{
			title: '',
			key: 'block',
			className: 'actions-col',
			render: (_, ip) => (
				<Button
					title={t('admin.layout.bannedIPsTable.unbanTitle')}
					onClick={() => removeIPAddressBan(ip.ipAddress)}
					icon={<StopTwoTone twoToneColor="#ff4d4f" />}
					className="block-user-button"
				/>
			),
		},
	];

	return (
		<Table
			pagination={{ hideOnSinglePage: true }}
			className="table-container"
			columns={columns}
			dataSource={data}
			size="large"
			rowKey="ipAddress"
		/>
	);
};
