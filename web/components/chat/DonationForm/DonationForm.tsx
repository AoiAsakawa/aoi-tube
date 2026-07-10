import React, { FC, useState, useEffect, FormEvent } from 'react';
import {
	Button,
	InputNumber,
	Input,
	Checkbox,
	Modal,
	message,
	Radio,
	Segmented,
	Spin,
	Tooltip,
	Select,
	Alert,
	Steps,
} from 'antd';
import {
	GiftOutlined,
	PlayCircleOutlined,
	QrcodeOutlined,
	WalletOutlined,
	SwapOutlined,
	InfoCircleOutlined,
	LoadingOutlined,
	CheckCircleOutlined,
	LinkOutlined,
	DollarCircleOutlined,
	GoldOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import cn from 'classnames';
import {
	fetchData,
	METAMASK_CONFIRM,
	WALLET,
	WALLET_SPEND,
	withArchiveAccessToken,
} from '../../../utils/apis';
import {
	getEffectPrice,
	SCREEN_EFFECT_EMOJIS,
	SCREEN_EFFECT_TYPES,
	ScreenEffectType,
} from '../../../interfaces/donation.model';
import { useEnqueueScreenEffect } from '../../stores/zustand-store';
import { cryptoAmountForFiat, decimalToBigInt } from './cryptoAmount';
import {
	AVAILABLE_NETWORKS,
	EFFECT_CRYPTO_MARGIN_PERCENT,
	getFiatSymbol,
	PRESET_AMOUNTS_ALTCOIN,
	PRESET_AMOUNTS_BNB,
	PRESET_AMOUNTS_BTC,
	PRESET_AMOUNTS_CRYPTO,
	PRESET_AMOUNTS_ETH,
	PRESET_AMOUNTS_JPY_TIERS,
	PRESET_AMOUNTS_STABLECOIN,
	PRESET_AMOUNTS_VBC,
} from './constants';
import {
	DonationItemType,
	MetamaskConfig,
	PayPalConfig,
	PurchaseItem,
	StripeConfig,
} from './types';
import { getWalletName, isTrustWalletConnected } from './walletUtils';
import { useCryptoPrices } from './hooks/useCryptoPrices';
import { useBitcoinWallet } from './hooks/useBitcoinWallet';
import { useSolanaWallet } from './hooks/useSolanaWallet';
import { useEvmWallet } from './hooks/useEvmWallet';
import { useFiatPayments } from './hooks/useFiatPayments';
import styles from './DonationForm.module.scss';

const { TextArea } = Input;

export interface DonationFormProps {
	visible: boolean;
	onClose: () => void;
	defaultDisplayName?: string;
	onSuccess?: () => void;
	paypayEnabled?: boolean;
	metamaskEnabled?: boolean;
	doneruEnabled?: boolean;
	kofiEnabled?: boolean;
	paypalEnabled?: boolean;
	paypalConfig?: PayPalConfig | null;
	stripeEnabled?: boolean;
	stripeConfig?: StripeConfig | null;
	coinEnabled?: boolean;
	coinBonusPercent?: number;
}

export const DonationForm: FC<DonationFormProps> = ({
	visible,
	onClose,
	defaultDisplayName = '',
	onSuccess: _onSuccess,
	paypayEnabled = false,
	metamaskEnabled = false,
	doneruEnabled = false,
	kofiEnabled = false,
	paypalEnabled = false,
	paypalConfig: paypalConfigProp = null,
	stripeEnabled = false,
	stripeConfig: stripeConfigProp = null,
	coinEnabled = false,
	coinBonusPercent = 0,
}) => {
	const { t } = useTranslation();
	const [paymentMethod, setPaymentMethod] = useState<
		'paypay' | 'metamask' | 'doneru' | 'kofi' | 'paypal' | 'stripe'
	>('paypay');
	const [amount, setAmount] = useState<number>(500);
	// Crypto amounts are kept as decimal strings: 18-decimal (wei) values overflow
	// the 2^53 float precision, so conversion to smallest units uses BigInt.
	const [cryptoAmount, setCryptoAmount] = useState<string>('0.01');
	const [jpyAmount, setJpyAmount] = useState<number>(1000);
	const [inputMode, setInputMode] = useState<'crypto' | 'jpy'>('crypto');
	const [donationMessage, setDonationMessage] = useState<string>('');
	const [displayName, setDisplayName] = useState<string>(defaultDisplayName);
	const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

	// What the viewer purchases: a superchat message or a screen effect.
	const [itemType, setItemType] = useState<DonationItemType>('superchat');
	const [effectType, setEffectType] = useState<ScreenEffectType>('confetti');

	// Payment mode: "direct" pays a provider per purchase (the classic flow);
	// "coin" tops up the prepaid wallet. Coins need a logged-in account, so the
	// mode is only offered once the wallet fetch confirms the viewer is signed in.
	const [payMode, setPayMode] = useState<'direct' | 'coin'>('direct');
	// Within coin mode: spend the balance on this purchase, or top the balance up.
	const [coinAction, setCoinAction] = useState<'spend' | 'charge'>('spend');
	const [walletBalance, setWalletBalance] = useState<number | null>(null);
	const [walletLedger, setWalletLedger] = useState<
		{ id: string; delta: number; entryType: string; createdAt: string }[]
	>([]);
	const [walletLoggedIn, setWalletLoggedIn] = useState(false);
	const refreshWallet = React.useCallback(() => {
		if (!coinEnabled) {
			return;
		}
		const token =
			typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;
		if (!token) {
			setWalletLoggedIn(false);
			return;
		}
		fetchData(withArchiveAccessToken(WALLET, token), { auth: false })
			.then(res => {
				setWalletBalance(Number(res?.balance) || 0);
				setWalletLedger(Array.isArray(res?.ledger) ? res.ledger : []);
				setWalletLoggedIn(true);
			})
			.catch(() => setWalletLoggedIn(false));
	}, [coinEnabled]);
	useEffect(() => {
		if (visible) {
			refreshWallet();
		}
	}, [visible, refreshWallet]);
	// Coins charge only through Stripe / PayPal; snap the method to a valid one
	// whenever coin mode is active with a different provider selected.
	// Coin top-ups route only through the unified fiat providers (Stripe / PayPal).
	const coinChargeProvider = stripeEnabled || paypalEnabled;
	// Coins can be spent even without a fiat provider; a charge needs Stripe/PayPal.
	const canUseCoins = coinEnabled && walletLoggedIn;
	const coinMode = payMode === 'coin' && canUseCoins;
	// Charging requires a fiat provider; fall back to spend-only when there's none.
	const coinCharge = coinMode && coinAction === 'charge' && coinChargeProvider;
	const coinSpend = coinMode && !coinCharge;
	// A coin charge routes only through Stripe / PayPal; snap the method to a
	// valid one whenever a charge is active with a different provider selected.
	useEffect(() => {
		if (
			coinCharge &&
			(stripeEnabled || paypalEnabled) &&
			paymentMethod !== 'stripe' &&
			paymentMethod !== 'paypal'
		) {
			setPaymentMethod(stripeEnabled ? 'stripe' : 'paypal');
		}
	}, [coinCharge, paymentMethod, stripeEnabled, paypalEnabled]);

	// Local, purchase-free preview: enqueue the effect into the shared screen
	// effect queue so the real animation plays full-screen for this viewer only.
	// The donation modal (z-index 1000) sits above the effect overlay (950), so
	// we briefly hide the modal while the preview plays, then restore it with
	// the viewer's selections intact (the component stays mounted).
	const enqueueScreenEffect = useEnqueueScreenEffect();
	const [previewHidden, setPreviewHidden] = useState(false);
	// Keep in sync with EFFECT_DURATION_MS in ScreenEffects.tsx (5500ms).
	const EFFECT_PREVIEW_MS = 5500;
	const handlePreviewEffect = (effect: ScreenEffectType) => {
		setPreviewHidden(true);
		enqueueScreenEffect({
			id: `preview-${effect}-${Date.now()}`,
			effectType: effect,
			displayName: t('donation.previewLabel'),
			isAnonymous: false,
			isPreview: true,
		});
		window.setTimeout(() => setPreviewHidden(false), EFFECT_PREVIEW_MS);
	};

	// Doneru / Ko-fi are external services: purchases through them are always
	// plain superchats and the item type selector does not apply to them.
	// (Ko-fi effects instead use message commands, hinted at in its panel.)
	const isExternalProvider = paymentMethod === 'doneru' || paymentMethod === 'kofi';
	// A coin top-up is a plain amount charge (no effect); effects are still
	// selectable when spending coins on a purchase.
	const isEffectPurchase = !coinCharge && itemType === 'effect' && !isExternalProvider;

	// Screen effects can be bought through the fiat providers (fixed price) or
	// with crypto (the server verifies the on-chain amount against the JPY
	// price), so the item type selector needs at least one such provider.
	const hasEffectProvider = paypayEnabled || paypalEnabled || stripeEnabled || metamaskEnabled;

	// Purchase descriptor sent with payment creation requests. Superchats and
	// coin top-ups never send an effectType.
	const purchaseItem: PurchaseItem = coinCharge
		? { itemType: 'coin' }
		: isEffectPurchase
			? { itemType: 'effect', effectType }
			: { itemType: 'superchat' };

	// Metamask specific state
	const [metamaskConfig, setMetamaskConfig] = useState<MetamaskConfig | null>(null);

	// Crypto price state and fetching (retry + local cache). The price is quoted
	// in the server's base currency (priceCurrency), which crypto purchases are
	// converted to and verified against.
	const { cryptoPrice, setCryptoPrice, priceCurrency, isPriceLoading, priceError, fetchCryptoPrice } =
		useCryptoPrices();

	// Bitcoin wallet state and actions (btcsnap connection, balance, PSBT send)
	const {
		showBitcoinModal,
		setShowBitcoinModal,
		bitcoinSendStep,
		setBitcoinSendStep,
		bitcoinSendError,
		setBitcoinSendError,
		bitcoinAddress,
		setBitcoinAddress,
		setBitcoinXpub,
		setBitcoinMfp,
		bitcoinBalance,
		setBitcoinBalance,
		bitcoinFee,
		setBitcoinFee,
		isLoadingBtcBalance,
		connectBitcoin,
		fetchBitcoinBalance,
		sendBitcoinTransaction,
	} = useBitcoinWallet({ metamaskConfig, cryptoAmount });

	// Solana wallet state and actions (Phantom / Trust Wallet / Snap, balance, send)
	const {
		solanaAddress,
		setSolanaAddress,
		solanaBalance,
		setSolanaBalance,
		isLoadingSolBalance,
		connectSolana,
		fetchSolanaBalance,
		sendSolanaTransaction,
	} = useSolanaWallet({ metamaskConfig, cryptoAmount });

	// EVM wallet state and actions (connection, network/token selection, balances, send)
	const {
		walletConnected,
		walletAddress,
		isConnecting,
		setIsConnecting,
		selectedNetwork,
		setSelectedNetwork,
		selectedToken,
		setSelectedToken,
		setAvailableTokens,
		isLoadingBalances,
		showOnlyWithBalance,
		setShowOnlyWithBalance,
		currentChainId,
		connectWallet,
		switchNetwork,
		handleNetworkChange,
		getDisplayTokens,
		handleTokenChange,
		sendEvmTransaction,
	} = useEvmWallet({
		visible,
		paymentMethod,
		metamaskConfig,
		cryptoAmount,
		setCryptoAmount,
		setInputMode,
		setCryptoPrice,
		fetchCryptoPrice,
		bitcoinBalance,
		bitcoinAddress,
		solanaBalance,
		solanaAddress,
	});

	// Fiat payment provider configs and payment flows (PayPal / Stripe / PayPay)
	const {
		paypalConfig,
		stripeConfig,
		doneruConfig,
		kofiConfig,
		tokushohoEnabled,
		handlePayPalPayment,
		handleStripePayment,
		handlePayPayPayment,
	} = useFiatPayments({
		visible,
		onClose,
		paypayEnabled,
		metamaskEnabled,
		doneruEnabled,
		kofiEnabled,
		paypalEnabled,
		paypalConfigProp,
		stripeEnabled,
		stripeConfigProp,
		amount,
		donationMessage,
		displayName,
		isAnonymous,
		purchaseItem,
		setAmount,
		setDonationMessage,
		setIsSubmitting,
		setMetamaskConfig,
		selectedNetwork,
		setSelectedNetwork,
		setAvailableTokens,
		setSelectedToken,
		fetchCryptoPrice,
	});

	// Update display name when defaultDisplayName changes (e.g., user logs in)
	useEffect(() => {
		if (defaultDisplayName && !displayName) {
			setDisplayName(defaultDisplayName);
		}
	}, [defaultDisplayName]);

	// Set default payment method based on what's enabled
	useEffect(() => {
		if (paypayEnabled) {
			setPaymentMethod('paypay');
		} else if (paypalEnabled) {
			setPaymentMethod('paypal');
		} else if (stripeEnabled) {
			setPaymentMethod('stripe');
		} else if (metamaskEnabled) {
			setPaymentMethod('metamask');
		} else if (kofiEnabled) {
			setPaymentMethod('kofi');
		} else if (doneruEnabled) {
			setPaymentMethod('doneru');
		}
	}, [paypayEnabled, paypalEnabled, stripeEnabled, metamaskEnabled, kofiEnabled, doneruEnabled]);

	// Currency that screen effect prices are charged in for the selected
	// payment method: PayPay always charges JPY; PayPal / Stripe use their
	// configured currency; crypto purchases are verified by the server against
	// the base-currency price. Must match the server-enforced price lookup.
	const effectPriceCurrency = coinSpend
		? 'JPY' // coins are base-currency minor units; effects shown at JPY price
		: paymentMethod === 'paypay'
			? 'JPY'
			: paymentMethod === 'metamask'
				? priceCurrency
				: paymentMethod === 'paypal'
					? paypalConfig?.currencyCode || 'USD'
					: stripeConfig?.currencyCode || 'JPY';

	// Fixed price label for a screen effect, e.g. "¥200" or "$2".
	const formatEffectPrice = (effect: ScreenEffectType): string =>
		`${getFiatSymbol(effectPriceCurrency)}${getEffectPrice(effect, effectPriceCurrency).toLocaleString()}`;

	// --- Screen effects paid in crypto ---
	// The server confirms an effect purchase when the on-chain amount converts
	// to at least 95% of the effect's base-currency price, so the form quotes
	// that price at the current token rate plus a +2% market-movement margin
	// (EFFECT_CRYPTO_MARGIN_PERCENT).
	const isEffectCrypto = isEffectPurchase && paymentMethod === 'metamask' && !coinSpend;

	// Tokens without a price feed (VBCG, ...) cannot be converted to fiat, so
	// they cannot buy fixed-fiat-price effects.
	const effectTokenSupported = !!selectedToken?.coinGeckoId;

	// Token amount (decimal string) needed for one effect at the current rate,
	// or '' while the rate is unknown. Quoted against the base-currency price
	// so it matches the server's verification currency.
	const effectCryptoAmountFor = (effect: ScreenEffectType): string =>
		cryptoAmountForFiat(
			getEffectPrice(effect, priceCurrency),
			cryptoPrice,
			selectedToken?.decimals ?? 8,
			EFFECT_CRYPTO_MARGIN_PERCENT,
		);

	const effectCryptoAmount =
		isEffectCrypto && effectTokenSupported ? effectCryptoAmountFor(effectType) : '';

	// Effects can only be picked/sent with crypto once a rate is available.
	const effectPriceReady = !isEffectCrypto || (effectTokenSupported && !!effectCryptoAmount);

	// Keep the shared cryptoAmount state (used by every send path and the
	// Bitcoin modal) in sync with the computed effect amount while an effect
	// is being bought with crypto.
	useEffect(() => {
		if (isEffectCrypto && effectCryptoAmount) {
			setCryptoAmount(effectCryptoAmount);
		}
	}, [isEffectCrypto, effectCryptoAmount]);

	// When an effect purchase is active and the selected token has no price
	// feed, hop to the first token on the network that has one.
	useEffect(() => {
		if (!isEffectCrypto || !selectedToken || selectedToken.coinGeckoId) {
			return;
		}
		const eligible = getDisplayTokens().find(token => token.coinGeckoId);
		if (eligible) {
			handleTokenChange(eligible.symbol);
		}
	}, [isEffectCrypto, selectedToken]);

	// Coin cost of the current purchase, in coins (= base-currency minor units).
	// Effects are fixed-price; a superchat costs its amount. Assumes a
	// zero-decimal base currency (e.g. JPY, the default) for the preview; the
	// server recomputes the authoritative cost.
	const coinSpendCost = isEffectPurchase
		? getEffectPrice(effectType, 'JPY')
		: Math.max(0, Math.round(amount));
	const coinInsufficient = coinSpend && (walletBalance ?? 0) < coinSpendCost;

	// Coins credited by the current charge: the amount plus the configured bonus.
	// 1 coin = 1 base-currency minor unit (JPY assumed for the preview; the
	// server credits the authoritative amount).
	const chargeBaseCoins = Math.max(0, Math.round(amount));
	const chargeBonusCoins = Math.floor((chargeBaseCoins * coinBonusPercent) / 100);
	const chargeTotalCoins = chargeBaseCoins + chargeBonusCoins;

	// Pay for the current purchase from the coin balance (no external provider).
	const handleCoinSpend = async () => {
		if (coinInsufficient || coinSpendCost <= 0 || isSubmitting) {
			return;
		}
		setIsSubmitting(true);
		try {
			const token =
				typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;
			const res = await fetchData(withArchiveAccessToken(WALLET_SPEND, token), {
				method: 'POST',
				auth: false,
				data: {
					itemType: isEffectPurchase ? 'effect' : 'superchat',
					effectType: isEffectPurchase ? effectType : '',
					amount: isEffectPurchase ? 0 : amount,
					message: donationMessage,
					displayName: isAnonymous ? '' : displayName.trim(),
					isAnonymous,
				},
			});
			if (res?.success) {
				setWalletBalance(Number(res.balance) || 0);
				message.success(t('donation.coinPaidSuccess'));
				setDonationMessage('');
				onClose();
			} else {
				message.error(res?.message || t('donation.sendErrorOccurred'));
			}
		} catch {
			message.error(t('donation.sendErrorOccurred'));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSubmit = async (e?: FormEvent) => {
		e?.preventDefault();

		if (coinSpend) {
			await handleCoinSpend();
		} else if (paymentMethod === 'paypay') {
			await handlePayPayPayment();
		} else if (paymentMethod === 'metamask') {
			await handleMetamaskPayment();
		} else if (paymentMethod === 'paypal') {
			await handlePayPalPayment();
		} else if (paymentMethod === 'stripe') {
			await handleStripePayment();
		}
	};

	const handleMetamaskPayment = async () => {
		const isBtc = selectedNetwork?.chainType === 'bitcoin';
		const isSol = selectedNetwork?.chainType === 'solana';

		// Bitcoin requires Snap connection, Solana requires Snap connection, EVM requires wallet connection
		if (isBtc && !bitcoinAddress) {
			message.error(t('donation.connectMetamaskFirst'));
			return;
		}

		if (isSol && !solanaAddress) {
			message.error(t('donation.connectMetamaskFirst'));
			return;
		}

		if (!isBtc && !isSol && !walletConnected) {
			message.error(t('donation.connectWalletFirst'));
			return;
		}

		if (!metamaskConfig) {
			message.error(t('donation.metamaskConfigInvalid'));
			return;
		}

		// Check for Bitcoin address if Bitcoin is selected
		if (isBtc && !metamaskConfig.bitcoinAddress) {
			message.error(t('donation.bitcoinAddressNotConfigured'));
			return;
		}

		// Solana pays to its own base58 account, not the EVM wallet address.
		if (isSol && !metamaskConfig.solanaAddress) {
			message.error(t('donation.solanaAddressNotConfiguredAdmin'));
			return;
		}

		// Check for wallet address if EVM is selected
		if (!isBtc && !isSol && !metamaskConfig.walletAddress) {
			message.error(t('donation.recipientAddressNotConfigured'));
			return;
		}

		if (!selectedNetwork || !selectedToken) {
			message.error(t('donation.selectNetworkAndToken'));
			return;
		}

		// Effect purchases need a live JPY rate for the selected token: the
		// send amount is derived from it and the server rejects purchases it
		// cannot convert.
		if (isEffectPurchase && (!effectTokenSupported || !effectCryptoAmount)) {
			message.error(t('donation.effectPriceUnavailable'));
			return;
		}

		const cryptoAmountNum = parseFloat(cryptoAmount);
		if (!Number.isFinite(cryptoAmountNum) || cryptoAmountNum <= 0) {
			message.error(t('donation.enterAmount'));
			return;
		}

		if (!isAnonymous && !displayName.trim()) {
			message.error(t('donation.enterNameOrAnonymous'));
			return;
		}

		setIsSubmitting(true);

		try {
			let txHash: string;
			const tokenSymbol = selectedToken.symbol;

			// Handle Bitcoin (non-EVM) transactions
			if (isBtc) {
				txHash = await sendBitcoinTransaction();
			} else if (isSolana()) {
				// Handle Solana transactions
				txHash = await sendSolanaTransaction(selectedToken);
			} else {
				// Handle EVM transactions
				txHash = await sendEvmTransaction();
			}

			if (!txHash) {
				setIsSubmitting(false);
				return;
			}

			message.info(t('donation.sendingTransaction'));

			// Confirm donation on backend
			// Use correct address based on chain type
			const senderAddress = isBtc ? bitcoinAddress : walletAddress;

			const confirmResponse = await fetchData(METAMASK_CONFIRM, {
				method: 'POST',
				data: {
					transactionHash: txHash,
					amount: cryptoAmountNum,
					amountJpy: cryptoPrice > 0 ? Math.round(cryptoAmountNum * cryptoPrice) : 0,
					tokenSymbol,
					networkId: selectedNetwork.id,
					networkName: selectedNetwork.name,
					chainType: selectedNetwork.chainType || 'evm',
					fromAddress: senderAddress,
					// Screen effect purchases never carry a chat message.
					message: isEffectPurchase ? '' : donationMessage,
					displayName: isAnonymous ? '' : displayName.trim(),
					isAnonymous,
					...purchaseItem,
				},
				auth: false,
			});

			if (confirmResponse.success) {
				message.success(t('donation.donationSentThanks'));
				onClose();
				// Reset form
				setCryptoAmount('0.01');
				setDonationMessage('');
			} else {
				message.warning(t('donation.txSentButConfirmFailed'));
			}
		} catch (error: unknown) {
			console.error('Metamask error:', error);
			const errorWithCode = error as { code?: number };
			if (errorWithCode.code === 4001) {
				message.info(t('donation.transactionCancelled'));
			} else {
				message.error(t('donation.sendErrorOccurred'));
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	// Get current currency symbol
	const getCurrencySymbol = () => {
		if (selectedToken) return selectedToken.symbol;
		if (selectedNetwork) return selectedNetwork.currency;
		return 'ETH';
	};

	// Check if using stablecoin
	const isStablecoin = () => {
		if (!selectedToken) return false;
		return ['USDT', 'USDC', 'DAI'].includes(selectedToken.symbol);
	};

	// Check if current token is Bitcoin
	const isBitcoin = () => {
		return selectedNetwork?.chainType === 'bitcoin';
	};

	// Check if current token is Solana
	const isSolana = () => {
		return selectedNetwork?.chainType === 'solana';
	};

	// Check if current token is VirBiCoin (VBC, VBCG, VBCAT)
	const isVirBiCoin = () => {
		if (!selectedToken) return false;
		return ['VBC', 'VBCG', 'VBCAT'].includes(selectedToken.symbol);
	};

	// Check if current token is ETH (Ethereum, Arbitrum, Optimism, Base, Linea)
	const isEth = () => {
		if (!selectedToken) return false;
		return selectedToken.symbol === 'ETH';
	};

	// Check if current token uses altcoin presets (1, 5, 10, 50, 100)
	// SEI, JOE, PNG, ARB, MAGIC, POL, CAKE, OP
	const isAltcoin = () => {
		if (!selectedToken) return false;
		return ['SEI', 'JOE', 'PNG', 'ARB', 'MAGIC', 'POL', 'CAKE', 'OP'].includes(
			selectedToken.symbol,
		);
	};

	// Check if current token is BNB
	const isBnb = () => {
		if (!selectedToken) return false;
		return selectedToken.symbol === 'BNB';
	};

	// Convert JPY to crypto amount
	const jpyToCrypto = (jpy: number): number => {
		if (cryptoPrice <= 0) return 0;
		return jpy / cryptoPrice;
	};

	// Convert crypto to JPY (display only — float precision is acceptable here)
	const cryptoToJpy = (crypto: number | string): number => {
		const numValue = typeof crypto === 'string' ? parseFloat(crypto) || 0 : crypto;
		if (cryptoPrice <= 0) return 0;
		return numValue * cryptoPrice;
	};

	// Handle JPY amount change (convert to crypto)
	const handleJpyAmountChange = (jpy: number) => {
		setJpyAmount(jpy);
		if (cryptoPrice > 0) {
			setCryptoAmount((jpy / cryptoPrice).toFixed(8));
		}
	};

	// Handle crypto amount change (convert to JPY)
	const handleCryptoAmountChange = (crypto: string) => {
		setCryptoAmount(crypto);
		const numValue = parseFloat(crypto);
		if (cryptoPrice > 0 && Number.isFinite(numValue)) {
			setJpyAmount(Math.round(numValue * cryptoPrice));
		}
	};

	// Preset buttons compare against the numeric value of the current input
	const isPresetSelected = (preset: number) => parseFloat(cryptoAmount) === preset;

	// Pick the preset amounts that match the selected token
	const getCryptoPresets = (): number[] => {
		if (isStablecoin()) return PRESET_AMOUNTS_STABLECOIN;
		if (isBitcoin()) return PRESET_AMOUNTS_BTC;
		if (isVirBiCoin()) return PRESET_AMOUNTS_VBC;
		if (isEth()) return PRESET_AMOUNTS_ETH;
		if (isAltcoin()) return PRESET_AMOUNTS_ALTCOIN;
		if (isBnb()) return PRESET_AMOUNTS_BNB;
		return PRESET_AMOUNTS_CRYPTO; // AVAX, etc.
	};

	const formatAmountJPY = (val: number) => {
		return `¥${val.toLocaleString()}`;
	};

	// Formats a major-unit amount in the server's base currency (used for the
	// crypto→fiat conversion display). Zero-decimal currencies (JPY, KRW) show
	// no fractional part; others show two decimals.
	const formatBaseAmount = (val: number) => {
		const zeroDecimal = priceCurrency === 'JPY' || priceCurrency === 'KRW';
		const symbol = getFiatSymbol(priceCurrency);
		const formatted = zeroDecimal
			? Math.round(val).toLocaleString()
			: val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `${symbol}${formatted}`;
	};

	const formatAmountCrypto = (val: number | string) => {
		const numValue = typeof val === 'string' ? parseFloat(val) || 0 : val;
		const symbol = getCurrencySymbol();
		if (isStablecoin()) {
			return `${numValue.toFixed(2)} ${symbol}`;
		}
		if (isBitcoin()) {
			// Bitcoin uses 8 decimal places, but show up to 8 significant digits
			const formatted = numValue < 0.0001 ? numValue.toFixed(8) : numValue.toFixed(6);
			return `${parseFloat(formatted)} ${symbol}`;
		}
		// Other crypto: show up to 6 decimal places
		const formatted = numValue < 0.001 ? numValue.toFixed(6) : numValue.toFixed(4);
		return `${parseFloat(formatted)} ${symbol}`;
	};

	return (
		<Modal
			title={
				<span>
					<GiftOutlined /> {t('donation.sendDonation')}
				</span>
			}
			open={visible && !previewHidden}
			onCancel={onClose}
			footer={null}
			className={styles.donationModal}
			destroyOnClose
		>
			<form onSubmit={handleSubmit} className={styles.form}>
				{/* Payment mode: direct per-purchase billing vs. topping up the
				    prepaid coin wallet. Only shown once the wallet confirms the
				    viewer is signed in and a fiat charge provider is available. */}
				{canUseCoins && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.payModeLabel')}</label>
						<Segmented
							value={payMode}
							onChange={val => setPayMode(val as 'direct' | 'coin')}
							options={[
								{ label: t('donation.payModeDirect'), value: 'direct' },
								{ label: t('donation.payModeCoin'), value: 'coin' },
							]}
							block
						/>
					</div>
				)}

				{/* Coin balance banner + spend/charge switch. */}
				{coinMode && (
					<div className={styles.coinBanner}>
						<div className={styles.coinBalanceRow}>
							<span>{t('donation.coinBalance')}</span>
							<span className={styles.coinBalanceValue}>
								🪙 {(walletBalance ?? 0).toLocaleString()}
							</span>
						</div>
						{coinChargeProvider && (
							<Segmented
								value={coinAction}
								onChange={val => setCoinAction(val as 'spend' | 'charge')}
								options={[
									{ label: t('donation.coinActionSpend'), value: 'spend' },
									{ label: t('donation.coinActionCharge'), value: 'charge' },
								]}
								block
								style={{ marginTop: 8 }}
							/>
						)}
						{coinCharge && (
							<div className={styles.coinChargePreview}>
								<div className={styles.coinBalanceRow}>
									<span>{t('donation.coinCredited')}</span>
									<span className={styles.coinBalanceValue}>
										🪙 {chargeTotalCoins.toLocaleString()}
									</span>
								</div>
								{chargeBonusCoins > 0 && (
									<div className={styles.coinBonusNote}>
										{t('donation.coinCreditedBreakdown', {
											base: chargeBaseCoins.toLocaleString(),
											bonus: chargeBonusCoins.toLocaleString(),
											percent: coinBonusPercent,
										})}
									</div>
								)}
							</div>
						)}
						{walletLedger.length > 0 && (
							<div className={styles.coinLedger}>
								{walletLedger.slice(0, 5).map(e => (
									<div key={e.id} className={styles.coinLedgerRow}>
										<span>{t(`donation.coinLedger.${e.entryType}`, e.entryType)}</span>
										<span className={e.delta < 0 ? styles.coinLedgerSpend : styles.coinLedgerCredit}>
											{e.delta > 0 ? '+' : ''}
											{e.delta.toLocaleString()}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				)}

				{/* Item type selection: superchat or screen effect. External
				    services (Doneru / Ko-fi) only support plain superchats;
				    effects can be bought through fiat providers, crypto, or coins.
				    Hidden while topping up coins (a coin charge is a plain amount). */}
				{!coinCharge && (coinSpend || (!isExternalProvider && hasEffectProvider)) && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.itemTypeLabel')}</label>
						<div className={styles.itemTypeToggle}>
							<Segmented
								value={itemType}
								onChange={val => setItemType(val as DonationItemType)}
								options={[
									{ label: t('donation.itemTypeSuperchat'), value: 'superchat' },
									{ label: t('donation.itemTypeEffect'), value: 'effect' },
								]}
								block
							/>
						</div>
					</div>
				)}

				{/* Screen effect picker: fixed-price cards in the provider currency.
				    With crypto selected each card also shows the required token
				    amount at the current rate (picking is blocked until a rate
				    is available). */}
				{isEffectPurchase && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.effectTypeLabel')}</label>
						<div className={styles.effectPicker}>
							{SCREEN_EFFECT_TYPES.map(effect => (
								<div key={effect} className={styles.effectCardWrap}>
									<button
										type="button"
										aria-pressed={effectType === effect}
										disabled={!effectPriceReady}
										onClick={() => setEffectType(effect)}
										className={cn(styles.effectCard, {
											[styles.effectCardSelected]: effectType === effect,
											[styles.effectCardDisabled]: !effectPriceReady,
										})}
									>
										<span className={styles.effectEmoji}>{SCREEN_EFFECT_EMOJIS[effect]}</span>
										<span className={styles.effectName}>{t(`screenEffects.${effect}`)}</span>
										<span className={styles.effectPrice}>{formatEffectPrice(effect)}</span>
										{isEffectCrypto && effectTokenSupported && cryptoPrice > 0 && (
											<span className={styles.effectCryptoAmount}>
												≈ {effectCryptoAmountFor(effect)} {getCurrencySymbol()}
											</span>
										)}
									</button>
									<button
										type="button"
										className={styles.effectPreviewBtn}
										onClick={() => handlePreviewEffect(effect)}
										title={t('donation.previewEffect')}
										aria-label={t('donation.previewEffect')}
									>
										<PlayCircleOutlined />
									</button>
								</div>
							))}
						</div>
						{isEffectCrypto && !effectPriceReady && (
							<div className={styles.effectCryptoNote}>
								{isPriceLoading || (!priceError && effectTokenSupported) ? (
									<>
										<Spin size="small" style={{ marginRight: 8 }} />
										{t('donation.effectPriceLoading')}
									</>
								) : (
									<span style={{ color: '#faad14' }}>
										<InfoCircleOutlined style={{ marginRight: 4 }} />
										{t('donation.effectPriceUnavailable')}
									</span>
								)}
							</div>
						)}
						{isEffectCrypto && (
							<div className={styles.effectCryptoNote}>
								<InfoCircleOutlined style={{ marginRight: 4 }} />
								{t('donation.effectCryptoRateNote')}
							</div>
						)}
					</div>
				)}

				{/* Coin-spend superchat amount (paid from balance, no provider). */}
				{coinSpend && !isEffectPurchase && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.amount')}</label>
						<div className={styles.presetAmounts}>
							{PRESET_AMOUNTS_JPY_TIERS.map(preset => (
								<Button
									key={preset}
									type={amount === preset ? 'primary' : 'default'}
									onClick={() => setAmount(preset)}
									className={styles.presetButton}
								>
									🪙 {preset.toLocaleString()}
								</Button>
							))}
						</div>
						<div className={styles.customAmount}>
							<InputNumber
								value={amount}
								onChange={val => setAmount(val || 0)}
								min={1}
								max={1000000}
								className={styles.amountInput}
								addonBefore={<span style={{ color: '#e2e8f0' }}>🪙</span>}
							/>
						</div>
					</div>
				)}

				{/* Coin-spend cost / insufficient balance summary. */}
				{coinSpend && (
					<div className={styles.section}>
						<div className={styles.coinBalanceRow}>
							<span>{t('donation.coinCost')}</span>
							<span className={styles.coinBalanceValue}>🪙 {coinSpendCost.toLocaleString()}</span>
						</div>
						{coinInsufficient && (
							<div className={styles.effectCryptoNote} style={{ color: '#faad14' }}>
								<InfoCircleOutlined style={{ marginRight: 4 }} />
								{t('donation.coinInsufficient')}
							</div>
						)}
					</div>
				)}

				{/* Payment method selection (hidden when paying from the coin balance). */}
				{!coinSpend &&
					(paypayEnabled ||
						metamaskEnabled ||
						(doneruEnabled && doneruConfig) ||
						(kofiEnabled && kofiConfig) ||
						paypalEnabled ||
						stripeEnabled) && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.paymentMethod')}</label>
						<Radio.Group
							value={paymentMethod}
							onChange={e => setPaymentMethod(e.target.value)}
							className={styles.paymentMethodGroup}
						>
							{!coinMode && paypayEnabled && (
								<Radio.Button value="paypay">
									<QrcodeOutlined /> PayPay
								</Radio.Button>
							)}
							{paypalEnabled && (
								<Radio.Button value="paypal">
									<DollarCircleOutlined /> PayPal
								</Radio.Button>
							)}
							{stripeEnabled && (
								<Radio.Button value="stripe">
									<DollarCircleOutlined /> Stripe
								</Radio.Button>
							)}
							{!coinMode && metamaskEnabled && (
								<Radio.Button value="metamask">
									<GoldOutlined /> {t('donation.crypto')}
								</Radio.Button>
							)}
							{!coinMode && kofiEnabled && kofiConfig && (
								<Radio.Button value="kofi">
									<GiftOutlined /> {kofiConfig.displayName || 'Ko-fi'}
								</Radio.Button>
							)}
							{!coinMode && doneruEnabled && doneruConfig && (
								<Radio.Button value="doneru">
									<LinkOutlined /> {doneruConfig.displayName || 'Doneru'}
								</Radio.Button>
							)}
						</Radio.Group>
					</div>
				)}

				{/* Ko-fi external link */}
				{kofiEnabled && kofiConfig && paymentMethod === 'kofi' && (
					<div className={styles.section}>
						<Alert
							message={t('donation.donateVia', { name: 'Ko-fi' })}
							description={t('donation.kofiDescription')}
							type="info"
							showIcon
							style={{
								marginBottom: 16,
								background: '#1a1d24',
								border: '1px solid #3b82f6',
								color: '#e2e8f0',
							}}
						/>
						{/* Effects on Ko-fi work via message commands parsed server-side.
						    The full list shows each command with its localised name and
						    price so viewers know exactly what to type in any UI language. */}
						<div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
							<div style={{ marginBottom: 8 }}>
								<InfoCircleOutlined style={{ marginRight: 4 }} />
								{t('donation.kofiEffectCommandHint')}
							</div>
							<div style={{ display: 'grid', gap: 4 }}>
								{SCREEN_EFFECT_TYPES.map(effect => (
									<div
										key={effect}
										style={{ display: 'flex', alignItems: 'center', gap: 8 }}
									>
										<span style={{ fontSize: 16 }}>{SCREEN_EFFECT_EMOJIS[effect]}</span>
										<code
											style={{
												background: 'rgba(255,255,255,0.1)',
												padding: '1px 6px',
												borderRadius: 4,
												color: '#e2e8f0',
												fontFamily: 'monospace',
											}}
										>
											!{effect}
										</code>
										<span style={{ flex: 1 }}>{t(`screenEffects.${effect}`)}</span>
										<span style={{ color: '#facc15', fontWeight: 600 }}>
											{formatEffectPrice(effect)}
										</span>
									</div>
								))}
							</div>
						</div>
						<Button
							type="primary"
							size="large"
							icon={<GiftOutlined />}
							block
							onClick={() => {
								window.open(kofiConfig.pageUrl, '_blank');
								message.info(t('donation.pageOpenedInNewTab', { name: 'Ko-fi' }));
							}}
							style={{
								background: '#FF5E5B',
								borderColor: '#FF5E5B',
							}}
						>
							{t('donation.donateWith', { name: kofiConfig.displayName || 'Ko-fi' })}
						</Button>
					</div>
				)}

				{/* Doneru external link */}
				{doneruEnabled && doneruConfig && paymentMethod === 'doneru' && (
					<div className={styles.section}>
						<Alert
							message={t('donation.donateVia', { name: 'Doneru' })}
							description={t('donation.doneruDescription')}
							type="info"
							showIcon
							style={{
								marginBottom: 16,
								background: '#1a1d24',
								border: '1px solid #3b82f6',
								color: '#e2e8f0',
							}}
						/>
						<Button
							type="primary"
							size="large"
							icon={<LinkOutlined />}
							block
							onClick={() => {
								window.open(doneruConfig.creatorUrl, '_blank');
								message.info(t('donation.pageOpenedInNewTab', { name: 'Doneru' }));
							}}
						>
							{t('donation.donateWith', { name: doneruConfig.displayName || 'Doneru' })}
						</Button>
					</div>
				)}

				{/* Metamask wallet connection */}
				{metamaskEnabled && paymentMethod === 'metamask' && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.wallet')}</label>
						{isSolana() ? (
							// Solana: Connect via Phantom, Trust Wallet, or MetaMask Snap
							<>
								{!solanaAddress ? (
									<>
										<Button
											onClick={async () => {
												setIsConnecting(true);
												try {
													const addr = await connectSolana();
													setSolanaAddress(addr);
													const walletType = window.solana?.isPhantom
														? 'Phantom'
														: isTrustWalletConnected()
															? 'Trust Wallet'
															: t('donation.solanaWallet');
													message.success(t('donation.connectedToWallet', { wallet: walletType }));
												} catch (error) {
													const msg =
														error instanceof Error ? error.message : t('donation.errorOccurred');
													message.error(msg);
												} finally {
													setIsConnecting(false);
												}
											}}
											loading={isConnecting}
											icon={<WalletOutlined />}
											block
										>
											{t('donation.connectSolanaWallet')}
										</Button>
										<div
											style={{
												fontSize: 11,
												color: '#94a3b8',
												marginTop: 4,
												textAlign: 'center',
											}}
										>
											{window.solana?.isPhantom
												? t('donation.phantomDetected')
												: window.solana
													? t('donation.solanaWalletDetected')
													: t('donation.phantomRecommended')}
										</div>
									</>
								) : (
									<div
										style={{
											background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
											color: 'white',
											padding: '12px 16px',
											borderRadius: 8,
											marginBottom: 8,
										}}
									>
										<div style={{ fontSize: 12, opacity: 0.9 }}>
											{t('donation.connectedWith', { wallet: 'Solana' })}
										</div>
										<div style={{ fontFamily: 'monospace', fontSize: 14, marginTop: 4 }}>
											{solanaAddress.substring(0, 12)}...
											{solanaAddress.substring(solanaAddress.length - 8)}
										</div>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												marginTop: 8,
												paddingTop: 8,
												borderTop: '1px solid rgba(255,255,255,0.2)',
											}}
										>
											<span style={{ fontSize: 12, opacity: 0.9 }}>
												{t('donation.balanceLabel')}
											</span>
											{isLoadingSolBalance ? (
												<span style={{ fontSize: 14 }}>{t('donation.loading')}</span>
											) : solanaBalance !== null ? (
												<span style={{ fontSize: 14, fontWeight: 'bold' }}>
													{(solanaBalance / 1e9).toFixed(6)} SOL
												</span>
											) : (
												<Button
													size="small"
													ghost
													onClick={() => fetchSolanaBalance(solanaAddress)}
													style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
												>
													{t('donation.checkBalance')}
												</Button>
											)}
										</div>
										<div style={{ marginTop: 8, textAlign: 'right' }}>
											<Button
												size="small"
												ghost
												onClick={() => {
													setSolanaAddress('');
													setSolanaBalance(null);
												}}
												style={{
													color: 'white',
													borderColor: 'rgba(255,255,255,0.5)',
													fontSize: 11,
												}}
											>
												{t('donation.disconnect')}
											</Button>
										</div>
									</div>
								)}
							</>
						) : isBitcoin() ? (
							// Bitcoin: Connect via MetaMask Snap or Trust Wallet
							<>
								{!bitcoinAddress ? (
									<Button
										onClick={async () => {
											setIsConnecting(true);
											try {
												const addr = await connectBitcoin();
												setBitcoinAddress(addr);
												message.success(
													t('donation.connectedToWallet', { wallet: getWalletName() }),
												);
											} catch (error) {
												const msg =
													error instanceof Error ? error.message : t('donation.errorOccurred');
												message.error(msg);
											} finally {
												setIsConnecting(false);
											}
										}}
										loading={isConnecting}
										icon={<WalletOutlined />}
										block
									>
										{t('donation.connectWallet')}
									</Button>
								) : (
									<div
										style={{
											background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
											color: 'white',
											padding: '12px 16px',
											borderRadius: 8,
											marginBottom: 8,
										}}
									>
										<div style={{ fontSize: 12, opacity: 0.9 }}>
											{t('donation.connectedWith', { wallet: 'Native SegWit' })}
										</div>
										<div style={{ fontFamily: 'monospace', fontSize: 14, marginTop: 4 }}>
											{bitcoinAddress.substring(0, 12)}...
											{bitcoinAddress.substring(bitcoinAddress.length - 8)}
										</div>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												marginTop: 8,
												paddingTop: 8,
												borderTop: '1px solid rgba(255,255,255,0.2)',
											}}
										>
											<span style={{ fontSize: 12, opacity: 0.9 }}>
												{t('donation.balanceLabel')}
											</span>
											{isLoadingBtcBalance ? (
												<span style={{ fontSize: 14 }}>{t('donation.loading')}</span>
											) : bitcoinBalance !== null ? (
												<span style={{ fontSize: 14, fontWeight: 'bold' }}>
													{(bitcoinBalance / 100000000).toFixed(8)} BTC
												</span>
											) : (
												<Button
													size="small"
													ghost
													onClick={() => fetchBitcoinBalance(bitcoinAddress)}
													style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
												>
													{t('donation.checkBalance')}
												</Button>
											)}
										</div>
										<div style={{ marginTop: 8, textAlign: 'right' }}>
											<Button
												size="small"
												ghost
												onClick={() => {
													setBitcoinAddress('');
													setBitcoinBalance(null);
													setBitcoinXpub('');
													setBitcoinMfp('');
												}}
												style={{
													color: 'white',
													borderColor: 'rgba(255,255,255,0.5)',
													fontSize: 11,
												}}
											>
												{t('donation.disconnect')}
											</Button>
										</div>
									</div>
								)}
							</>
						) : (
							// EVM: Need wallet connection
							<>
								{!walletConnected ? (
									<Button
										onClick={connectWallet}
										loading={isConnecting}
										icon={<WalletOutlined />}
										block
									>
										{t('donation.connectWallet')}
									</Button>
								) : (
									<div
										style={{
											background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
											color: 'white',
											padding: '12px 16px',
											borderRadius: 8,
											marginBottom: 8,
										}}
									>
										<div style={{ fontSize: 12, opacity: 0.9 }}>
											{t('donation.connectedWith', { wallet: getWalletName() })}
										</div>
										<div style={{ fontFamily: 'monospace', fontSize: 14, marginTop: 4 }}>
											{walletAddress.substring(0, 10)}...
											{walletAddress.substring(walletAddress.length - 8)}
										</div>
										<div
											style={{
												display: 'flex',
												justifyContent: 'space-between',
												alignItems: 'center',
												marginTop: 8,
												paddingTop: 8,
												borderTop: '1px solid rgba(255,255,255,0.2)',
											}}
										>
											<span style={{ fontSize: 12, opacity: 0.9 }}>
												{t('donation.balanceLabel')}
											</span>
											{isLoadingBalances ? (
												<span style={{ fontSize: 14 }}>{t('donation.loading')}</span>
											) : selectedToken?.balance ? (
												<span style={{ fontSize: 14, fontWeight: 'bold' }}>
													{selectedToken.balance} {selectedToken.symbol}
												</span>
											) : (
												<span style={{ fontSize: 14 }}>--</span>
											)}
										</div>
										{currentChainId && selectedNetwork && currentChainId !== selectedNetwork.id && (
											<div style={{ marginTop: 8 }}>
												<Button
													size="small"
													ghost
													onClick={() => switchNetwork()}
													style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
												>
													{t('donation.switchToNetwork', { network: selectedNetwork.name })}
												</Button>
											</div>
										)}
									</div>
								)}
							</>
						)}
					</div>
				)}

				{/* Network and Token selection */}
				{metamaskEnabled && paymentMethod === 'metamask' && (
					<div className={styles.section}>
						<div className={styles.labelRow}>
							<label className={styles.label}>{t('donation.networkAndToken')}</label>
							{walletConnected && (
								<Checkbox
									checked={showOnlyWithBalance}
									onChange={e => setShowOnlyWithBalance(e.target.checked)}
									className={styles.balanceFilter}
								>
									{t('donation.withBalanceOnly')}
								</Checkbox>
							)}
						</div>
						<div className={styles.networkTokenSelectors}>
							<Select
								value={selectedNetwork?.id}
								onChange={handleNetworkChange}
								className={styles.networkSelect}
								popupClassName="donation-select-dropdown-dark"
								dropdownClassName="donation-select-dropdown-dark"
								dropdownStyle={{
									backgroundColor: '#2a2d38',
									border: '1px solid rgba(255,255,255,0.2)',
								}}
								style={{ backgroundColor: '#2a2d38' }}
								placeholder={t('donation.selectNetwork')}
								loading={isLoadingBalances}
							>
								{AVAILABLE_NETWORKS.map(network => (
									<Select.Option key={network.id} value={network.id}>
										{network.name} {currentChainId === network.id && '✓'}
									</Select.Option>
								))}
							</Select>
							<Select
								value={selectedToken?.symbol}
								onChange={handleTokenChange}
								className={styles.tokenSelect}
								popupClassName="donation-select-dropdown-dark"
								dropdownClassName="donation-select-dropdown-dark"
								dropdownStyle={{
									backgroundColor: '#2a2d38',
									border: '1px solid rgba(255,255,255,0.2)',
								}}
								style={{ backgroundColor: '#2a2d38' }}
								placeholder={t('donation.selectToken')}
								loading={isLoadingBalances}
							>
								{/* Effects need a JPY conversion, so tokens without a price
								    feed (VBC etc.) are hidden while buying an effect. */}
								{(isEffectCrypto
									? getDisplayTokens().filter(token => token.coinGeckoId)
									: getDisplayTokens()
								).map(token => (
									<Select.Option key={token.symbol} value={token.symbol}>
										<div className={styles.tokenOption}>
											<span>{token.symbol}</span>
											{token.balance && (
												<span className={styles.tokenBalance}>
													{parseFloat(token.balance) > 0 ? token.balance : '0'}
												</span>
											)}
										</div>
									</Select.Option>
								))}
							</Select>
						</div>
					</div>
				)}

				{/* PayPal amount selection (hidden for fixed-price effect purchases) */}
				{paypalEnabled && paymentMethod === 'paypal' && !isEffectPurchase && (
					<div className={styles.section}>
						<label className={styles.label}>
							{t('donation.amountWithCurrency', { currency: paypalConfig?.currencyCode || 'USD' })}
						</label>
						<div className={styles.presetAmounts}>
							{(paypalConfig?.currencyCode === 'JPY'
								? PRESET_AMOUNTS_JPY_TIERS
								: [5, 10, 25, 50, 100]
							).map(preset => (
								<Button
									key={preset}
									type={amount === preset ? 'primary' : 'default'}
									onClick={() => setAmount(preset)}
									className={styles.presetButton}
									style={{
										color: amount === preset ? '#ffffff' : '#e2e8f0',
										borderColor: amount === preset ? '#0070ba' : '#4a4d58',
										backgroundColor: amount === preset ? '#0070ba' : '#2a2d38',
									}}
								>
									{paypalConfig?.currencyCode === 'JPY'
										? formatAmountJPY(preset)
										: `${getFiatSymbol(paypalConfig?.currencyCode)}${preset}`}
								</Button>
							))}
						</div>
						<div className={styles.customAmount}>
							<InputNumber
								value={amount}
								onChange={val => setAmount(val || 0)}
								min={paypalConfig?.currencyCode === 'JPY' ? 300 : 3}
								max={1000000}
								className={styles.amountInput}
								addonBefore={
									<span style={{ color: '#e2e8f0' }}>
										{getFiatSymbol(paypalConfig?.currencyCode)}
									</span>
								}
							/>
						</div>
						{paypalConfig?.currencyCode === 'JPY' && (
							<div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
								{t('donation.paypalMinimumNote')}
							</div>
						)}
					</div>
				)}

				{/* Stripe amount selection (hidden for fixed-price effect purchases) */}
				{stripeEnabled && paymentMethod === 'stripe' && !isEffectPurchase && (
					<div className={styles.section}>
						<label className={styles.label}>
							{t('donation.amountWithCurrency', { currency: stripeConfig?.currencyCode || 'JPY' })}
						</label>
						<div className={styles.presetAmounts}>
							{(stripeConfig?.currencyCode === 'JPY'
								? PRESET_AMOUNTS_JPY_TIERS
								: [5, 10, 25, 50, 100]
							).map(preset => (
								<Button
									key={preset}
									type={amount === preset ? 'primary' : 'default'}
									onClick={() => setAmount(preset)}
									className={styles.presetButton}
									style={{
										color: amount === preset ? '#ffffff' : '#e2e8f0',
										borderColor: amount === preset ? '#635BFF' : '#4a4d58',
										backgroundColor: amount === preset ? '#635BFF' : '#2a2d38',
									}}
								>
									{stripeConfig?.currencyCode === 'JPY'
										? formatAmountJPY(preset)
										: `${getFiatSymbol(stripeConfig?.currencyCode || 'JPY')}${preset}`}
								</Button>
							))}
						</div>
						<div className={styles.customAmount}>
							<InputNumber
								value={amount}
								onChange={val => setAmount(val || 0)}
								min={stripeConfig?.currencyCode === 'JPY' ? 50 : 1}
								max={1000000}
								className={styles.amountInput}
								addonBefore={
									<span style={{ color: '#e2e8f0' }}>
										{getFiatSymbol(stripeConfig?.currencyCode || 'JPY')}
									</span>
								}
							/>
						</div>
						{stripeConfig?.isTestMode && (
							<div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
								{t('donation.stripeTestModeNote')}
							</div>
						)}
					</div>
				)}

				{/* Amount selection (hidden for fixed-price effect purchases) */}
				<div
					className={styles.section}
					style={{
						display:
							isEffectPurchase ||
							paymentMethod === 'paypal' ||
							paymentMethod === 'stripe' ||
							paymentMethod === 'doneru' ||
							paymentMethod === 'kofi'
								? 'none'
								: 'block',
					}}
				>
					<label className={styles.label}>{t('donation.amount')}</label>
					{paypayEnabled && paymentMethod === 'paypay' && (
						<>
							<div className={styles.presetAmounts}>
								{PRESET_AMOUNTS_JPY_TIERS.map(preset => (
									<Button
										key={preset}
										type={amount === preset ? 'primary' : 'default'}
										onClick={() => setAmount(preset)}
										className={styles.presetButton}
										style={{
											color: amount === preset ? '#ffffff' : '#e2e8f0',
											borderColor: amount === preset ? '#667eea' : '#4a4d58',
											backgroundColor: amount === preset ? '#667eea' : '#2a2d38',
										}}
									>
										{formatAmountJPY(preset)}
									</Button>
								))}
							</div>
							<div className={styles.customAmount}>
								<InputNumber
									value={amount}
									onChange={val => setAmount(val || 0)}
									min={1}
									max={1000000}
									className={styles.amountInput}
									addonBefore={<span style={{ color: '#e2e8f0' }}>¥</span>}
								/>
							</div>
						</>
					)}
					{metamaskEnabled && paymentMethod === 'metamask' && (
						<>
							{/* Input mode toggle for JPY/Crypto */}
							{cryptoPrice > 0 && !isStablecoin() && (
								<div className={styles.inputModeToggle}>
									<Segmented
										value={inputMode}
										onChange={val => setInputMode(val as 'crypto' | 'jpy')}
										options={[
											{
												label: t('donation.inputInCurrency', { currency: getCurrencySymbol() }),
												value: 'crypto',
											},
											{ label: t('donation.inputInJpy'), value: 'jpy' },
										]}
										block
									/>
								</div>
							)}

							{/* Preset amounts */}
							<div className={styles.presetAmounts}>
								{inputMode === 'jpy' && !isStablecoin()
									? // Base-currency tier presets (for both regular crypto and Bitcoin)
										PRESET_AMOUNTS_JPY_TIERS.map(preset => (
											<Button
												key={preset}
												type={jpyAmount === preset ? 'primary' : 'default'}
												onClick={() => handleJpyAmountChange(preset)}
												className={styles.presetButton}
												style={{
													color: jpyAmount === preset ? '#ffffff' : '#e2e8f0',
													borderColor: jpyAmount === preset ? '#667eea' : '#4a4d58',
													backgroundColor: jpyAmount === preset ? '#667eea' : '#2a2d38',
												}}
											>
												{formatBaseAmount(preset)}
											</Button>
										))
									: // Token-specific presets (stablecoin / BTC / VBC / ETH / altcoin / BNB / other)
										getCryptoPresets().map(preset => (
											<Button
												key={preset}
												type={isPresetSelected(preset) ? 'primary' : 'default'}
												onClick={() => handleCryptoAmountChange(String(preset))}
												className={styles.presetButton}
												style={{
													color: isPresetSelected(preset) ? '#ffffff' : '#e2e8f0',
													borderColor: isPresetSelected(preset) ? '#667eea' : '#4a4d58',
													backgroundColor: isPresetSelected(preset) ? '#667eea' : '#2a2d38',
												}}
											>
												{formatAmountCrypto(preset)}
											</Button>
										))}
							</div>

							{/* Custom amount input */}
							<div className={styles.customAmount}>
								{inputMode === 'jpy' && !isStablecoin() ? (
									<InputNumber
										value={jpyAmount}
										onChange={val => handleJpyAmountChange(val || 0)}
										min={1}
										max={10000000}
										className={styles.amountInput}
										addonBefore={
											<span style={{ color: '#e2e8f0' }}>{getFiatSymbol(priceCurrency)}</span>
										}
									/>
								) : (
									<InputNumber<string>
										value={cryptoAmount}
										onChange={val => {
											// stringMode passes the raw decimal string — keep it intact
											handleCryptoAmountChange(val == null ? '0' : String(val));
										}}
										min={isBitcoin() ? '0.00001' : isStablecoin() ? '0.01' : '0.000000000000000001'}
										max={isBitcoin() ? '10' : isStablecoin() ? '100000' : '1000000'}
										step={
											isBitcoin() ? '0.00001' : isStablecoin() ? '0.01' : '0.000000000000000001'
										}
										precision={isBitcoin() ? 8 : isStablecoin() ? 2 : 18}
										className={styles.amountInput}
										addonAfter={<span style={{ color: '#e2e8f0' }}>{getCurrencySymbol()}</span>}
										stringMode
										formatter={value => {
											// Strip unnecessary trailing zeros
											if (value === undefined || value === null) return '';
											const str = String(value);
											if (str === '') return '';
											// Only strip trailing zeros when there is a decimal point
											if (str.includes('.')) {
												return str.replace(/\.?0+$/, '');
											}
											return str;
										}}
									/>
								)}
								{/* Max balance button */}
								{selectedToken?.balance && parseFloat(selectedToken.balance) > 0 && (
									<Button
										size="small"
										type="link"
										onClick={async () => {
											let maxBalance = parseFloat(selectedToken.balance!);
											// For native tokens (ETH, BNB, VBC, etc.), subtract the gas cost
											const isNativeToken = !selectedToken.address || selectedToken.address === '';
											if (isNativeToken && selectedNetwork?.chainType === 'evm' && walletAddress) {
												try {
													// Estimate the gas cost automatically
													const gasPrice = (await window.ethereum?.request({
														method: 'eth_gasPrice',
													})) as string;
													const gasPriceWei = parseInt(gasPrice, 16);
													// Base gas amount for a transfer: 21000
													const gasLimit = 21000;
													// Convert the gas cost (wei) into native token units
													const gasCostWei = gasPriceWei * gasLimit;
													const gasCostNative = gasCostWei / 1e18;
													// Safety margin: 1.5x
													const safeGasCost = gasCostNative * 1.5;
													maxBalance = Math.max(0, maxBalance - safeGasCost);
												} catch (error) {
													console.error('Failed to estimate gas:', error);
													// Fallback: fixed value of 0.001
													maxBalance = Math.max(0, maxBalance - 0.001);
												}
											}
											if (maxBalance > 0) {
												handleCryptoAmountChange(maxBalance.toFixed(isBitcoin() ? 8 : 6));
											}
										}}
										style={{ marginLeft: 8, color: '#667eea', whiteSpace: 'nowrap' }}
									>
										{t('donation.max')}
									</Button>
								)}
							</div>

							{/* Price conversion display */}
							{(cryptoPrice > 0 || isPriceLoading || priceError) && (
								<div className={styles.priceConversion}>
									{isPriceLoading ? (
										<Spin size="small" />
									) : cryptoPrice > 0 ? (
										<>
											<SwapOutlined style={{ marginRight: 8 }} />
											{inputMode === 'jpy' && !isStablecoin() ? (
												<span>
													≈ {formatAmountCrypto(jpyToCrypto(jpyAmount))} (
													{formatBaseAmount(jpyAmount)})
												</span>
											) : (
												<span>
													{formatAmountCrypto(cryptoAmount)} ≈{' '}
													{formatBaseAmount(cryptoToJpy(cryptoAmount))}
												</span>
											)}
											<Tooltip
												title={`1 ${getCurrencySymbol()} = ${formatBaseAmount(cryptoPrice)}${priceError ? ` (${priceError})` : ''}`}
											>
												<InfoCircleOutlined
													style={{
														marginLeft: 8,
														color: priceError ? '#faad14' : 'rgba(255,255,255,0.75)',
													}}
												/>
											</Tooltip>
										</>
									) : priceError ? (
										<span style={{ color: '#faad14', fontSize: 12 }}>
											<InfoCircleOutlined style={{ marginRight: 4 }} />
											{priceError}
										</span>
									) : null}
								</div>
							)}
						</>
					)}
				</div>

				{paymentMethod !== 'doneru' && paymentMethod !== 'kofi' && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.displayName')}</label>
						<Input
							value={displayName}
							onChange={e => setDisplayName(e.target.value)}
							placeholder={t('donation.yourName')}
							disabled={isAnonymous}
							maxLength={50}
						/>
						<Checkbox
							checked={isAnonymous}
							onChange={e => setIsAnonymous(e.target.checked)}
							className={styles.anonymousCheckbox}
						>
							{t('donation.sendAnonymously')}
						</Checkbox>
					</div>
				)}

				{/* Screen effect purchases have no chat message attached. */}
				{!isExternalProvider && !isEffectPurchase && (
					<div className={styles.section}>
						<label className={styles.label}>{t('donation.messageOptional')}</label>
						<TextArea
							value={donationMessage}
							onChange={e => setDonationMessage(e.target.value)}
							placeholder={t('donation.messageToStreamer')}
							rows={3}
							maxLength={200}
							showCount
						/>
					</div>
				)}

				<div className={styles.summary}>
					{paymentMethod !== 'doneru' && paymentMethod !== 'kofi' && (
						<div className={styles.totalAmount}>
							{t('donation.totalAmountLabel')}{' '}
							{isEffectPurchase ? (
								// Effects are fixed-price: show "fireworks ¥1,000" style
								// (effect name + the server-enforced amount). Crypto adds
								// the token amount actually sent at the current rate.
								<strong style={{ textTransform: 'capitalize' }}>
									{SCREEN_EFFECT_EMOJIS[effectType]} {t(`screenEffects.${effectType}`)}{' '}
									{formatEffectPrice(effectType)}
									{isEffectCrypto && effectCryptoAmount && (
										<span style={{ fontWeight: 'normal', color: '#666', marginLeft: 8 }}>
											(≈ {effectCryptoAmount} {getCurrencySymbol()})
										</span>
									)}
								</strong>
							) : (
								<strong>
									{paypayEnabled && paymentMethod === 'paypay' && formatAmountJPY(amount)}
									{paypalEnabled &&
										paymentMethod === 'paypal' &&
										(paypalConfig?.currencyCode === 'JPY'
											? formatAmountJPY(amount)
											: `${getFiatSymbol(paypalConfig?.currencyCode)}${amount.toFixed(2)}`)}
									{stripeEnabled &&
										paymentMethod === 'stripe' &&
										(stripeConfig?.currencyCode === 'JPY'
											? formatAmountJPY(amount)
											: `${getFiatSymbol(stripeConfig?.currencyCode || 'JPY')}${amount.toFixed(2)}`)}
									{metamaskEnabled && paymentMethod === 'metamask' && (
										<>
											{formatAmountCrypto(cryptoAmount)}
											{cryptoPrice > 0 && (
												<span style={{ fontWeight: 'normal', color: '#666', marginLeft: 8 }}>
													(≈ {formatBaseAmount(cryptoToJpy(cryptoAmount))})
												</span>
											)}
										</>
									)}
								</strong>
							)}
						</div>
					)}
					{tokushohoEnabled && (
						<div className={styles.tokushohoLink}>
							<a href="/tokushoho" target="_blank" rel="noopener noreferrer">
								{t('donation.tokushohoLink')}
							</a>
						</div>
					)}
				</div>

				<div className={styles.actions}>
					<Button onClick={onClose}>{t('donation.cancel')}</Button>
					{coinSpend && (
						<Button
							type="primary"
							htmlType="submit"
							loading={isSubmitting}
							disabled={coinInsufficient || coinSpendCost <= 0}
						>
							🪙 {t('donation.coinPayButton')}
						</Button>
					)}
					{!coinSpend && paypayEnabled && paymentMethod === 'paypay' && (
						<Button
							type="primary"
							htmlType="submit"
							loading={isSubmitting}
							icon={<QrcodeOutlined />}
						>
							{t('donation.payWith', { provider: 'PayPay' })}
						</Button>
					)}
					{!coinSpend && paypalEnabled && paymentMethod === 'paypal' && (
						<Button
							type="primary"
							htmlType="submit"
							loading={isSubmitting}
							icon={<WalletOutlined />}
							style={{ backgroundColor: '#0070ba', borderColor: '#0070ba' }}
						>
							{coinCharge
								? t('donation.coinChargeButton')
								: t('donation.payWith', { provider: 'PayPal' })}
						</Button>
					)}
					{!coinSpend && stripeEnabled && paymentMethod === 'stripe' && (
						<Button
							type="primary"
							htmlType="submit"
							loading={isSubmitting}
							icon={<WalletOutlined />}
							style={{ backgroundColor: '#635BFF', borderColor: '#635BFF' }}
						>
							{coinCharge
								? t('donation.coinChargeButton')
								: t('donation.payWith', { provider: 'Stripe' })}
						</Button>
					)}
					{!coinSpend && metamaskEnabled && paymentMethod === 'metamask' && (
						<Button
							type="primary"
							htmlType="submit"
							loading={isSubmitting}
							icon={<WalletOutlined />}
							disabled={
								// Effect purchases also need a live rate to price the send.
								!effectPriceReady ||
								(isBitcoin() ? !bitcoinAddress : isSolana() ? !solanaAddress : !walletConnected)
							}
						>
							{t('donation.sendWithCurrency', { currency: getCurrencySymbol() })}
						</Button>
					)}
				</div>
			</form>

			{/* Bitcoin send modal */}
			<Modal
				title={t('donation.bitcoinSendTitle')}
				open={showBitcoinModal}
				onCancel={() => {
					setShowBitcoinModal(false);
					setBitcoinSendStep(0);
					setBitcoinSendError('');
					setBitcoinFee(null);
				}}
				footer={[
					<Button
						key="close"
						onClick={() => {
							setShowBitcoinModal(false);
							setBitcoinSendStep(0);
							setBitcoinSendError('');
							setBitcoinFee(null);
						}}
					>
						{t('donation.close')}
					</Button>,
				]}
				closable={true}
				maskClosable={false}
				width={500}
			>
				<div style={{ padding: '16px 0' }}>
					<Steps
						direction="vertical"
						current={bitcoinSendStep - 1}
						status={bitcoinSendError ? 'error' : 'process'}
						items={[
							{
								title: t('donation.stepConnectSnap'),
								description:
									bitcoinSendStep >= 1
										? bitcoinAddress
											? t('donation.addressShort', { address: bitcoinAddress.substring(0, 12) })
											: t('donation.connectingToSnap')
										: t('donation.installingSnap'),
								icon:
									bitcoinSendStep === 1 ? (
										<LoadingOutlined />
									) : bitcoinSendStep > 1 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
							{
								title: t('donation.stepCheckBalance'),
								description: t('donation.fetchingUtxo'),
								icon:
									bitcoinSendStep === 2 ? (
										<LoadingOutlined />
									) : bitcoinSendStep > 2 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
							{
								title: t('donation.stepBuildTransaction'),
								description: t('donation.buildingPsbt'),
								icon:
									bitcoinSendStep === 3 ? (
										<LoadingOutlined />
									) : bitcoinSendStep > 3 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
							{
								title: t('donation.stepSignTransaction'),
								description: t('donation.approveSignatureInWallet', { wallet: getWalletName() }),
								icon:
									bitcoinSendStep === 4 ? (
										<LoadingOutlined />
									) : bitcoinSendStep > 4 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
							{
								title: t('donation.stepBroadcast'),
								description: t('donation.broadcasting'),
								icon:
									bitcoinSendStep === 5 ? (
										<LoadingOutlined />
									) : bitcoinSendStep > 5 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
							{
								title: t('donation.stepComplete'),
								description:
									bitcoinSendStep === 6
										? t('donation.sendComplete')
										: t('donation.waitingForCompletion'),
								icon:
									bitcoinSendStep === 6 ? (
										<CheckCircleOutlined style={{ color: '#52c41a' }} />
									) : undefined,
							},
						]}
					/>

					{bitcoinSendError && (
						<Alert
							type="error"
							message={t('donation.sendErrorTitle')}
							description={bitcoinSendError}
							style={{ marginTop: 16, backgroundColor: '#2a1215', borderColor: '#5c2223' }}
						/>
					)}

					{/* Transfer details */}
					<div
						style={{
							marginTop: 16,
							padding: 12,
							background: '#2a2d38',
							borderRadius: 8,
							color: '#e2e8f0',
						}}
					>
						<p style={{ margin: 0, color: '#e2e8f0' }}>
							<strong style={{ color: '#f7fafc' }}>{t('donation.sendAmountLabel')}</strong>{' '}
							{cryptoAmount} BTC ({decimalToBigInt(cryptoAmount, 8).toString()} satoshi)
						</p>
						{bitcoinFee !== null && (
							<p style={{ margin: '8px 0 0', color: '#e2e8f0' }}>
								<strong style={{ color: '#f7fafc' }}>{t('donation.feeLabel')}</strong>{' '}
								{(bitcoinFee / 100000000).toFixed(8)} BTC ({bitcoinFee} satoshi)
							</p>
						)}
						{bitcoinAddress && (
							<p style={{ margin: '8px 0 0', wordBreak: 'break-all', color: '#e2e8f0' }}>
								<strong style={{ color: '#f7fafc' }}>{t('donation.fromLabel')}</strong>{' '}
								{bitcoinAddress.substring(0, 20)}...
							</p>
						)}
					</div>
				</div>
			</Modal>
		</Modal>
	);
};

export default DonationForm;
