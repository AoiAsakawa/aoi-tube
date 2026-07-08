import { Input, Table } from 'antd';
import type { FilterDropdownProps, SortOrder } from 'antd/es/table/interface';
import { ColumnsType } from 'antd/es/table';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { Client } from '../../types/chat';
import { UserPopover } from './UserPopover';
import { BanUserButton } from './BanUserButton';
import { formatUAstring } from '../../utils/format';

// Lazy loaded components

const SearchOutlined = dynamic(() => import('@ant-design/icons/SearchOutlined'), {
	ssr: false,
});

export type ClientTableProps = {
	data: Client[];
};

export const ClientTable: FC<ClientTableProps> = ({ data }) => {
	const { t } = useTranslation();
	const columns: ColumnsType<Client> = [
		{
			title: t('admin.layout.clientTable.colDisplayName'),
			key: 'username',
			render: (client: Client) => {
				const { user, connectedAt, messageCount, userAgent } = client;
				const connectionInfo = { connectedAt, messageCount, userAgent };
				return (
					<UserPopover user={user} connectionInfo={connectionInfo}>
						<span className="display-name">{user.displayName}</span>
					</UserPopover>
				);
			},
			sorter: (a: any, b: any) => b.user.displayName.localeCompare(a.user.displayName),
			filterIcon: <SearchOutlined />,
			filterDropdown: ({ setSelectedKeys, selectedKeys, confirm }: FilterDropdownProps) => (
				<div style={{ padding: 8 }}>
					<Input
						placeholder={t('admin.layout.clientTable.searchPlaceholder')}
						value={selectedKeys[0] != null ? String(selectedKeys[0]) : undefined}
						onChange={e => {
							setSelectedKeys(e.target.value ? [e.target.value] : []);
							confirm({ closeDropdown: false });
						}}
					/>
				</div>
			),
			onFilter: (value: string, record: Client) => record.user.displayName.includes(value),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
		},
		{
			title: t('admin.layout.clientTable.colMessageCount'),
			dataIndex: 'messageCount',
			key: 'messageCount',
			className: 'number-col',
			width: '12%',
			sorter: (a: any, b: any) => a.messageCount - b.messageCount,
			sortDirections: ['descend', 'ascend'] as SortOrder[],
			render: (count: number) => <div style={{ textAlign: 'center' }}>{count}</div>,
		},
		{
			title: t('admin.layout.clientTable.colConnectedTime'),
			dataIndex: 'connectedAt',
			key: 'connectedAt',
			defaultSortOrder: 'ascend',
			render: (time: Date) => formatDistanceToNow(new Date(time), { locale: ja }),
			sorter: (a: any, b: any) =>
				new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime(),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
		},
		{
			title: t('admin.layout.clientTable.colUserAgent'),
			dataIndex: 'userAgent',
			key: 'userAgent',
			render: (ua: string) => formatUAstring(ua),
		},
		{
			title: t('admin.layout.clientTable.colLocation'),
			dataIndex: 'geo',
			key: 'geo',
			render: geo => (geo ? `${geo.regionName}, ${geo.countryCode}` : '-'),
		},
		{
			title: '',
			key: 'block',
			className: 'actions-col',
			render: (_, row) => <BanUserButton user={row.user} isEnabled={!row.user.disabledAt} />,
		},
	];

	return (
		<Table
			className="table-container"
			pagination={{ hideOnSinglePage: true }}
			columns={columns}
			dataSource={data}
			size="small"
			rowKey="id"
		/>
	);
};
