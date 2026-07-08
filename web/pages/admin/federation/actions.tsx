import React, { ReactElement, useEffect, useState } from 'react';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table/interface';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { FEDERATION_ACTIONS, fetchData } from '../../../utils/apis';

import { isEmptyObject } from '../../../utils/format';

import { AdminLayout } from '../../../components/layouts/AdminLayout';

const { Title, Paragraph } = Typography;

export interface Action {
	iri: string;
	actorIRI: string;
	type: string;
	timestamp: Date;
}

export default function FediverseActions() {
	const { t } = useTranslation();
	const [actions, setActions] = useState<Action[]>([]);
	const [totalCount, setTotalCount] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState<number>(0);

	const getActions = async () => {
		try {
			const limit = 50;
			const offset = currentPage * limit;
			const u = `${FEDERATION_ACTIONS}?offset=${offset}&limit=${limit}`;
			const result = await fetchData(u, { auth: true });
			const { results, total } = result;
			setTotalCount(total);
			if (isEmptyObject(results)) {
				setActions([]);
			} else {
				setActions(results);
			}
		} catch (error) {
			console.error(error);
		}
	};

	useEffect(() => {
		getActions();
	}, [currentPage]);

	const columns: ColumnsType<Action> = [
		{
			title: t('admin.pages.federation.actions.columnAction'),
			dataIndex: 'type',
			key: 'type',
			width: 50,
			render: (_, record) => {
				let image;
				let title;
				switch (record.type) {
					case 'FEDIVERSE_ENGAGEMENT_REPOST':
						image = '/img/repost.svg';
						title = t('admin.pages.federation.actions.repost');
						break;
					case 'FEDIVERSE_ENGAGEMENT_LIKE':
						image = '/img/like.svg';
						title = t('admin.pages.federation.actions.like');
						break;
					case 'FEDIVERSE_ENGAGEMENT_FOLLOW':
						image = '/img/follow.svg';
						title = t('admin.pages.federation.actions.follow');
						break;
					default:
						image = '';
				}

				return (
					<div
						style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							flexDirection: 'column',
						}}
					>
						<img src={image} width="70%" alt={title} title={title} />
						<div style={{ fontSize: '0.7rem' }}>{title}</div>
					</div>
				);
			},
		},
		{
			title: t('admin.pages.federation.actions.columnFrom'),
			dataIndex: 'actorIRI',
			key: 'from',
			render: (_, record) => <a href={record.actorIRI}>{record.actorIRI}</a>,
		},
		{
			title: t('admin.pages.federation.actions.columnTimestamp'),
			dataIndex: 'timestamp',
			key: 'timestamp',
			render: (_, record) => {
				const dateObject = new Date(record.timestamp);
				return format(dateObject, 'P pp');
			},
		},
	];

	function makeTable(data: Action[], tableColumns: ColumnsType<Action>) {
		return (
			<Table
				dataSource={data}
				columns={tableColumns}
				size="small"
				rowKey={row => row.iri}
				pagination={{
					pageSize: 50,
					hideOnSinglePage: true,
					showSizeChanger: false,
					total: totalCount,
				}}
				onChange={pagination => {
					const page = pagination.current;
					setCurrentPage(page);
				}}
			/>
		);
	}

	return (
		<div>
			<Title level={3}>{t('admin.pages.federation.actions.title')}</Title>
			<Paragraph>{t('admin.pages.federation.actions.description')}</Paragraph>
			{makeTable(actions, columns)}
		</div>
	);
}

FediverseActions.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
