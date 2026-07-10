import {
	Switch,
	Input,
	Alert,
	Space,
	message,
	Select,
	Divider,
	InputNumber,
	Descriptions,
} from 'antd';
import React, { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ADMIN_METAMASK_CONFIG, ADMIN_METAMASK_CONFIG_SET } from '../../utils/apis';
import { useConfigResource } from '../../utils/use-config-resource';
import { AdminLayout } from '../../components/layouts/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { FormField } from '../../components/admin/FormField';
import { FormFooter } from '../../components/admin/FormFooter';
import { PageSkeleton } from '../../components/admin/PageSkeleton';
import { SettingsCard } from '../../components/admin/SettingsCard';

interface MetamaskConfig {
	enabled: boolean;
	walletAddress: string;
	bitcoinAddress?: string;
	solanaAddress?: string;
	networkId: number;
	networkName: string;
	chainCurrency: string;
	useCustomToken: boolean;
	tokenAddress: string;
	tokenSymbol: string;
	tokenDecimals: number;
	coinGeckoId: string;
	showJpyPrice: boolean;
}

interface NetworkPreset {
	id: number;
	name: string;
	currency: string;
	coinGeckoId: string;
}

interface TokenPreset {
	symbol: string;
	name: string;
	decimals: number;
	coinGeckoId: string;
	addresses: Record<number, string>;
}

const NETWORK_PRESETS: NetworkPreset[] = [
	{ id: 0, name: 'Bitcoin (Native SegWit)', currency: 'BTC', coinGeckoId: 'bitcoin' },
	{ id: 329, name: 'VirBiCoin', currency: 'VBC', coinGeckoId: '' },
	{ id: 1, name: 'Ethereum Mainnet', currency: 'ETH', coinGeckoId: 'ethereum' },
	{ id: 11155111, name: 'Sepolia (Testnet)', currency: 'ETH', coinGeckoId: 'ethereum' },
	{ id: 137, name: 'Polygon Mainnet', currency: 'MATIC', coinGeckoId: 'matic-network' },
	{ id: 80002, name: 'Amoy (Polygon Testnet)', currency: 'MATIC', coinGeckoId: 'matic-network' },
	{ id: 56, name: 'BNB Smart Chain', currency: 'BNB', coinGeckoId: 'binancecoin' },
	{ id: 42161, name: 'Arbitrum One', currency: 'ETH', coinGeckoId: 'ethereum' },
	{ id: 10, name: 'Optimism', currency: 'ETH', coinGeckoId: 'ethereum' },
	{ id: 8453, name: 'Base', currency: 'ETH', coinGeckoId: 'ethereum' },
	{ id: 43114, name: 'Avalanche C-Chain', currency: 'AVAX', coinGeckoId: 'avalanche-2' },
];

const TOKEN_PRESETS: TokenPreset[] = [
	{
		symbol: 'USDT',
		name: 'Tether USD',
		decimals: 6,
		coinGeckoId: 'tether',
		addresses: {
			1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
			137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
			56: '0x55d398326f99059fF775485246999027B3197955',
			42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		},
	},
	{
		symbol: 'USDC',
		name: 'USD Coin',
		decimals: 6,
		coinGeckoId: 'usd-coin',
		addresses: {
			1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
			137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
			56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
			42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
			10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
			8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		},
	},
	{
		symbol: 'DAI',
		name: 'Dai Stablecoin',
		decimals: 18,
		coinGeckoId: 'dai',
		addresses: {
			1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
			137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
			42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
		},
	},
];

const DEFAULT_METAMASK_CONFIG: MetamaskConfig = {
	enabled: false,
	walletAddress: '',
	bitcoinAddress: '',
	solanaAddress: '',
	networkId: 1,
	networkName: 'Ethereum Mainnet',
	chainCurrency: 'ETH',
	useCustomToken: false,
	tokenAddress: '',
	tokenSymbol: '',
	tokenDecimals: 18,
	coinGeckoId: 'ethereum',
	showJpyPrice: true,
};

// Shared address validators: both the save-time validate option and the
// inline field errors go through these, so the checks can never drift apart.
// The regexes are extracted verbatim from the previous inline checks.
const isValidEvmAddress = (address: string): boolean =>
	Boolean(address.match(/^0x[a-fA-F0-9]{40}$/));
const isValidBitcoinAddress = (address: string): boolean =>
	Boolean(address.match(/^bc1[a-zA-HJ-NP-Z0-9]{25,87}$/));
// A Solana account is 32 raw bytes in base58 (32-44 chars). Mirrors the
// server-side IsSolanaAddress check, which is the authoritative one.
const isValidSolanaAddress = (address: string): boolean =>
	Boolean(address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/));

