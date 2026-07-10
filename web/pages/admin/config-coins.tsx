import { Switch, InputNumber, Alert, Statistic } from 'antd';
import React, { ReactElement, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { SettingsCard } from '../../components/admin/SettingsCard';
import { ServerStatusContext } from '../../utils/server-status-context';
import {
	postConfigUpdateToAPI,
	API_COIN_WALLET_ENABLED,
	API_COIN_CHARGE_BONUS_PERCENT,
} from '../../utils/config-constants';
import { fetchData, ADMIN_WALLET_STATS } from '../../utils/apis';

// Admin settings for the prepaid coin wallet. The two values are saved via the
// granular config endpoints (enable toggle + bonus percent); initial values come
// from the admin server config (instanceDetails.coinWallet).
const CoinsConfigPage = () => {
	const { t } = useTranslation();
	const serverStatusData = useContext(ServerStatusContext);
	const { serverConfig, setFieldInConfigState } = serverStatusData || {};
	const coinWallet = serverConfig?.instanceDetails?.coinWallet;

	const [enabled, setEnabled] = useState(false);
	const [bonusPercent, setBonusPercent] = useState(0);
	const [saving, setSaving] = useState(false);

	// Outstanding coin liability (sum of all balances).
	const [outstanding, setOutstanding] = useState<number | null>(null);

	useEffect(() => {
		if (coinWallet) {
			setEnabled(!!coinWallet.enabled);
			setBonusPercent(coinWallet.bonusPercent || 0);
		}
	}, [coinWallet?.enabled, coinWallet?.bonusPercent]);

	useEffect(() => {
		fetchData(ADMIN_WALLET_STATS, { auth: true })
			.then(res => setOutstanding(Number(res?.outstanding) || 0))
			.catch(() => setOutstanding(null));
	}, []);

	const save = async () => {
		setSaving(true);
		await postConfigUpdateToAPI({ apiPath: API_COIN_WALLET_ENABLED, data: { value: enabled } });
		await postConfigUpdateToAPI({
			apiPath: API_COIN_CHARGE_BONUS_PERCENT,
			data: { value: bonusPercent },
		});
		// Reflect the saved values back into the shared admin config state.
		setFieldInConfigState?.({
			fieldName: 'coinWallet',
			value: { enabled, bonusPercent },
			path: 'instanceDetails',
		});
		setSaving(false);
	};

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.coins.title')}
				description={t('admin.config.coins.intro')}
			/>

			<Alert
				message={t('admin.config.coins.aboutTitle')}
				description={t('admin.config.coins.aboutBody')}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField
					label={t('admin.config.coins.enableLabel')}
					description={t('admin.config.coins.enableDescription')}
				>
					<Switch checked={enabled} onChange={setEnabled} />
				</FormField>

				<FormField
					label={t('admin.config.coins.bonusLabel')}
					description={t('admin.config.coins.bonusDescription')}
				>
					<InputNumber
						min={0}
						max={100}
						value={bonusPercent}
						onChange={value => setBonusPercent(Number(value) || 0)}
						addonAfter="%"
						style={{ marginTop: 8 }}
					/>
				</FormField>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />

			<SettingsCard title={t('admin.config.coins.liabilityTitle')}>
				<Statistic
					title={t('admin.config.coins.outstandingLabel')}
					value={outstanding ?? 0}
					prefix="🪙"
				/>
				<div style={{ marginTop: 8, color: '#888', fontSize: 12 }}>
					{t('admin.config.coins.liabilityNote')}
				</div>
				<Alert
					style={{ marginTop: 12 }}
					type="info"
					showIcon
					message={t('admin.config.coins.grantMovedNote')}
				/>
			</SettingsCard>
		</div>
	);
};

CoinsConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default CoinsConfigPage;
