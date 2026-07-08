import {
	Button,
	Card,
	Col,
	Empty,
	InputNumber,
	Modal,
	Popconfirm,
	Row,
	Segmented,
	Space,
	Statistic,
	Switch,
	Table,
	Tag,
	Tooltip,
	Typography,
	Form,
	Input,
	Select,
	message,
} from 'antd';
import dynamic from '@components/compat/dynamic';
import React, { ReactElement, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { format, subDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	BarElement,
	ArcElement,
	Tooltip as ChartTooltip,
	Legend,
	ChartOptions,
	TooltipItem,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
	ADMIN_ARCHIVES,
	ADMIN_ARCHIVES_PURCHASES_GRANT,
	ADMIN_ARCHIVES_PURCHASES_REVOKE,
	ADMIN_BASE_CURRENCY,
	ADMIN_BASE_CURRENCY_SET,
	ALL_USERS,
	DONATIONS,
	DONATIONS_STATS,
	DONATIONS_CREATE,
	DONATIONS_VISIBILITY,
	DONATIONS_DELETE,
	fetchData,
} from '../../utils/apis';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { CurrencySelect } from '../../components/admin/CurrencySelect';
import { useSiteTheme } from '../../utils/useSiteTheme';
import {
	Donation,
	DonationItemStat,
	DonationStats,
	donationAmountToMajorUnits,
	formatDonationAmount,
	isScreenEffectType,
	SCREEN_EFFECT_EMOJIS,
	SCREEN_EFFECT_NAMES_JA,
	SCREEN_EFFECT_TYPES,
} from '../../interfaces/donation.model';
import { Archive } from '../../interfaces/archive.model';

// Element/plugin registration for the dashboard charts. The Bar/Doughnut
// typed components register their own controllers.
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, ChartTooltip, Legend);

const { Title, Paragraph, Text } = Typography;