const MetamaskConfigPage = () => {
	const { t } = useTranslation();
	const { config, update, loading, saving, save } = useConfigResource<MetamaskConfig>(
		ADMIN_METAMASK_CONFIG,
		ADMIN_METAMASK_CONFIG_SET,
		DEFAULT_METAMASK_CONFIG,
		{
			// Merge over defaults so fields missing from the response keep their initial values
			fromResponse: raw => ({ ...DEFAULT_METAMASK_CONFIG, ...(raw as Partial<MetamaskConfig>) }),
			validate: c => {
				if (c.enabled && !c.walletAddress) {
					return t('admin.config.metamask.validateWalletRequired');
				}
				if (c.walletAddress && !isValidEvmAddress(c.walletAddress)) {
					return t('admin.config.metamask.validateWalletFormat');
				}
				if (c.useCustomToken && !c.tokenAddress) {
					return t('admin.config.metamask.validateTokenRequired');
				}
				return null;
			},
			successMessage: t('admin.config.metamask.saveSuccess'),
		},
	);

	const handleNetworkChange = (networkId: number) => {
		const preset = NETWORK_PRESETS.find(n => n.id === networkId);
		if (preset) {
			let newTokenAddress = config.tokenAddress;
			let newTokenSymbol = config.tokenSymbol;

			if (config.useCustomToken && config.tokenSymbol) {
				const tokenPreset = TOKEN_PRESETS.find(t2 => t2.symbol === config.tokenSymbol);
				if (tokenPreset && tokenPreset.addresses[networkId]) {
					newTokenAddress = tokenPreset.addresses[networkId];
				} else {
					newTokenAddress = '';
					newTokenSymbol = '';
				}
			}

			update({
				networkId: preset.id,
				networkName: preset.name,
				chainCurrency: preset.currency,
				coinGeckoId: preset.coinGeckoId,
				tokenAddress: newTokenAddress,
				tokenSymbol: newTokenSymbol,
			});
		}
	};

	const handleTokenChange = (symbol: string) => {
		if (symbol === 'native') {
			const networkPreset = NETWORK_PRESETS.find(n => n.id === config.networkId);
			update({
				useCustomToken: false,
				tokenAddress: '',
				tokenSymbol: '',
				coinGeckoId: networkPreset?.coinGeckoId || 'ethereum',
			});
			return;
		}

		const tokenPreset = TOKEN_PRESETS.find(t2 => t2.symbol === symbol);
		if (tokenPreset) {
			const address = tokenPreset.addresses[config.networkId] || '';
			if (!address) {
				message.warning(t('admin.config.metamask.tokenUnavailable', { symbol }));
				return;
			}
			update({
				useCustomToken: true,
				tokenAddress: address,
				tokenSymbol: tokenPreset.symbol,
				tokenDecimals: tokenPreset.decimals,
				coinGeckoId: tokenPreset.coinGeckoId,
			});
		}
	};

	const getAvailableTokens = () => {
		const networkId = config.networkId;
		const tokens = [
			{
				value: 'native',
				label: t('admin.config.metamask.nativeCurrencyOption', { currency: config.chainCurrency }),
			},
		];

		TOKEN_PRESETS.forEach(token => {
			if (token.addresses[networkId]) {
				tokens.push({
					value: token.symbol,
					label: `${token.symbol} (${token.name})`,
				});
			}
		});

		return tokens;
	};

	if (loading) {
		return <PageSkeleton />;
	}

	return (
		<div>
			<AdminPageHeader
				title={t('admin.config.metamask.title')}
				description={t('admin.config.metamask.intro')}
			/>

			<Alert
				message={t('admin.config.metamask.aboutTitle')}
				description={<span>{t('admin.config.metamask.aboutBody')}</span>}
				type="info"
				showIcon
				style={{ marginBottom: 24 }}
			/>

			<SettingsCard title={t('admin.config.shared.basicSettings')}>
				<FormField label={t('admin.config.metamask.enableLabel')}>
					<Switch checked={config.enabled} onChange={checked => update({ enabled: checked })} />
				</FormField>

				<FormField
					label={t('admin.config.metamask.showJpyLabel')}
					description={t('admin.config.metamask.showJpyDescription')}
				>
					<Switch
						checked={config.showJpyPrice}
						onChange={checked => update({ showJpyPrice: checked })}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.metamask.networkCardTitle')}>
				<Alert
					message={t('admin.config.metamask.networkAlertTitle')}
					description={t('admin.config.metamask.networkAlertBody')}
					type="info"
					showIcon
					style={{ marginBottom: 16 }}
				/>
				<FormField
					label={t('admin.config.metamask.defaultNetworkLabel')}
					description={t('admin.config.metamask.defaultNetworkDescription')}
				>
					<Select
						value={config.networkId}
						onChange={handleNetworkChange}
						style={{ width: '100%', marginTop: 8 }}
						options={NETWORK_PRESETS.map(n => ({
							value: n.id,
							label: `${n.name} (${n.currency})`,
						}))}
					/>
				</FormField>
			</SettingsCard>

			<SettingsCard title={t('admin.config.metamask.currencyCardTitle')}>
				<Space direction="vertical" style={{ width: '100%' }} size="large">
					<FormField
						label={t('admin.config.metamask.receiveCurrencyLabel')}
						description={t('admin.config.metamask.receiveCurrencyDescription')}
					>
						<Select
							value={config.useCustomToken ? config.tokenSymbol : 'native'}
							onChange={handleTokenChange}
							style={{ width: '100%', marginTop: 8 }}
							options={getAvailableTokens()}
						/>
					</FormField>

					{config.useCustomToken && (
						<>
							<FormField
								label={t('admin.config.metamask.tokenAddressLabel')}
								description={t('admin.config.metamask.tokenAddressAutoSet')}
							>
								<Input
									value={config.tokenAddress}
									onChange={e => update({ tokenAddress: e.target.value })}
									placeholder="0x..."
									style={{ fontFamily: 'monospace' }}
									disabled
								/>
							</FormField>

							<FormField label={t('admin.config.metamask.tokenDecimalsLabel')}>
								<InputNumber
									value={config.tokenDecimals}
									onChange={val => update({ tokenDecimals: val || 18 })}
									min={0}
									max={18}
									disabled
								/>
							</FormField>
						</>
					)}

					<Divider />

					<Descriptions
						title={t('admin.config.metamask.currentSettingsLabel')}
						size="small"
						column={1}
						items={[
							{
								key: 'network',
								label: t('admin.config.metamask.currentNetworkLabel'),
								children: config.networkName,
							},
							{
								key: 'currency',
								label: t('admin.config.metamask.currentCurrencyLabel'),
								children: config.useCustomToken ? config.tokenSymbol : config.chainCurrency,
							},
							{
								key: 'priceId',
								label: t('admin.config.metamask.currentPriceIdLabel'),
								children: config.coinGeckoId,
							},
						]}
					/>
				</Space>
			</SettingsCard>

			<SettingsCard title={t('admin.config.metamask.walletCardTitle')}>
				<FormField
					label={t('admin.config.metamask.evmAddressLabel')}
					description={t('admin.config.metamask.evmAddressDescription')}
					error={
						config.walletAddress && !isValidEvmAddress(config.walletAddress)
							? t('admin.config.metamask.evmAddressInvalid')
							: undefined
					}
				>
					<Input
						value={config.walletAddress}
						onChange={e => update({ walletAddress: e.target.value })}
						placeholder="0x..."
						style={{ marginTop: 8, fontFamily: 'monospace' }}
					/>
				</FormField>

				<Divider />

				<FormField
					label={t('admin.config.metamask.btcAddressLabel')}
					description={t('admin.config.metamask.btcAddressDescription')}
					error={
						config.bitcoinAddress && !isValidBitcoinAddress(config.bitcoinAddress)
							? t('admin.config.metamask.btcAddressInvalid')
							: undefined
					}
				>
					<Input
						value={config.bitcoinAddress || ''}
						onChange={e => update({ bitcoinAddress: e.target.value })}
						placeholder="bc1q..."
						style={{ marginTop: 8, fontFamily: 'monospace' }}
					/>
				</FormField>

				<FormField
					label={t('admin.config.metamask.solAddressLabel')}
					description={t('admin.config.metamask.solAddressDescription')}
					error={
						config.solanaAddress && !isValidSolanaAddress(config.solanaAddress)
							? t('admin.config.metamask.solAddressInvalid')
							: undefined
					}
				>
					<Input
						value={config.solanaAddress || ''}
						onChange={e => update({ solanaAddress: e.target.value })}
						placeholder="9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
						style={{ marginTop: 8, fontFamily: 'monospace' }}
					/>
				</FormField>

				<Alert
					message={t('admin.config.metamask.testAlertTitle')}
					description={<span>{t('admin.config.metamask.testAlertBody')}</span>}
					type="warning"
					showIcon
					style={{ marginTop: 16 }}
				/>
			</SettingsCard>

			<FormFooter onSave={save} saving={saving} />
		</div>
	);
};

MetamaskConfigPage.getLayout = function getLayout(page: ReactElement) {
	return <AdminLayout page={page} />;
};

export default MetamaskConfigPage;
