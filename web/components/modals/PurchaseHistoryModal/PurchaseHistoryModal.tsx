import { Button, List, Spin, Tag, Typography } from 'antd';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@components/compat/router';
import { useAccessToken, useChatAuthenticated } from '../../stores/zustand-store';
import { DONATIONS_MINE, getUnauthedData, withArchiveAccessToken } from '../../../utils/apis';
import { formatArchivePrice } from '../../../interfaces/archive.model';

const { Text } = Typography;

// One row of GET /api/donations/mine: a confirmed purchase bound to the
// viewer's authenticated account. archiveTitle/archiveAvailable describe the
// purchased archive's current state (deleted archives stay in the history).
interface PurchaseRecord {
	id: string;
	createdAt: string;
	itemType: 'superchat' | 'effect' | 'archive';
	effectType?: string;
	amount: number;
	currency: string;
	provider?: string;
	isTest?: boolean;
	archiveId?: string;
	archiveTitle?: string;
	archiveAvailable?: boolean;
}

export const PurchaseHistoryModal: FC = () => {
	const { t, i18n } = useTranslation();
	const router = useRouter();
	const accessToken = useAccessToken();
	const chatAuthenticated = useChatAuthenticated();
	const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Purchases are bound to an authenticated account, so guests have
		// nothing to fetch (the login hint renders instead).
		if (!chatAuthenticated || !accessToken) {
			return undefined;
		}
		let cancelled = false;
		const loadPurchases = async () => {
			setLoading(true);
			try {
				const data = await getUnauthedData(withArchiveAccessToken(DONATIONS_MINE, accessToken));
				if (!cancelled) {
					setPurchases(Array.isArray(data) ? data : []);
				}
			} catch (error) {
				console.error('Failed to fetch purchase history:', error);
				if (!cancelled) {
					setPurchases([]);
				}
			}
			if (!cancelled) {
				setLoading(false);
			}
		};
		loadPurchases();
		return () => {
			cancelled = true;
		};
	}, [accessToken, chatAuthenticated]);

	if (!chatAuthenticated) {
		return <p>{t('purchases.loginHint')}</p>;
	}

	if (loading) {
		return (
			<div style={{ textAlign: 'center', padding: '24px 0' }}>
				<Spin />
			</div>
		);
	}

	if (purchases.length === 0) {
		return <p>{t('purchases.empty')}</p>;
	}

	const itemLabel = (purchase: PurchaseRecord): string => {
		if (purchase.itemType === 'archive') {
			return purchase.archiveTitle || t('purchases.archiveDeleted');
		}
		if (purchase.itemType === 'effect') {
			return t('purchases.itemEffect');
		}
		return t('purchases.itemSuperchat');
	};

	return (
		<List
			size="small"
			dataSource={purchases}
			renderItem={purchase => {
				// Only archives that still exist (and are watchable by this
				// account) get a link into the VOD player.
				const watchId =
					purchase.itemType === 'archive' && purchase.archiveAvailable
						? purchase.archiveId
						: undefined;
				return (
					<List.Item
						key={purchase.id}
						actions={
							watchId
								? [
										<Button
											key="watch"
											type="link"
											size="small"
											onClick={() => router.push(`/archives?watch=${encodeURIComponent(watchId)}`)}
										>
											{t('purchases.watch')}
										</Button>,
									]
								: undefined
						}
					>
						<List.Item.Meta
							title={
								<>
									{itemLabel(purchase)}{' '}
									{purchase.itemType === 'archive' && <Tag>{t('purchases.itemArchive')}</Tag>}
									{purchase.isTest && <Tag color="gold">{t('purchases.testTag')}</Tag>}
								</>
							}
							description={
								<Text type="secondary" style={{ fontSize: 12 }}>
									{new Date(purchase.createdAt).toLocaleString(i18n.language)}
									{purchase.provider ? ` · ${purchase.provider}` : ''}
								</Text>
							}
						/>
						<Text strong>
							{formatArchivePrice(purchase.amount, purchase.currency, i18n.language)}
						</Text>
					</List.Item>
				);
			}}
		/>
	);
};
