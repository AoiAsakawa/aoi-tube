import { Table } from 'antd';
import { format } from 'date-fns';
import type { SortOrder } from 'antd/es/table/interface';
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { User } from '../../types/chat';
import { UserPopover } from './UserPopover';
import { BanUserButton } from './BanUserButton';

export function formatDisplayDate(date: string | Date) {
	return format(new Date(date), 'yyyy/MM/dd HH:mm');
}

export type UserTableProps = {
	data: User[];
};

export const UserTable: FC<UserTableProps> = ({ data }) => {
	const { t } = useTranslation();
	const columns = [
		{
			title: t('admin.layout.userTable.colDisplayName'),
			dataIndex: 'displayName',
			key: 'displayName',
			render: (displayName: string, user: User) => (
				<UserPopover user={user}>
					<span className="display-name">{displayName}</span>
				</UserPopover>
			),
		},
		{
			title: t('admin.layout.userTable.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (date: Date) => formatDisplayDate(date),
			sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
		},
		{
			title: t('admin.layout.userTable.colDisabledAt'),
			dataIndex: 'disabledAt',
			key: 'disabledAt',
			defaultSortOrder: 'descend' as SortOrder,
			render: (date: Date) => (date ? formatDisplayDate(date) : null),
			sorter: (a: any, b: any) =>
				new Date(a.disabledAt).getTime() - new Date(b.disabledAt).getTime(),
			sortDirections: ['descend', 'ascend'] as SortOrder[],
		},
		{
			title: '',
			key: 'block',
			className: 'actions-col',
			render: (_, user) => <BanUserButton user={user} isEnabled={!user.disabledAt} />,
		},
	];

	return (
		<Table
			pagination={{ hideOnSinglePage: true }}
			className="table-container"
			columns={columns}
			dataSource={data}
			size="small"
			rowKey="id"
		/>
	);
};
