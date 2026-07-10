import { Switch, InputNumber, Alert, Input, Button, Statistic, message } from 'antd';
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
import {
	fetchData,
	ADMIN_WALLET_STATS,
	ADMIN_WALLET_ADJUST,
} from '../../utils/apis';

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
	// Manual grant / deduction form.
	const [adjustUserId, setAdjustUserId] = useState('');
	const [adjustDelta, setAdjustDelta] = useState(0);
	const [adjustNote, setAdjustNote] = useState('');
	const [adjusting, setAdjusting] = useState(false);

	useEffect(() => {
		if (coinWallet) {
			setEnabled(!!coinWallet.enabled);
			setBonusPercent(coinWallet.bonusPercent || 0);
		}
	}, [coinWallet?.enabled, coinWallet?.bonusPercent]);

	const loadStats = () => {
		fetchData(ADMIN_WALLET_STATS, { auth: true })
			.then(res => setOutstanding(Number(res?.outstanding) || 0))
			.catch(() => setOutstanding(null));
	};
	useEffect(loadStats, []);

	const submitAdjust = async () => {
		if (!adjustUserId.trim() || !adjustDelta) {
			message.error(t('admin.config.coins.adjustValidation'));
			return;
		}
		setAdjusting(true);
		try {
			const res = await fetchData(ADMIN_WALLET_ADJUST, {
				method: 'POST',
				auth: true,
				data: { userId: adjustUserId.trim(), delta: adjustDelta, note: adjustNote.trim() },
			});
			if (res?.success) {
				message.success(t('admin.config.coins.adjustSuccess', { balance: res.balance }));
				setAdjustUserId('');
				setAdjustDelta(0);
				setAdjustNote('');
				loadStats();
			} else {
				message.error(res?.message || t('admin.config.coins.adjustError'));
			}
		} catch {
			message.error(t('admin.config.coins.adjustError'));
		} finally {
			setAdjusting(false);
		}
	};

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
			</SettingsCard>

			<SettingsCard title={t('admin.config.coins.adjustTitle')}>
				<FormField
					label={t('admin.config.coins.adjustUserIdLabel')}
					description={t('admin.config.coins.adjustUserIdDescription')}
				>
					<Input
						value={adjustUserId}
						onChange={e => setAdjustUserId(e.target.value)}
						placeholder="user id"
						style={{ marginTop: 8 }}
					/>
				</FormField>
				<FormField
					label={t('admin.config.coins.adjustDeltaLabel')}
					description={t('admin.config.coins.adjustDeltaDescription')}
				>
					<InputNumber
						value={adjustDelta}
						onChange={value => setAdjustDelta(Number(value) || 0)}
						style={{ marginTop: 8, width: 200 }}
						addonBefore="🪙"
					/>
				</FormField>
				<FormField
					label={t('admin.config.coins.adjustNoteLabel')}
					description={t('admin.config.coins.adjustNoteDescription')}
				>
					<Input
						value={adjustNote}
						onChange={e => setAdjustNote(e.target.value)}
						style={{ marginTop: 8 }}
					/>
				</FormField>
				<Button type="primary" loading={adjusting} onClick={submitAdjust}>
					{t('admin.config.coins.adjustButton')}
				</Button>
			</SettingsCard>
		</div>
	);
};

CoinsConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default CoinsConfigPage;
