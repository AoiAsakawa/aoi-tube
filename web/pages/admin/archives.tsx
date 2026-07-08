import { FC, ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	Button,
	InputNumber,
	Popconfirm,
	Select,
	Space,
	Switch,
	Table,
	Tag,
	Typography,
	message,
} from 'antd';
import { format } from 'date-fns';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { Archive } from '../../interfaces/archive.model';
import {
	ADMIN_ARCHIVES,
	ADMIN_ARCHIVES_DELETE,
	ADMIN_ARCHIVES_PRICING,
	ADMIN_ARCHIVES_TITLE,
	ADMIN_ARCHIVES_VISIBILITY,
	fetchData,
} from '../../utils/apis';
import { formatFileSize, parseSecondsToDurationString } from '../../utils/format';

const { Title } = Typography;

// Currencies offered in the admin price editor. The server accepts any code
// and defaults an empty one to JPY; this is a sensible shortlist for the
// storefront's supported fiat providers.
const PRICING_CURRENCIES = ['JPY', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'KRW', 'TWD', 'CNY'];

// Per-row access-mode + price editor. Kept at module scope (not nested in the
// page) so its local edit state is not reset every time the table re-renders.
const ArchivePricingCell: FC<{
	archive: Archive;
	onSaved: (patch: Partial<Archive>) => void;
}> = ({ archive, onSaved }) => {
	const { t } = useTranslation();
	const [accessMode, setAccessMode] = useState<string>(archive.accessMode || 'public');
	const [price, setPrice] = useState<number>(archive.price ?? 0);
	const [currency, setCurrency] = useState<string>(archive.currency || 'JPY');
	const [saving, setSaving] = useState(false);

	const baseMode = archive.accessMode || 'public';
	const dirty =
		accessMode !== baseMode ||
		(accessMode === 'paid' &&
			(price !== (archive.price ?? 0) || currency !== (archive.currency || 'JPY')));

	const save = async () => {
		if (accessMode === 'paid' && (!price || price <= 0)) {
			message.error(t('admin.pages.archives.pricing.priceRequired'));
			return;
		}
		setSaving(true);
		try {
			const isPaid = accessMode === 'paid';
			await fetchData(ADMIN_ARCHIVES_PRICING, {
				auth: true,
				method: 'POST',
				data: {
					id: archive.id,
					accessMode,
					price: isPaid ? price : 0,
					currency: isPaid ? currency : '',
				},
			});
			message.success(t('admin.pages.archives.pricing.saved'));
			onSaved({
				accessMode,
				price: isPaid ? price : undefined,
				currency: isPaid ? currency : undefined,
			});
		} catch (_error) {
			message.error(t('admin.pages.archives.messages.updateFailed'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<Space direction="vertical" size={4}>
			<Select
				size="small"
				value={accessMode}
				style={{ width: 150 }}
				onChange={setAccessMode}
				options={[
					{ value: 'public', label: t('admin.pages.archives.pricing.public') },
					{ value: 'authenticated', label: t('admin.pages.archives.pricing.authenticated') },
					{ value: 'paid', label: t('admin.pages.archives.pricing.paid') },
				]}
			/>
			{accessMode === 'paid' && (
				<Space size={4}>
					<InputNumber
						size="small"
						min={1}
						value={price}
						onChange={value => setPrice(Number(value) || 0)}
						style={{ width: 100 }}
						aria-label={t('admin.pages.archives.pricing.priceLabel')}
					/>
					<Select
						size="small"
						value={currency}
						style={{ width: 90 }}
						onChange={setCurrency}
						options={PRICING_CURRENCIES.map(code => ({ value: code, label: code }))}
					/>
				</Space>
			)}
			<Button size="small" type="primary" disabled={!dirty} loading={saving} onClick={save}>
				{t('admin.pages.archives.pricing.save')}
			</Button>
		</Space>
	);
};

export default function ArchivesAdminPage() {
	const { t } = useTranslation();
	const [archives, setArchives] = useState<Archive[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [bulkDeleting, setBulkDeleting] = useState(false);

	const fetchArchives = async () => {
		setLoading(true);
		try {
			const data = await fetchData(ADMIN_ARCHIVES, { auth: true });
			setArchives(Array.isArray(data) ? data : []);
		} catch (error) {
			console.error(error);
			message.error(t('admin.pages.archives.messages.fetchFailed'));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchArchives();
	}, []);

	const handleVisibility = async (id: string, visible: boolean) => {
		try {
			await fetchData(ADMIN_ARCHIVES_VISIBILITY, {
				auth: true,
				method: 'POST',
				data: { id, visible },
			});
			message.success(
				visible
					? t('admin.pages.archives.messages.shown')
					: t('admin.pages.archives.messages.hidden'),
			);
			setArchives(prev => prev.map(a => (a.id === id ? { ...a, visible } : a)));
		} catch (_error) {
			message.error(t('admin.pages.archives.messages.updateFailed'));
		}
	};

	const handleTitleChange = async (id: string, rawTitle: string) => {
		const title = rawTitle.trim();
		const current = archives.find(a => a.id === id)?.title || '';
		if (title === current) {
			return;
		}
		try {
			await fetchData(ADMIN_ARCHIVES_TITLE, { auth: true, method: 'POST', data: { id, title } });
			message.success(t('admin.pages.archives.messages.titleSaved'));
			setArchives(prev => prev.map(a => (a.id === id ? { ...a, title } : a)));
		} catch (_error) {
			message.error(t('admin.pages.archives.messages.updateFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await fetchData(ADMIN_ARCHIVES_DELETE, { auth: true, method: 'POST', data: { id } });
			message.success(t('admin.pages.archives.messages.deleted'));
			setArchives(prev => prev.filter(a => a.id !== id));
			setSelectedIds(prev => prev.filter(s => s !== id));
		} catch (_error) {
			message.error(t('admin.pages.archives.messages.deleteFailed'));
		}
	};

	const handleBulkDelete = async () => {
		if (selectedIds.length === 0) {
			return;
		}
		setBulkDeleting(true);
		try {
			await fetchData(ADMIN_ARCHIVES_DELETE, {
				auth: true,
				method: 'POST',
				data: { ids: selectedIds },
			});
			message.success(
				t('admin.pages.archives.messages.bulkDeleted', { count: selectedIds.length }),
			);
			setArchives(prev => prev.filter(a => !selectedIds.includes(a.id)));
			setSelectedIds([]);
		} catch (_error) {
			message.error(t('admin.pages.archives.messages.deleteFailed'));
		} finally {
			setBulkDeleting(false);
		}
	};

	const columns = [
		{
			title: t('admin.pages.archives.columns.title'),
			dataIndex: 'title',
			key: 'title',
			render: (title: string, record: Archive) => (
				<Space direction="vertical" size={0}>
					{/* editable.text keeps the real (possibly empty) title as the edit
					    value while the display falls back to the "untitled" label. */}
					<Typography.Text
						editable={{
							text: title || '',
							tooltip: t('admin.pages.archives.editTitle'),
							onChange: value => handleTitleChange(record.id, value),
						}}
					>
						{title || t('admin.pages.archives.untitled')}
					</Typography.Text>
					{!record.finishedOk && (
						<Tag color="warning">{t('admin.pages.archives.unfinished')}</Tag>
					)}
				</Space>
			),
		},
		{
			title: t('admin.pages.archives.columns.startedAt'),
			dataIndex: 'startedAt',
			key: 'startedAt',
			render: (iso: string) => {
				const date = new Date(iso);
				return Number.isNaN(date.getTime()) ? '-' : format(date, 'yyyy/MM/dd HH:mm');
			},
		},
		{
			title: t('admin.pages.archives.columns.duration'),
			dataIndex: 'durationSeconds',
			key: 'durationSeconds',
			render: (seconds: number) => parseSecondsToDurationString(seconds),
		},
		{
			title: t('admin.pages.archives.columns.size'),
			dataIndex: 'sizeBytes',
			key: 'sizeBytes',
			render: (bytes?: number) => formatFileSize(bytes),
		},
		{
			title: t('admin.pages.archives.columns.visible'),
			dataIndex: 'visible',
			key: 'visible',
			render: (visible: boolean, record: Archive) => (
				<Switch
					checked={visible}
					onChange={checked => handleVisibility(record.id, checked)}
					checkedChildren={t('admin.pages.archives.visible')}
					unCheckedChildren={t('admin.pages.archives.hidden')}
				/>
			),
		},
		{
			title: t('admin.pages.archives.pricing.columnTitle'),
			key: 'pricing',
			render: (_: unknown, record: Archive) => (
				<ArchivePricingCell
					archive={record}
					onSaved={patch =>
						setArchives(prev => prev.map(a => (a.id === record.id ? { ...a, ...patch } : a)))
					}
				/>
			),
		},
		{
			title: t('admin.pages.archives.columns.actions'),
			key: 'actions',
			render: (_: unknown, record: Archive) => (
				<Space>
					<a
						href={`/archives?id=${encodeURIComponent(record.id)}`}
						target="_blank"
						rel="noreferrer"
					>
						{t('admin.pages.archives.play')}
					</a>
					<Popconfirm
						title={t('admin.pages.archives.deleteConfirm.title')}
						description={t('admin.pages.archives.deleteConfirm.content')}
						okText={t('admin.pages.common.delete')}
						okType="danger"
						cancelText={t('admin.pages.common.cancel')}
						onConfirm={() => handleDelete(record.id)}
					>
						<Button danger size="small">
							{t('admin.pages.common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<Title>{t('admin.pages.archives.title')}</Title>
			<p className="description">{t('admin.pages.archives.description')}</p>
			{selectedIds.length > 0 && (
				<Space style={{ marginBottom: 12 }}>
					<Popconfirm
						title={t('admin.pages.archives.bulkDeleteConfirm.title')}
						description={t('admin.pages.archives.bulkDeleteConfirm.content', {
							count: selectedIds.length,
						})}
						okText={t('admin.pages.common.delete')}
						okButtonProps={{ danger: true, loading: bulkDeleting }}
						onConfirm={handleBulkDelete}
					>
						<Button danger loading={bulkDeleting}>
							{t('admin.pages.archives.bulkDeleteButton', { count: selectedIds.length })}
						</Button>
					</Popconfirm>
				</Space>
			)}
			<Table
				rowKey="id"
				dataSource={archives}
				columns={columns}
				loading={loading}
				rowSelection={{
					selectedRowKeys: selectedIds,
					onChange: keys => setSelectedIds(keys as string[]),
				}}
				pagination={{ pageSize: 20, hideOnSinglePage: true }}
				locale={{ emptyText: t('admin.pages.archives.empty') }}
			/>
		</div>
	);
}

ArchivesAdminPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
