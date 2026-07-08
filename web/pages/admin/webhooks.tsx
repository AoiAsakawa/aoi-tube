import {
	Button,
	Checkbox,
	Col,
	Input,
	Modal,
	Row,
	Space,
	Table,
	Tag,
	Typography,
	Tooltip,
} from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CREATE_WEBHOOK, DELETE_WEBHOOK, fetchData, WEBHOOKS } from '../../utils/apis';
import { isValidUrl, DEFAULT_TEXTFIELD_URL_PATTERN } from '../../utils/validators';

import { AdminLayout } from '../../components/layouts/AdminLayout';

const { Title, Paragraph } = Typography;

// Lazy loaded components

const DeleteOutlined = dynamic(() => import('@ant-design/icons/DeleteOutlined'), {
	ssr: false,
});

// Event display strings are i18n keys resolved with t() at render time.
const availableEvents = {
	CHAT: {
		nameKey: 'admin.pages.webhooks.events.chat.name',
		descriptionKey: 'admin.pages.webhooks.events.chat.description',
		color: 'purple',
	},
	USER_JOINED: {
		nameKey: 'admin.pages.webhooks.events.userJoined.name',
		descriptionKey: 'admin.pages.webhooks.events.userJoined.description',
		color: 'green',
	},
	NAME_CHANGE: {
		nameKey: 'admin.pages.webhooks.events.nameChange.name',
		descriptionKey: 'admin.pages.webhooks.events.nameChange.description',
		color: 'blue',
	},
	'VISIBILITY-UPDATE': {
		nameKey: 'admin.pages.webhooks.events.visibilityUpdate.name',
		descriptionKey: 'admin.pages.webhooks.events.visibilityUpdate.description',
		color: 'red',
	},
	STREAM_STARTED: {
		nameKey: 'admin.pages.webhooks.events.streamStarted.name',
		descriptionKey: 'admin.pages.webhooks.events.streamStarted.description',
		color: 'orange',
	},
	STREAM_STOPPED: {
		nameKey: 'admin.pages.webhooks.events.streamStopped.name',
		descriptionKey: 'admin.pages.webhooks.events.streamStopped.description',
		color: 'cyan',
	},
	STREAM_TITLE_UPDATED: {
		nameKey: 'admin.pages.webhooks.events.streamTitleUpdated.name',
		descriptionKey: 'admin.pages.webhooks.events.streamTitleUpdated.description',
		color: 'yellow',
	},
	DONATION: {
		nameKey: 'admin.pages.webhooks.events.donation.name',
		descriptionKey: 'admin.pages.webhooks.events.donation.description',
		color: 'gold',
	},
};

function convertEventStringToTag(eventString: string, t: TFunction) {
	if (!eventString || !availableEvents[eventString]) {
		return null;
	}

	const event = availableEvents[eventString];

	return (
		<Tooltip key={eventString} title={t(event.descriptionKey)}>
			<Tag color={event.color}>{t(event.nameKey)}</Tag>
		</Tooltip>
	);
}
interface Props {
	onCancel: () => void;
	onOk: any; // todo: make better type
	open: boolean;
}

const NewWebhookModal = (props: Props) => {
	const { t } = useTranslation();
	const { onOk, onCancel, open } = props;

	const [selectedEvents, setSelectedEvents] = useState([]);
	const [webhookUrl, setWebhookUrl] = useState('');

	const events = Object.keys(availableEvents).map(key => ({
		value: key,
		label: t(availableEvents[key].descriptionKey),
	}));

	function onChange(checkedValues) {
		setSelectedEvents(checkedValues);
	}

	function selectAll() {
		setSelectedEvents(Object.keys(availableEvents));
	}

	function save() {
		onOk(webhookUrl, selectedEvents);

		// Reset the modal
		setWebhookUrl('');
		setSelectedEvents(null);
	}

	const okButtonProps = {
		disabled: selectedEvents?.length === 0 || !isValidUrl(webhookUrl),
	};

	const checkboxes = events.map(singleEvent => (
		<Col span={8} key={singleEvent.value}>
			<Checkbox value={singleEvent.value}>{singleEvent.label}</Checkbox>
		</Col>
	));

	return (
		<Modal
			title={t('admin.pages.webhooks.modalTitle')}
			open={open}
			onOk={save}
			onCancel={onCancel}
			okButtonProps={okButtonProps}
		>
			<div>
				<Input
					value={webhookUrl}
					placeholder="https://myserver.com/webhook"
					onChange={input => setWebhookUrl(input.currentTarget.value.trim())}
					type="url"
					pattern={DEFAULT_TEXTFIELD_URL_PATTERN}
				/>
			</div>

			<p>{t('admin.pages.webhooks.eventsHint')}</p>
			<Checkbox.Group style={{ width: '100%' }} value={selectedEvents} onChange={onChange}>
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

const Webhooks = () => {
	const { t } = useTranslation();
	const [webhooks, setWebhooks] = useState([]);
	const [isModalOpen, setIsModalOpen] = useState(false);

	function handleError(error) {
		console.error('error', error);
	}

	async function getWebhooks() {
		try {
			const result = await fetchData(WEBHOOKS);
			setWebhooks(result);
		} catch (error) {
			handleError(error);
		}
	}

	useEffect(() => {
		getWebhooks();
	}, []);

	async function handleDelete(id) {
		try {
			await fetchData(DELETE_WEBHOOK, { method: 'POST', data: { id } });
			getWebhooks();
		} catch (error) {
			handleError(error);
		}
	}

	async function handleSave(url: string, events: string[]) {
		try {
			const newHook = await fetchData(CREATE_WEBHOOK, {
				method: 'POST',
				data: { url, events },
			});
			setWebhooks(webhooks.concat(newHook));
		} catch (error) {
			handleError(error);
		}
	}

	const showCreateModal = () => {
		setIsModalOpen(true);
	};

	const handleModalSaveButton = (url, events) => {
		setIsModalOpen(false);
		handleSave(url, events);
	};

	const handleModalCancelButton = () => {
		setIsModalOpen(false);
	};

	const columns = [
		{
			title: '',
			key: 'delete',
			render: (_, record) => (
				<Space size="middle">
					<Button onClick={() => handleDelete(record.id)} icon={<DeleteOutlined />} />
				</Space>
			),
		},
		{
			title: 'URL',
			dataIndex: 'url',
			key: 'url',
		},
		{
			title: t('admin.pages.webhooks.columns.events'),
			dataIndex: 'events',
			key: 'events',
			render: events => (
				<>
					{events.map(event => {
						return convertEventStringToTag(event, t);
					})}
				</>
			),
		},
	];

	return (
		<div>
			<Title>Webhook</Title>
			<Paragraph>{t('admin.pages.webhooks.intro')}</Paragraph>
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

			<Table
				rowKey={record => record.id}
				columns={columns}
				dataSource={webhooks}
				pagination={false}
			/>
			<br />
			<Button type="primary" onClick={showCreateModal}>
				{t('admin.pages.webhooks.createButton')}
			</Button>
			<NewWebhookModal
				open={isModalOpen}
				onOk={handleModalSaveButton}
				onCancel={handleModalCancelButton}
			/>
		</div>
	);
};

Webhooks.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default Webhooks;