// Series palette for per-currency datasets (main admin accent first).
const CURRENCY_SERIES_COLORS = ['#667eea', '#2dd4bf', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa'];
// Bar palette for the item breakdown chart.
const ITEM_SERIES_COLORS = [
	'#667eea',
	'#f5222d',
	'#eb2f96',
	'#fadb14',
	'#fa8c16',
	'#13c2c2',
	'#722ed1',
	'#52c41a',
	'#faad14',
];

// Payment provider presentation: antd Tag preset color for the table and a
// hex color for the chart. Unknown providers fall back to a grey tag.
// Non-brand labels are stored as i18n keys and resolved with t().
const PROVIDER_META: Record<
	string,
	{ label?: string; labelKey?: string; tagColor: string; chartColor: string }
> = {
	stripe: { label: 'Stripe', tagColor: 'purple', chartColor: '#722ed1' },
	paypal: { label: 'PayPal', tagColor: 'blue', chartColor: '#1677ff' },
	paypay: { label: 'PayPay', tagColor: 'red', chartColor: '#f5222d' },
	metamask: { label: 'Metamask', tagColor: 'orange', chartColor: '#fa8c16' },
	kofi: { label: 'Ko-fi', tagColor: 'cyan', chartColor: '#13c2c2' },
	manual: {
		labelKey: 'admin.pages.donations.providers.manual',
		tagColor: 'default',
		chartColor: '#8c8c8c',
	},
};

const getProviderMeta = (provider: string | undefined, t: TFunction) => {
	const meta = PROVIDER_META[provider || 'manual'];
	if (!meta) {
		return {
			label: provider || t('admin.pages.donations.providers.unknown'),
			tagColor: 'default',
			chartColor: '#667eea',
		};
	}
	return { ...meta, label: meta.labelKey ? t(meta.labelKey) : meta.label };
};

// Product label for a purchase row. The effect names come from the shared JA
// name table (interfaces/donation.model, not yet localized).
const purchaseItemLabel = (record: Donation, t: TFunction): string => {
	if (record.itemType === 'archive') {
		// archiveTitle is empty once the archive is deleted; fall back to the
		// raw id and finally an explicit "deleted" placeholder.
		const title =
			record.archiveTitle || record.archiveId || t('admin.pages.donations.items.archiveDeleted');
		return t('admin.pages.donations.items.archive', { title });
	}
	if (record.itemType !== 'effect') {
		return t('admin.pages.donations.items.superchat');
	}
	const effectName = isScreenEffectType(record.effectType)
		? `${SCREEN_EFFECT_EMOJIS[record.effectType]} ${SCREEN_EFFECT_NAMES_JA[record.effectType]}`
		: record.effectType || t('admin.pages.donations.items.unknown');
	return t('admin.pages.donations.items.screenEffect', { name: effectName });
};

// Emoji-prefixed label for one row of the item breakdown chart.
const itemStatLabel = (item: DonationItemStat, t: TFunction): string => {
	if (item.itemType === 'archive') {
		return `🎬 ${t('admin.pages.donations.items.archiveStat')}`;
	}
	if (item.itemType !== 'effect') {
		return `💬 ${t('admin.pages.donations.items.superchat')}`;
	}
	if (isScreenEffectType(item.effectType)) {
		return `${SCREEN_EFFECT_EMOJIS[item.effectType]} ${SCREEN_EFFECT_NAMES_JA[item.effectType]}`;
	}
	return `✨ ${item.effectType || t('admin.pages.donations.items.unknown')}`;
};

// Sort order for item stats: superchat first, then effects cheapest first.
const itemStatOrder = (item: DonationItemStat): number => {
	if (item.itemType !== 'effect') {
		return -1;
	}
	const index = SCREEN_EFFECT_TYPES.findIndex(effect => effect === item.effectType);
	return index === -1 ? SCREEN_EFFECT_TYPES.length : index;
};

// "M/D" axis label from a "YYYY-MM-DD" date string, parsed textually so the
// browser timezone can never shift the day.
const dayAxisLabel = (date: string): string =>
	`${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

// Lazy loaded icons
const GiftOutlined = dynamic(() => import('@ant-design/icons/GiftOutlined'), { ssr: false });
const EyeOutlined = dynamic(() => import('@ant-design/icons/EyeOutlined'), { ssr: false });
const EyeInvisibleOutlined = dynamic(() => import('@ant-design/icons/EyeInvisibleOutlined'), {
	ssr: false,
});
const PlusOutlined = dynamic(() => import('@ant-design/icons/PlusOutlined'), { ssr: false });
const DeleteOutlined = dynamic(() => import('@ant-design/icons/DeleteOutlined'), { ssr: false });
const CalendarOutlined = dynamic(() => import('@ant-design/icons/CalendarOutlined'), {
	ssr: false,
});
const DollarCircleOutlined = dynamic(() => import('@ant-design/icons/DollarCircleOutlined'), {
	ssr: false,
});
const GoldOutlined = dynamic(() => import('@ant-design/icons/GoldOutlined'), { ssr: false });
const BarChartOutlined = dynamic(() => import('@ant-design/icons/BarChartOutlined'), {
	ssr: false,
});
const TeamOutlined = dynamic(() => import('@ant-design/icons/TeamOutlined'), { ssr: false });
const ArrowUpOutlined = dynamic(() => import('@ant-design/icons/ArrowUpOutlined'), { ssr: false });
const ArrowDownOutlined = dynamic(() => import('@ant-design/icons/ArrowDownOutlined'), {
	ssr: false,
});

interface DonationFormValues {
	amount: number;
	currency: string;
	displayName: string;
	message: string;
	isAnonymous: boolean;
}

const NewDonationModal = ({
	open,
	onOk,
	onCancel,
}: {
	open: boolean;
	onOk: (values: DonationFormValues) => void;
	onCancel: () => void;
}) => {
	const { t } = useTranslation();
	const [form] = Form.useForm();

	const handleOk = async () => {
		try {
			const values = await form.validateFields();
			onOk(values);
			form.resetFields();
		} catch (error) {
			console.error('Validation failed:', error);
		}
	};

	return (
		<Modal
			title={t('admin.pages.donations.modal.title')}
			open={open}
			onOk={handleOk}
			onCancel={onCancel}
			okText={t('admin.pages.donations.modal.register')}
			cancelText={t('admin.pages.common.cancel')}
		>
			<Form form={form} layout="vertical" initialValues={{ currency: 'JPY', isAnonymous: false }}>
				<Form.Item
					name="amount"
					label={t('admin.pages.donations.modal.amountLabel')}
					rules={[{ required: true, message: t('admin.pages.donations.modal.amountRequired') }]}
				>
					<InputNumber
						min={1}
						style={{ width: '100%' }}
						placeholder={t('admin.pages.donations.modal.amountPlaceholder')}
					/>
				</Form.Item>
				<Form.Item name="currency" label={t('admin.pages.donations.modal.currencyLabel')}>
					<Select>
						<Select.Option value="JPY">{t('admin.pages.donations.modal.currencyJpy')}</Select.Option>
						<Select.Option value="USD">{t('admin.pages.donations.modal.currencyUsd')}</Select.Option>
						<Select.Option value="EUR">{t('admin.pages.donations.modal.currencyEur')}</Select.Option>
					</Select>
				</Form.Item>
				<Form.Item name="displayName" label={t('admin.pages.donations.modal.displayNameLabel')}>
					<Input placeholder={t('admin.pages.donations.modal.displayNamePlaceholder')} />
				</Form.Item>
				<Form.Item name="message" label={t('admin.pages.donations.modal.messageLabel')}>
					<Input.TextArea rows={3} placeholder={t('admin.pages.donations.modal.messagePlaceholder')} />
				</Form.Item>
				<Form.Item
					name="isAnonymous"
					label={t('admin.pages.donations.modal.anonymousLabel')}
					valuePropName="checked"
				>
					<Switch />
				</Form.Item>
			</Form>
		</Modal>
	);
};

// Minimal user shape needed from the ALL_USERS admin endpoint.
interface GrantUserOption {
	id: string;
	displayName: string;
}

// Manually grants a viewer permanent viewing access to an archive, recorded
// the same way as a purchase. Archive and user options load on open.
const GrantAccessModal = ({
	open,
	onGranted,
	onCancel,
}: {
	open: boolean;
	onGranted: () => void;
	onCancel: () => void;
}) => {
	const { t } = useTranslation();
	const [archives, setArchives] = useState<Archive[]>([]);
	const [users, setUsers] = useState<GrantUserOption[]>([]);
	const [optionsLoading, setOptionsLoading] = useState(false);
	const [archiveId, setArchiveId] = useState<string>();
	const [userId, setUserId] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) {
			return;
		}
		setArchiveId(undefined);
		setUserId(undefined);
		const loadOptions = async () => {
			setOptionsLoading(true);
			try {
				const [archiveList, userList] = await Promise.all([
					fetchData(ADMIN_ARCHIVES, { auth: true }),
					fetchData(ALL_USERS),
				]);
				setArchives(Array.isArray(archiveList) ? archiveList : []);
				setUsers(Array.isArray(userList) ? userList : []);
			} catch (error) {
				console.error('Failed to fetch grant options:', error);
			}
			setOptionsLoading(false);
		};
		loadOptions();
	}, [open]);

	const handleGrant = async () => {
		if (!archiveId || !userId) {
			return;
		}
		setSubmitting(true);
		try {
			await fetchData(ADMIN_ARCHIVES_PURCHASES_GRANT, {
				auth: true,
				method: 'POST',
				data: { archiveId, userId },
			});
			message.success(t('admin.pages.donations.grant.success'));
			onGranted();
		} catch (error) {
			// The server names the reason (e.g. the user already has access);
			// localize the known case and show the raw message otherwise.
			const serverMessage = error instanceof Error ? error.message : '';
			if (serverMessage.toLowerCase().includes('already')) {
				message.error(t('admin.pages.donations.grant.alreadyOwned'));
			} else {
				message.error(serverMessage || t('admin.pages.donations.grant.failed'));
			}
		}
		setSubmitting(false);
	};

	// Plain-text access-mode suffix so paid / members-only archives stand out.
	const archiveOptionLabel = (archive: Archive): string => {
		const base = archive.title || archive.id;
		if (archive.accessMode === 'paid') {
			return `${base} (${t('admin.pages.archives.pricing.paid')})`;
		}
		if (archive.accessMode === 'authenticated') {
			return `${base} (${t('admin.pages.archives.pricing.authenticated')})`;
		}
		return base;
	};

	return (
		<Modal
			title={t('admin.pages.donations.grant.title')}
			open={open}
			onOk={handleGrant}
			onCancel={onCancel}
			okText={t('admin.pages.donations.grant.submit')}
			okButtonProps={{ disabled: !archiveId || !userId }}
			confirmLoading={submitting}
			cancelText={t('admin.pages.common.cancel')}
		>
			<Form layout="vertical">
				<Form.Item label={t('admin.pages.donations.grant.archiveLabel')} required>
					<Select
						value={archiveId}
						onChange={setArchiveId}
						loading={optionsLoading}
						showSearch
						optionFilterProp="label"
						options={archives.map(archive => ({
							value: archive.id,
							label: archiveOptionLabel(archive),
						}))}
					/>
				</Form.Item>
				<Form.Item label={t('admin.pages.donations.grant.userLabel')} required>
					<Select
						value={userId}
						onChange={setUserId}
						loading={optionsLoading}
						showSearch
						optionFilterProp="label"
						options={users.map(user => ({ value: user.id, label: user.displayName }))}
					/>
				</Form.Item>
			</Form>
		</Modal>
	);
};

// Secondary currencies shown as small lines under a Statistic value.
const CurrencySubLines = ({
	stats,
	field,
}: {
	stats: DonationStats | null;
	field: 'total' | 'thisMonth' | 'average';
}) => {
	const others = stats?.currencies.slice(1) ?? [];
	if (others.length === 0) {
		return null;
	}
	return (
		<div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-panel-text-muted)' }}>
			{others.map(c => (
				<div key={c.currency}>
					{c.currency}: {formatDonationAmount(c[field], c.currency)}
				</div>
			))}
		</div>
	);
};

// Centered muted placeholder shown inside a chart card when its dataset is
// empty or all-zero (an all-zero chart renders a meaningless 0.0-1.0 axis or
// a solid gray donut).
const ChartEmptyState = ({ description }: { description: string }) => (
	<div
		style={{
			height: '100%',
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		<Empty
			image={Empty.PRESENTED_IMAGE_SIMPLE}
			description={<span style={{ color: 'var(--color-panel-text-muted)' }}>{description}</span>}
		/>
	</div>
);

export default function DonationsPage() {
	const { t } = useTranslation();
	const [donations, setDonations] = useState<Donation[]>([]);
	const [stats, setStats] = useState<DonationStats | null>(null);
	const [statsLoading, setStatsLoading] = useState(true);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	// Whether sandbox/test-mode purchases are visible in the list below.
	const [showTest, setShowTest] = useState(true);
	// Item-type filter for the list: 'all', 'superchat', 'effect' or 'archive'.
	const [itemFilter, setItemFilter] = useState('all');
	// Server base currency: crypto purchases are converted to it and revenue is
	// reported in it. Defaults to JPY.
	const [baseCurrency, setBaseCurrency] = useState('JPY');
	const [baseCurrencySaving, setBaseCurrencySaving] = useState(false);
	const pageSize = 20;

	const { theme: siteTheme } = useSiteTheme();

	// Chart.js paints to a canvas, so CSS custom properties can't be used
	// directly; resolve the theme tokens to concrete values and re-read them
	// whenever the site theme changes. The series palettes above stay
	// theme-invariant.
	const chartTheme = useMemo(() => {
		const styles =
			typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
		return {
			text: styles?.getPropertyValue('--color-panel-text-muted').trim() || undefined,
			grid: styles?.getPropertyValue('--color-panel-border-soft').trim() || undefined,
			surface: styles?.getPropertyValue('--color-panel-bg').trim() || undefined,
		};
	}, [siteTheme]);

	const fetchDonations = async () => {
		setLoading(true);
		try {
			const offset = (currentPage - 1) * pageSize;
			const result = await fetchData(`${DONATIONS}?limit=${pageSize}&offset=${offset}`, {
				auth: true,
			});
			setDonations(result.donations || []);
			setTotalCount(result.total || 0);
		} catch (error) {
			console.error('Failed to fetch donations:', error);
		}
		setLoading(false);
	};

	const fetchStats = async () => {
		try {
			const result = await fetchData(DONATIONS_STATS, { auth: true });
			if (result && Array.isArray(result.currencies)) {
				setStats(result);
			}
		} catch (error) {
			console.error('Failed to fetch purchase stats:', error);
		}
		setStatsLoading(false);
	};

	const fetchBaseCurrency = async () => {
		try {
			const result = await fetchData(ADMIN_BASE_CURRENCY, { auth: true });
			if (result && result.baseCurrency) {
				setBaseCurrency(result.baseCurrency);
			}
		} catch (error) {
			console.error('Failed to fetch base currency:', error);
		}
	};

	const saveBaseCurrency = async (value: string) => {
		setBaseCurrencySaving(true);
		try {
			await fetchData(ADMIN_BASE_CURRENCY_SET, {
				method: 'POST',
				data: { baseCurrency: value },
				auth: true,
			});
			setBaseCurrency(value);
			message.success(t('admin.pages.donations.baseCurrency.saved'));
			// Reload aggregates so they re-report in the new base currency.
			fetchStats();
		} catch (error) {
			console.error('Failed to save base currency:', error);
			message.error(t('admin.pages.donations.baseCurrency.saveFailed'));
		}
		setBaseCurrencySaving(false);
	};

	useEffect(() => {
		fetchDonations();
	}, [currentPage]);

	useEffect(() => {
		fetchStats();
		fetchBaseCurrency();
	}, []);

	const handleCreateDonation = async (values: DonationFormValues) => {
		try {
			await fetchData(DONATIONS_CREATE, {
				auth: true,
				method: 'POST',
				data: values,
			});
			message.success(t('admin.pages.donations.messages.created'));
			setIsModalOpen(false);
			fetchDonations();
			fetchStats();
		} catch (_error) {
			message.error(t('admin.pages.donations.messages.createFailed'));
		}
	};

	const handleVisibilityToggle = async (id: string, visible: boolean) => {
		try {
			await fetchData(DONATIONS_VISIBILITY, {
				auth: true,
				method: 'POST',
				data: { id, visible },
			});
			message.success(
				visible
					? t('admin.pages.donations.messages.shown')
					: t('admin.pages.donations.messages.hidden'),
			);
			fetchDonations();
		} catch (_error) {
			message.error(t('admin.pages.donations.messages.updateFailed'));
		}
	};

	// Revokes an archive entitlement: the purchase row is what carries the
	// viewing access, so the server removes it (and the row) permanently.
	const handleRevokeArchive = async (donationId: string) => {
		try {
			await fetchData(ADMIN_ARCHIVES_PURCHASES_REVOKE, {
				auth: true,
				method: 'POST',
				data: { donationId },
			});
			message.success(t('admin.pages.donations.revoke.success'));
			fetchDonations();
			fetchStats();
		} catch (_error) {
			message.error(t('admin.pages.donations.revoke.failed'));
		}
	};

	const handleDelete = async (id: string) => {
		Modal.confirm({
			title: t('admin.pages.donations.deleteConfirm.title'),
			content: t('admin.pages.donations.deleteConfirm.content'),
			okText: t('admin.pages.common.delete'),
			okType: 'danger',
			cancelText: t('admin.pages.common.cancel'),
			onOk: async () => {
				try {
					await fetchData(DONATIONS_DELETE, {
						auth: true,
						method: 'POST',
						data: { id },
					});
					message.success(t('admin.pages.donations.messages.deleted'));
					fetchDonations();
					fetchStats();
				} catch (_error) {
					message.error(t('admin.pages.donations.messages.deleteFailed'));
				}
			},
		});
	};

	// Headline aggregates come from the main currency (currencies[0], the one
	// with the most purchases — normally JPY). Other currencies are shown as
	// small secondary lines on each card.
	const mainCurrency = stats?.currencies[0] ?? null;
	const purchaseCount = stats?.currencies.reduce((sum, c) => sum + c.count, 0) ?? 0;
	const momPercent =
		mainCurrency && mainCurrency.lastMonth > 0
			? ((mainCurrency.thisMonth - mainCurrency.lastMonth) / mainCurrency.lastMonth) * 100
			: null;

	// Daily revenue chart: the last 30 days zero-filled per currency, with the
	// raw stored totals kept aside so tooltips can reuse formatDonationAmount.
	const dailyChart = useMemo(() => {
		if (!stats || stats.daily.length === 0) {
			return null;
		}
		const today = new Date();
		const days = Array.from({ length: 30 }, (_, i) => format(subDays(today, 29 - i), 'yyyy-MM-dd'));
		const currencies = Array.from(new Set(stats.daily.map(d => d.currency)));
		const totals = new Map<string, number>();
		const counts = new Map<string, number>();
		stats.daily.forEach(d => {
			totals.set(`${d.currency}|${d.date}`, d.total);
			counts.set(`${d.currency}|${d.date}`, d.count);
		});
		const datasets = currencies.map((currency, i) => ({
			label: currency,
			data: days.map(day =>
				donationAmountToMajorUnits(totals.get(`${currency}|${day}`) ?? 0, currency),
			),
			backgroundColor: CURRENCY_SERIES_COLORS[i % CURRENCY_SERIES_COLORS.length],
			borderRadius: 3,
		}));
		return { days, labels: days.map(dayAxisLabel), datasets, totals, counts };
	}, [stats]);

	const dailyChartOptions = useMemo<ChartOptions<'bar'> | null>(() => {
		if (!dailyChart) {
			return null;
		}
		return {
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					ticks: { color: chartTheme.text, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 },
					grid: { display: false },
				},
				y: {
					beginAtZero: true,
					ticks: { color: chartTheme.text },
					grid: { color: chartTheme.grid },
				},
			},
			plugins: {
				legend: {
					display: dailyChart.datasets.length > 1,
					labels: { color: chartTheme.text },
				},
				tooltip: {
					callbacks: {
						label: (ctx: TooltipItem<'bar'>) => {
							const currency = ctx.dataset.label ?? '';
							const key = `${currency}|${dailyChart.days[ctx.dataIndex]}`;
							const raw = dailyChart.totals.get(key) ?? 0;
							const count = dailyChart.counts.get(key) ?? 0;
							return t('admin.pages.donations.charts.dailyTooltip', {
								currency,
								amount: formatDonationAmount(raw, currency),
								num: count,
							});
						},
					},
				},
			},
		};
	}, [dailyChart, chartTheme, t]);

	// Provider breakdown doughnut: slice size is the purchase count (currency
	// neutral); tooltips add the per-currency revenue.
	const providerChart = useMemo(() => {
		if (!stats || stats.providers.length === 0) {
			return null;
		}
		const byProvider = new Map<string, { count: number; amounts: string[] }>();
		stats.providers.forEach(p => {
			const entry = byProvider.get(p.provider) ?? { count: 0, amounts: [] };
			entry.count += p.count;
			entry.amounts.push(formatDonationAmount(p.total, p.currency));
			byProvider.set(p.provider, entry);
		});
		const providers = Array.from(byProvider.keys());
		return {
			labels: providers.map(p => getProviderMeta(p, t).label),
			data: providers.map(p => byProvider.get(p)?.count ?? 0),
			colors: providers.map(p => getProviderMeta(p, t).chartColor),
			amounts: providers.map(p => byProvider.get(p)?.amounts.join(' / ') ?? ''),
		};
	}, [stats, t]);

	const providerChartOptions = useMemo<ChartOptions<'doughnut'> | null>(() => {
		if (!providerChart) {
			return null;
		}
		return {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { position: 'bottom', labels: { color: chartTheme.text, padding: 12 } },
				tooltip: {
					callbacks: {
						label: (ctx: TooltipItem<'doughnut'>) =>
							t('admin.pages.donations.charts.providerTooltip', {
								label: ctx.label,
								num: providerChart.data[ctx.dataIndex],
								amounts: providerChart.amounts[ctx.dataIndex],
							}),
					},
				},
			},
		};
	}, [providerChart, chartTheme, t]);

	// Item breakdown: superchats vs each screen effect, as a horizontal bar.
	const itemChart = useMemo(() => {
		if (!stats || stats.items.length === 0) {
			return null;
		}
		const items = [...stats.items].sort((a, b) => itemStatOrder(a) - itemStatOrder(b));
		return {
			labels: items.map(item => itemStatLabel(item, t)),
			data: items.map(item => item.count),
			colors: items.map((_, i) => ITEM_SERIES_COLORS[i % ITEM_SERIES_COLORS.length]),
		};
	}, [stats, t]);

	const itemChartOptions = useMemo<ChartOptions<'bar'> | null>(() => {
		if (!itemChart) {
			return null;
		}
		return {
			indexAxis: 'y',
			responsive: true,
			maintainAspectRatio: false,
			scales: {
				x: {
					beginAtZero: true,
					ticks: { color: chartTheme.text, precision: 0 },
					grid: { color: chartTheme.grid },
				},
				y: {
					ticks: { color: chartTheme.text, font: { size: 13 } },
					grid: { display: false },
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label: (ctx: TooltipItem<'bar'>) =>
							t('admin.pages.donations.charts.itemTooltip', { num: ctx.parsed.x }),
					},
				},
			},
		};
	}, [itemChart, chartTheme, t]);

	// Charts with an empty or all-zero dataset fall back to an empty state
	// instead of painting a meaningless canvas.
	const dailyHasData = Boolean(
		dailyChart && dailyChart.datasets.some(dataset => dataset.data.some(value => value !== 0)),
	);
	const providersHaveData = Boolean(providerChart && providerChart.data.some(value => value !== 0));
	const itemsHaveData = Boolean(itemChart && itemChart.data.some(value => value !== 0));

	const visibleDonations = showTest ? donations : donations.filter(d => !d.isTest);
	// Item-type filter applied client-side to the loaded page; rows without an
	// itemType are legacy superchat purchases.
	const filteredDonations =
		itemFilter === 'all'
			? visibleDonations
			: visibleDonations.filter(d => (d.itemType || 'superchat') === itemFilter);

	const columns = [
		{
			title: t('admin.pages.donations.columns.date'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (date: string) => format(new Date(date), 'yyyy/MM/dd HH:mm', { locale: ja }),
		},
		{
			title: t('admin.pages.donations.columns.item'),
			key: 'itemType',
			width: 170,
			render: (_: unknown, record: Donation) => purchaseItemLabel(record, t),
		},
		{
			title: t('admin.pages.donations.columns.provider'),
			key: 'paymentProvider',
			width: 150,
			render: (_: unknown, record: Donation) => {
				const meta = getProviderMeta(record.paymentProvider, t);
				return (
					<>
						<Tag color={meta.tagColor}>{meta.label}</Tag>
						{record.isTest && (
							<Tooltip title={t('admin.pages.donations.testTooltip')}>
								<Tag color="gold">{t('admin.pages.donations.testTag')}</Tag>
							</Tooltip>
						)}
					</>
				);
			},
		},
		{
			title: t('admin.pages.donations.columns.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 140,
			render: (amount: number, record: Donation) => (
				<>
					<Text type="danger" style={{ fontWeight: 'bold' }}>
						{formatDonationAmount(amount, record.currency)}
					</Text>
					{/* Crypto purchases carry the JPY value recorded at confirmation
					    time; show it under the on-chain amount. */}
					{(record.amountJpy ?? 0) > 0 && record.currency?.toUpperCase() !== 'JPY' && (
						<div style={{ fontSize: 12, color: 'var(--color-panel-text-muted)' }}>
							≈ {formatDonationAmount(record.amountJpy ?? 0, 'JPY')}
						</div>
					)}
				</>
			),
		},
		{
			title: t('admin.pages.donations.columns.purchaser'),
			dataIndex: 'displayName',
			key: 'displayName',
			width: 150,
			render: (name: string, record: Donation) =>
				record.isAnonymous ? (
					<em style={{ color: 'var(--color-panel-text-muted)' }}>
						{t('admin.pages.donations.anonymous')}
					</em>
				) : (
					name
				),
		},
		{
			title: t('admin.pages.donations.columns.message'),
			dataIndex: 'message',
			key: 'message',
			ellipsis: true,
		},
		{
			title: t('admin.pages.donations.columns.status'),
			key: 'status',
			width: 100,
			render: (_: unknown, record: Donation) =>
				record.hiddenAt ? (
					<Button
						type="text"
						icon={<EyeInvisibleOutlined />}
						onClick={() => handleVisibilityToggle(record.id, true)}
						title={t('admin.pages.donations.show')}
					>
						{t('admin.pages.donations.hiddenLabel')}
					</Button>
				) : (
					<Button
						type="text"
						icon={<EyeOutlined />}
						onClick={() => handleVisibilityToggle(record.id, false)}
						title={t('admin.pages.donations.hide')}
					>
						{t('admin.pages.donations.visible')}
					</Button>
				),
		},
		{
			title: t('admin.pages.donations.columns.action'),
			key: 'action',
			width: 140,
			render: (_: unknown, record: Donation) => (
				<Space size={0}>
					{record.itemType === 'archive' && (
						<Popconfirm
							title={t('admin.pages.donations.revoke.confirmTitle')}
							description={t('admin.pages.donations.revoke.confirmContent')}
							okText={t('admin.pages.donations.revoke.button')}
							okType="danger"
							cancelText={t('admin.pages.common.cancel')}
							onConfirm={() => handleRevokeArchive(record.id)}
						>
							<Button type="text" danger size="small">
								{t('admin.pages.donations.revoke.button')}
							</Button>
						</Popconfirm>
					)}
					<Button
						type="text"
						danger
						icon={<DeleteOutlined />}
						onClick={() => handleDelete(record.id)}
						title={t('admin.pages.common.delete')}
					/>
				</Space>
			),
		},
	];

	return (
		<>
			<Title>{t('admin.pages.donations.title')}</Title>
			<Paragraph>{t('admin.pages.donations.intro')}</Paragraph>

			{/* Base currency: crypto purchases are converted to it and revenue is
			    reported in it. JPY by default. */}
			<Card style={{ marginBottom: 16 }}>
				<Text strong>{t('admin.pages.donations.baseCurrency.label')}</Text>
				<Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
					{t('admin.pages.donations.baseCurrency.help')}
				</Paragraph>
				<CurrencySelect
					value={baseCurrency}
					onChange={saveBaseCurrency}
					disabled={baseCurrencySaving}
				/>
			</Card>

			{/* Summary cards: monthly revenue with MoM change, lifetime totals,
			    counts, average and unique purchasers. */}
			<Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
				<Col xs={24} sm={12} lg={8} xl={6}>
					<Card
						loading={statsLoading}
						style={{
							background:
								'linear-gradient(135deg, rgba(102, 126, 234, 0.35), rgba(118, 75, 162, 0.25))',
							borderColor: '#667eea',
						}}
					>
						<Statistic
							title={t('admin.pages.donations.stats.thisMonth')}
							value={formatDonationAmount(
								mainCurrency?.thisMonth ?? 0,
								mainCurrency?.currency ?? 'JPY',
							)}
							prefix={<CalendarOutlined />}
							valueStyle={{ fontWeight: 600 }}
						/>
						{momPercent !== null ? (
							<div
								style={{
									marginTop: 8,
									fontSize: 13,
									color: momPercent >= 0 ? '#52c41a' : '#ff4d4f',
								}}
							>
								{momPercent >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}{' '}
								{t('admin.pages.donations.stats.momLabel')} {momPercent >= 0 ? '+' : ''}
								{momPercent.toFixed(1)}%
							</div>
						) : (
							<div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-panel-text-muted)' }}>
								{t('admin.pages.donations.stats.noLastMonth')}
							</div>
						)}
						<CurrencySubLines stats={stats} field="thisMonth" />
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={8} xl={6}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('admin.pages.donations.stats.total')}
							value={formatDonationAmount(
								mainCurrency?.total ?? 0,
								mainCurrency?.currency ?? 'JPY',
							)}
							prefix={<DollarCircleOutlined style={{ color: '#faad14' }} />}
						/>
						<CurrencySubLines stats={stats} field="total" />
					</Card>
				</Col>
				{/* Base-currency value of crypto purchases, recorded at their
				    confirmation time; hidden until at least one converted purchase
				    exists. */}
				{(stats?.cryptoFiatTotal ?? 0) > 0 && (
					<Col xs={24} sm={12} lg={8} xl={6}>
						<Card loading={statsLoading}>
							<Statistic
								title={t('admin.pages.donations.stats.cryptoJpy')}
								value={formatDonationAmount(
									stats?.cryptoFiatTotal ?? 0,
									stats?.baseCurrency ?? 'JPY',
								)}
								prefix={<GoldOutlined style={{ color: '#fa8c16' }} />}
							/>
							<div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-panel-text-muted)' }}>
								{t('admin.pages.donations.stats.cryptoJpyNote')}
							</div>
						</Card>
					</Col>
				)}
				<Col xs={24} sm={12} lg={8} xl={4}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('admin.pages.donations.stats.purchaseCount')}
							value={purchaseCount}
							prefix={<GiftOutlined style={{ color: '#667eea' }} />}
							suffix={t('admin.pages.donations.stats.countSuffix')}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={12} xl={4}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('admin.pages.donations.stats.average')}
							value={formatDonationAmount(
								mainCurrency?.average ?? 0,
								mainCurrency?.currency ?? 'JPY',
							)}
							prefix={<BarChartOutlined style={{ color: '#2dd4bf' }} />}
						/>
						<CurrencySubLines stats={stats} field="average" />
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={12} xl={4}>
					<Card loading={statsLoading}>
						<Statistic
							title={t('admin.pages.donations.stats.uniquePurchasers')}
							value={stats?.uniquePurchasers ?? 0}
							prefix={<TeamOutlined style={{ color: '#f472b6' }} />}
							suffix={t('admin.pages.donations.stats.peopleSuffix')}
						/>
						<div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-panel-text-muted)' }}>
							{t('admin.pages.donations.stats.excludingAnonymous')}
						</div>
					</Card>
				</Col>
			</Row>

			{/* Charts: daily revenue trend plus provider / item breakdowns. */}
			<Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
				<Col xs={24} lg={14} xl={16}>
					<Card title={t('admin.pages.donations.charts.daily')} loading={statsLoading}>
						<div style={{ height: 300 }}>
							{dailyHasData && dailyChart && dailyChartOptions ? (
								<Bar
									data={{ labels: dailyChart.labels, datasets: dailyChart.datasets }}
									options={dailyChartOptions}
								/>
							) : (
								<ChartEmptyState description={t('admin.pages.donations.charts.emptyDaily')} />
							)}
						</div>
					</Card>
				</Col>
				<Col xs={24} lg={10} xl={8}>
					<Card title={t('admin.pages.donations.charts.byProvider')} loading={statsLoading}>
						<div style={{ height: 300 }}>
							{providersHaveData && providerChart && providerChartOptions ? (
								<Doughnut
									data={{
										labels: providerChart.labels,
										datasets: [
											{
												data: providerChart.data,
												backgroundColor: providerChart.colors,
												// Slice separators match the current card surface.
												borderColor: chartTheme.surface,
												borderWidth: 2,
											},
										],
									}}
									options={providerChartOptions}
								/>
							) : (
								<ChartEmptyState description={t('admin.pages.donations.charts.emptyProviders')} />
							)}
						</div>
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
				<Col xs={24}>
					<Card title={t('admin.pages.donations.charts.byItem')} loading={statsLoading}>
						{itemsHaveData && itemChart && itemChartOptions ? (
							<div style={{ height: Math.max(160, itemChart.labels.length * 40) }}>
								<Bar
									data={{
										labels: itemChart.labels,
										datasets: [
											{
												data: itemChart.data,
												backgroundColor: itemChart.colors,
												borderRadius: 4,
											},
										],
									}}
									options={itemChartOptions}
								/>
							</div>
						) : (
							<div style={{ height: 160 }}>
								<ChartEmptyState description={t('admin.pages.donations.charts.emptyItems')} />
							</div>
						)}
					</Card>
				</Col>
			</Row>

			<Space style={{ marginBottom: 16 }} wrap>
				<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
					{t('admin.pages.donations.addManually')}
				</Button>
				<Button onClick={() => setIsGrantModalOpen(true)}>
					{t('admin.pages.donations.grant.button')}
				</Button>
				<Segmented
					value={itemFilter}
					onChange={value => setItemFilter(value as string)}
					options={[
						{ value: 'all', label: t('admin.pages.donations.filter.all') },
						{ value: 'superchat', label: t('admin.pages.donations.filter.superchat') },
						{ value: 'effect', label: t('admin.pages.donations.filter.effect') },
						{ value: 'archive', label: t('admin.pages.donations.filter.archive') },
					]}
				/>
				<Space>
					<Switch size="small" checked={showTest} onChange={setShowTest} />
					<span>{t('admin.pages.donations.showTest')}</span>
					{(stats?.testCount ?? 0) > 0 && (
						<Tooltip title={t('admin.pages.donations.testTooltip')}>
							<Tag color="gold">
								{t('admin.pages.donations.testCountTag', { num: stats?.testCount })}
							</Tag>
						</Tooltip>
					)}
				</Space>
			</Space>

			<Table
				rowKey="id"
				columns={columns}
				// Test and item-type filters apply client-side within the fetched
				// page; the pagination totals still count everything.
				dataSource={filteredDonations}
				loading={loading}
				scroll={{ x: 1000 }}
				pagination={{
					current: currentPage,
					pageSize,
					total: totalCount,
					onChange: page => setCurrentPage(page),
					showSizeChanger: false,
				}}
			/>

			<NewDonationModal
				open={isModalOpen}
				onOk={handleCreateDonation}
				onCancel={() => setIsModalOpen(false)}
			/>

			<GrantAccessModal
				open={isGrantModalOpen}
				onGranted={() => {
					setIsGrantModalOpen(false);
					fetchDonations();
					fetchStats();
				}}
				onCancel={() => setIsGrantModalOpen(false)}
			/>
		</>
	);
}

DonationsPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};
