import { Typography, Switch, Input, Button, Alert } from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_FAQ, ADMIN_FAQ_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';

const { Text } = Typography;
const { TextArea } = Input;

interface FAQConfig {
	enabled: boolean;
	markdownContent: string;
}

const ConfigFAQ = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<FAQConfig>(
		ADMIN_FAQ,
		ADMIN_FAQ_SET,
		{ enabled: false, markdownContent: '' },
		{
			successMessage: t('admin.config.faq.saveSuccess'),
			errorMessage: t('admin.config.faq.saveError'),
		},
	);

	if (loading) {
		return <PageSkeleton />;
	}

	// Default FAQ template body is intentionally kept in Japanese (site-specific sample content).
	const defaultContent = `# よくあるご質問（FAQ）

## 配信について

### Q: 配信はいつ行われますか？
A: 配信スケジュールはX（旧Twitter）やDiscordでお知らせしています。フォローして最新情報をチェックしてください。

### Q: 配信を見逃した場合、アーカイブはありますか？
A: 一部の配信はアーカイブとして残しています。詳しくはお問い合わせください。

### Q: 配信が見れない・重い場合はどうすればいいですか？
A: 以下をお試しください：
- ブラウザを最新版に更新する
- 画質設定を下げる
- 他のブラウザ（Chrome, Firefox, Safari, Edge）で試す
- ネットワーク接続を確認する

---

## スーパーチャットについて

### Q: スーパーチャットの支払い方法は何がありますか？
A: 以下の決済方法に対応しています：
- **PayPay**（日本円）
- **PayPal**（日本円）
- **暗号資産（仮想通貨）**：Ethereum, Polygon, BNB Chain, Arbitrum, Optimism, Base, Bitcoin など

### Q: スーパーチャットのメッセージは配信者に届きますか？
A: はい、スーパーチャットの購入時に送信されたメッセージは配信画面に表示され、配信者に届きます。

### Q: 匿名でスーパーチャットを購入できますか？
A: はい、購入時に「匿名で送る」にチェックを入れることで、名前を表示せずに購入できます。

### Q: スーパーチャットの最低購入金額はいくらですか？
A: 決済方法によって異なります：
- PayPay: 100円から
- PayPal: 500円から（手数料の関係）
- 暗号資産: ネットワークによって異なります（ガス代を考慮した最低額が設定されています）

### Q: スーパーチャットのキャンセル・返金はできますか？
A: デジタルコンテンツ（メッセージ表示サービス）の性質上、購入完了後のキャンセル・返金はお受けできません。詳しくは[特定商取引法に基づく表記](/tokushoho)をご確認ください。

---

## 暗号資産（仮想通貨）決済について

### Q: どのウォレットが使えますか？
A: MetaMaskなどのWeb3対応ウォレット、またはWalletConnectに対応したモバイルウォレットアプリが使用できます。

### Q: 対応しているネットワーク（チェーン）は何ですか？
A: 以下のネットワークに対応しています：
- Ethereum（ETH）
- Polygon（MATIC）
- BNB Chain（BNB）
- Arbitrum One（ETH）
- Optimism（ETH）
- Base（ETH）
- Avalanche（AVAX）
- Bitcoin（BTC）- MetaMask Snap経由

### Q: ガス代（手数料）はいくらかかりますか？
A: ガス代はネットワークの混雑状況によって変動します。Polygon、Arbitrum、Baseなどのレイヤー2ネットワークを使用すると、ガス代を大幅に抑えることができます。

### Q: 送金したのに反映されません
A: 暗号資産の送金は、ネットワークの混雑状況により数分〜数十分かかる場合があります。トランザクションが完了（承認）されるまでお待ちください。それでも反映されない場合は、トランザクションハッシュを添えてお問い合わせください。

### Q: 間違ったネットワークに送金してしまいました
A: 異なるネットワークへの送信による消失については、技術的に復旧・返金が不可能です。送金前に必ずネットワークをご確認ください。

---

## アカウント・チャットについて

### Q: チャットに参加するにはアカウント登録が必要ですか？
A: いいえ、アカウント登録なしでチャットに参加できます。ただし、一部の機能（認証済みユーザー限定チャットなど）を利用する場合は、X（旧Twitter）やDiscordでの認証が必要な場合があります。

### Q: チャットで使える絵文字はありますか？
A: はい、配信者が設定したカスタム絵文字が使用できます。チャット入力欄の絵文字ボタンから選択できます。

### Q: チャットのルールはありますか？
A: 他の視聴者への誹謗中傷、スパム行為、不適切な内容の投稿は禁止です。ルール違反者はBANされる場合があります。

---

## お問い合わせ

### Q: 問い合わせ先はどこですか？
A: 以下の方法でお問い合わせいただけます：
- メール: admin@example.com
- X（旧Twitter）のDM
- Discord

### Q: 返信にはどのくらいかかりますか？
A: 通常1〜3営業日以内にご返信いたします。お急ぎの場合はその旨をお伝えください。
`;

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.faq.title')}
				description={t('admin.config.faq.intro')}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField label={t('admin.config.faq.enableLabel')}>
					<Switch
						checked={config.enabled}
						onChange={checked => update({ enabled: checked })}
						style={{ marginTop: 8 }}
					/>
					<span style={{ marginLeft: 8 }}>
						{config.enabled
							? t('admin.config.faq.statusEnabled')
							: t('admin.config.faq.statusDisabled')}
					</span>
				</FormField>

				{config.enabled && (
					<Alert
						message={t('admin.config.faq.urlAlertTitle')}
						description={
							<Text code copyable>
								{typeof window !== 'undefined' ? `${window.location.origin}/faq` : '/faq'}
							</Text>
						}
						type="info"
						showIcon
					/>
				)}
			</SettingsCard>

			<SettingsCard title={t('admin.config.faq.contentCardTitle')}>
				<TextArea
					value={config.markdownContent}
					onChange={e => update({ markdownContent: e.target.value })}
					placeholder={defaultContent}
					rows={25}
					style={{
						fontFamily: 'monospace',
						fontSize: 13,
					}}
				/>
				<div style={{ marginTop: 8 }}>
					<Button size="small" onClick={() => update({ markdownContent: defaultContent })}>
						{t('admin.config.faq.insertSample')}
					</Button>
				</div>
			</SettingsCard>

			<SettingsCard title={t('admin.config.faq.markdownGuideTitle')}>
				<Alert
					message={t('admin.config.faq.basicSyntaxTitle')}
					description={
						<div>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdH1Sample')}
								</code>{' '}
								- {t('admin.config.faq.mdH1Label')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdH2Sample')}
								</code>{' '}
								- {t('admin.config.faq.mdH2Label')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdH3Sample')}
								</code>{' '}
								- {t('admin.config.faq.mdH3Label')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdBoldSample')}
								</code>{' '}
								- {t('admin.config.faq.mdBoldLabel')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdLinkSample')}
								</code>{' '}
								- {t('admin.config.faq.mdLinkLabel')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									{t('admin.config.faq.mdListSample')}
								</code>{' '}
								- {t('admin.config.faq.mdListLabel')}
							</p>
							<p style={{ margin: '4px 0' }}>
								<code style={{ backgroundColor: 'var(--color-chip-bg)', padding: '2px 6px' }}>
									---
								</code>{' '}
								- {t('admin.config.faq.mdHrLabel')}
							</p>
						</div>
					}
					type="info"
					showIcon
				/>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

ConfigFAQ.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default ConfigFAQ;
