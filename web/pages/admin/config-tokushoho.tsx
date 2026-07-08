import { Typography, Switch, Button, Alert, message, Form, Input } from 'antd';
import React, { useState, useEffect, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchData, ADMIN_TOKUSHOHO, ADMIN_TOKUSHOHO_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';

const { Text } = Typography;
const { TextArea } = Input;

interface TokushohoInfo {
	enabled: boolean;
	markdownContent: string;
}

// Default legal-notice template body is intentionally kept in Japanese
// (it is a Japanese legal document, not UI copy).
const defaultMarkdown = `# 特定商取引法に基づく表記

## 1. 事業者の名称

（事業者名/屋号を入力）

## 2. 代表者または通信販売に関する業務の責任者の氏名

（責任者名を入力、または「請求があったら遅滞なく開示します。」）

## 3. 住所

（住所を入力、または「請求があったら遅滞なく開示します。」）

## 4. 電話番号

（電話番号を入力、または「請求があったら遅滞なく開示します。」）

## 5. メールアドレス

example@example.com

## 6. 販売価格

* **PayPay決済の場合**: 画面に表示された日本円金額（消費税込み）。
* **暗号資産決済の場合**: 画面に表示されたトークン量。
* ※日本円換算額は、決済時点での市場レートに準じます。

## 7. 商品代金以外の必要料金

* インターネット接続にかかる通信回線等の諸費用。
* **暗号資産決済におけるネットワーク手数料（ガス代）**: お客様の負担となります。

## 8. 代金の支払方法・時期

* **PayPay残高払い**: スーパーチャット購入（決済）実行時にお支払いが確定します。
* **暗号資産（仮想通貨）決済**: お客様のウォレットでの承認後、ブロックチェーン上でトランザクションが完了した時点でお支払いが確定します。

## 9. 商品（役務）の引渡時期

決済完了後、直ちにスーパーチャット（配信画面・チャット上へのメッセージ表示サービス）が提供されます。
（※暗号資産の場合、ネットワークの混雑状況により反映まで数分〜数十分程度かかる場合があります）

## 10. 返品・交換・キャンセルについて

デジタルコンテンツおよびブロックチェーン決済の性質上、**決済処理開始後のお客様都合による返品・交換・キャンセルは一切お受けできません。**

## 11. 動作環境

* 推奨ブラウザ：Google Chrome, Safari, Firefox, Microsoft Edge の各最新版
* 暗号資産決済をご利用の場合：MetaMask等のWeb3ウォレットがインストールされたブラウザが必要です。
`;

const defaultInfo: TokushohoInfo = {
	enabled: false,
	markdownContent: defaultMarkdown,
};

// Legacy field-based data returned by servers that predate the markdown format
interface LegacyTokushohoData {
	businessName?: string;
	representativeName?: string;
	address?: string;
	phoneNumber?: string;
	email?: string;
	priceDescription?: string;
	paymentMethod?: string;
	paymentTiming?: string;
	deliveryTiming?: string;
	refundPolicy?: string;
	additionalNotes?: string;
}

// Migrate old format to markdown. The generated markdown is legal-document
// content, so it stays in Japanese like the default template above.
const migrateOldFormat = (oldData: LegacyTokushohoData) => {
	return `# 特定商取引法に基づく表記

## 1. 事業者の名称

${oldData.businessName || '（未設定）'}

## 2. 代表者または通信販売に関する業務の責任者の氏名

${oldData.representativeName || '（未設定）'}

## 3. 住所

${oldData.address || '（未設定）'}

## 4. 電話番号

${oldData.phoneNumber || '（未設定）'}

## 5. メールアドレス

${oldData.email || '（未設定）'}

## 6. 販売価格

${oldData.priceDescription || '（未設定）'}

## 7. 支払い方法

${oldData.paymentMethod || '（未設定）'}

## 8. 支払い時期

${oldData.paymentTiming || '（未設定）'}

## 9. 商品の引渡時期

${oldData.deliveryTiming || '（未設定）'}

## 10. 返品・交換・キャンセルについて

${oldData.refundPolicy || '（未設定）'}

${oldData.additionalNotes ? `## その他特記事項\n\n${oldData.additionalNotes}` : ''}`;
};

const TokushohoConfigPage = () => {
	const { t } = useTranslation();
	const [form] = Form.useForm();
	const [saving, setSaving] = useState(false);
	const [enabled, setEnabled] = useState(false);

	// Fetching/loading goes through the shared hook. Saving stays local because it
	// posts the antd Form values (validated by the form) rather than the hook state.
	const { config, loading } = useConfigResource<TokushohoInfo>(
		ADMIN_TOKUSHOHO,
		ADMIN_TOKUSHOHO_SET,
		defaultInfo,
		{
			// Normalize the response, migrating legacy field-based data to markdown
			fromResponse: raw => {
				const data = raw as (Partial<TokushohoInfo> & LegacyTokushohoData) | null;
				if (data && Object.keys(data).length > 0) {
					// If markdownContent exists, use it. Otherwise, try to migrate from old format
					if (data.markdownContent) {
						return { enabled: data.enabled || false, markdownContent: data.markdownContent };
					}
					if (data.businessName) {
						return { enabled: data.enabled || false, markdownContent: migrateOldFormat(data) };
					}
					return { ...defaultInfo, enabled: data.enabled || false };
				}
				return defaultInfo;
			},
		},
	);

	// Sync the fetched config into the antd form once loading completes
	useEffect(() => {
		if (!loading) {
			form.setFieldsValue(config);
			setEnabled(config.enabled || false);
		}
	}, [loading]);

	const handleSave = async () => {
		try {
			const values = await form.validateFields();
			setSaving(true);

			await fetchData(ADMIN_TOKUSHOHO_SET, {
				method: 'POST',
				data: values,
			});
			message.success(t('admin.config.tokushoho.saveSuccess'));
		} catch (error) {
			if (error instanceof Error) {
				message.error(t('admin.config.tokushoho.saveError', { message: error.message }));
			} else {
				message.error(t('admin.config.tokushoho.validationError'));
			}
			console.error('Failed to save tokushoho info:', error);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.tokushoho.title')}
				description={t('admin.config.tokushoho.intro')}
			/>

			<Alert
				message={t('admin.config.tokushoho.legalAlertTitle')}
				description={
					<span>
						{t('admin.config.tokushoho.legalBody1')}
						<a
							href="https://www.no-trouble.caa.go.jp/what/"
							target="_blank"
							rel="noopener noreferrer"
						>
							{' '}
							{t('admin.config.tokushoho.legalLinkText')}{' '}
						</a>
						{t('admin.config.tokushoho.legalBody2')}
					</span>
				}
				type="warning"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<Form form={form} layout="vertical" initialValues={defaultInfo}>
				<SettingsCard title={t('admin.config.shared.basicSettings')}>
					<Form.Item
						name="enabled"
						label={t('admin.config.tokushoho.enableLabel')}
						valuePropName="checked"
					>
						<Switch onChange={setEnabled} />
					</Form.Item>
					{enabled && (
						<Alert
							message={t('admin.config.tokushoho.urlAlertTitle')}
							description={
								<Text code copyable>
									{typeof window !== 'undefined'
										? `${window.location.origin}/tokushoho`
										: '/tokushoho'}
								</Text>
							}
							type="info"
							style={{ marginTop: 8 }}
						/>
					)}
				</SettingsCard>

				<SettingsCard title={t('admin.config.tokushoho.contentCardTitle')}>
					<Alert
						message={t('admin.config.tokushoho.markdownGuideTitle')}
						description={
							<span>
								<code>{t('admin.config.tokushoho.mdH1Sample')}</code>、
								<code>{t('admin.config.tokushoho.mdH2Sample')}</code>、
								<code>{t('admin.config.tokushoho.mdBoldSample')}</code>、
								<code>{t('admin.config.tokushoho.mdListSample')}</code>{' '}
								{t('admin.config.tokushoho.markdownGuideSuffix')}
							</span>
						}
						type="info"
						style={{ marginBottom: 16 }}
					/>
					<Form.Item
						name="markdownContent"
						rules={[{ required: enabled, message: t('admin.config.tokushoho.contentRequired') }]}
					>
						<TextArea
							rows={25}
							style={{ fontFamily: 'monospace', fontSize: 13 }}
							placeholder={t('admin.config.tokushoho.contentPlaceholder')}
						/>
					</Form.Item>
				</SettingsCard>

				<Button type="primary" onClick={handleSave} loading={saving} size="large">
					{t('admin.config.shared.saveSettings')}
				</Button>
			</Form>
		</div>
	);
};

TokushohoConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default TokushohoConfigPage;
