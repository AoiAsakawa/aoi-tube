import React, { useState, useEffect, ReactElement } from 'react';
import {
	Table,
	Tag,
	Space,
	Button,
	Modal,
	Checkbox,
	Input,
	Typography,
	Row,
	Col,
	Tooltip,
} from 'antd';

import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import dynamic from '@components/compat/dynamic';
import {
	fetchData,
	ACCESS_TOKENS,
	DELETE_ACCESS_TOKEN,
	CREATE_ACCESS_TOKEN,
} from '../../utils/apis';

import { AdminLayout } from '../../components/layouts/AdminLayout';

const { Title, Paragraph } = Typography;

// Lazy loaded components

const DeleteOutlined = dynamic(() => import('@ant-design/icons/DeleteOutlined'), {
	ssr: false,
});

// Scope display strings are i18n keys resolved with t() at render time.
const availableScopes = {
	CAN_SEND_SYSTEM_MESSAGES: {
		nameKey: 'admin.pages.accessTokens.scopes.systemMessages.name',
		descriptionKey: 'admin.pages.accessTokens.scopes.systemMessages.description',
		color: 'purple',
	},
	CAN_SEND_MESSAGES: {
		nameKey: 'admin.pages.accessTokens.scopes.chatMessages.name',
		descriptionKey: 'admin.pages.accessTokens.scopes.chatMessages.description',
		color: 'green',
	},
	HAS_ADMIN_ACCESS: {
		nameKey: 'admin.pages.accessTokens.scopes.admin.name',
		descriptionKey: 'admin.pages.accessTokens.scopes.admin.description',
		color: 'red',
	},
};

function convertScopeStringToTag(scopeString: string, t: TFunction) {
	if (!scopeString || !availableScopes[scopeString]) {
		return null;
	}

	const scope = availableScopes[scopeString];

	return (
		<Tooltip key={scopeString} title={t(scope.descriptionKey)}>
			<Tag color={scope.color}>{t(scope.nameKey)}</Tag>
		</Tooltip>
	);
}

interface Props {
	onCancel: () => void;
	onOk: any; // todo: make better type
	open: boolean;
}
const NewTokenModal = (props: Props) => {
	const { t } = useTranslation();
	const { onOk, onCancel, open } = props;
	const [selectedScopes, setSelectedScopes] = useState([]);
	const [name, setName] = useState('');

	const scopes = Object.keys(availableScopes).map(key => ({
		value: key,
		label: t(availableScopes[key].descriptionKey),
	}));

	function onChange(checkedValues) {
		setSelectedScopes(checkedValues);
	}

	function saveToken() {
		onOk(name, selectedScopes);

		// Clear the modal
		setSelectedScopes([]);
		setName('');
	}

	const okButtonProps = {
		disabled: selectedScopes.length === 0 || name === '',
	};

	function selectAll() {
		setSelectedScopes(Object.keys(availableScopes));
	}
	const checkboxes = scopes.map(singleEvent => (
		<Col span={8} key={singleEvent.value}>
			<Checkbox value={singleEvent.value}>{singleEvent.label}</Checkbox>
		</Col>
	));

	return (
		<Modal
			title={t('admin.pages.accessTokens.modalTitle')}
			open={open}
			onOk={saveToken}
			onCancel={onCancel}
			okButtonProps={okButtonProps}
		>
			<p>
				<p>{t('admin.pages.accessTokens.nameHint')}</p>
				<Input
					value={name}
					placeholder={t('admin.pages.accessTokens.namePlaceholder')}
					onChange={input => setName(input.currentTarget.value)}
				/>
			</p>

			<p>{t('admin.pages.accessTokens.scopeHint')}</p>
			<Checkbox.Group style={{ width: '100%' }} value={selectedScopes} onChange={onChange}>
				<Row>{checkboxes}</Row>
			</Checkbox.Group>

			<p>
				<Button type="primary" onClick={selectAll}>
					{t('admin.pages.common.selectAll')}
				</Button>
			</p>
		</Modal>
	);
};

const AccessTokens = () => {
	const { t } = useTranslation();
	const [tokens, setTokens] = useState([]);
	const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

	function handleError(error) {
		console.error('error', error);
	}

	async function getAccessTokens() {
		try {
			const result = await fetchData(ACCESS_TOKENS);
			setTokens(result);
		} catch (error) {
			handleError(error);
		}
	}
	useEffect(() => {
		getAccessTokens();
	}, []);

	async function handleDeleteToken(token) {
		try {
			await fetchData(DELETE_ACCESS_TOKEN, {
				method: 'POST',
				data: { token },
			});
			getAccessTokens();
		} catch (error) {
			handleError(error);
		}
	}

	async function handleSaveToken(name: string, scopes: string[]) {
		try {
			const newToken = await fetchData(CREATE_ACCESS_TOKEN, {
				method: 'POST',
				data: { name, scopes },
			});
			setTokens(tokens.concat(newToken));
		} catch (error) {
			handleError(error);
		}
	}

	const columns = [
		{
			title: '',
			key: 'delete',
			render: (_, record) => (
				<Space size="middle">
					<Button onClick={() => handleDeleteToken(record.accessToken)} icon={<DeleteOutlined />} />
				</Space>
			),
		},
		{
			title: t('admin.pages.common.name'),
			dataIndex: 'displayName',
			key: 'displayName',
		},
		{
			title: t('admin.pages.accessTokens.columns.token'),
			dataIndex: 'accessToken',
			key: 'accessToken',
			render: text => <Input.Password size="small" bordered={false} value={text} />,
		},
		{
			title: t('admin.pages.accessTokens.columns.scopes'),
			dataIndex: 'scopes',
			key: 'scopes',
			render: scopes => <>{scopes.map(scope => convertScopeStringToTag(scope, t))}</>,
		},
		{
			title: t('admin.pages.accessTokens.columns.lastUsed'),
			dataIndex: 'lastUsed',
			key: 'lastUsed',
			render: lastUsed => {
				if (!lastUsed) {
					return t('admin.pages.accessTokens.neverUsed');
				}
				const dateObject = new Date(lastUsed);
				return format(dateObject, 'P p');
			},
		},
	];

	const showCreateTokenModal = () => {
		setIsTokenModalOpen(true);
	};

	const handleTokenModalSaveButton = (name, scopes) => {
		setIsTokenModalOpen(false);
		handleSaveToken(name, scopes);
	};

	const handleTokenModalCancel = () => {
		setIsTokenModalOpen(false);
	};

	return (
		<div>
			<Title>{t('admin.pages.accessTokens.title')}</Title>
			<Paragraph>{t('admin.pages.accessTokens.intro')}</Paragraph>
			<Paragraph>
				{t('admin.pages.common.docsIntro')}{' '}
				<a
					href="https://owncast.online/docs/integrations/?source=admin"
					target="_blank"
					rel="noopener noreferrer"
				>
					{t('admin.pages.common.documentation')}
				</a>
				.
			</Paragraph>

			<Table rowKey="token" columns={columns} dataSource={tokens} pagination={false} />
			<br />
			<Button type="primary" onClick={showCreateTokenModal}>
				{t('admin.pages.accessTokens.createButton')}
			</Button>
			<NewTokenModal
				open={isTokenModalOpen}
				onOk={handleTokenModalSaveButton}
				onCancel={handleTokenModalCancel}
			/>
		</div>
	);
};

AccessTokens.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default AccessTokens;
