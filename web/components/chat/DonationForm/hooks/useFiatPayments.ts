// Fiat payment provider state for the donation form: fetches the public
// configuration of each provider (Tokushoho, Metamask, Doneru, Ko-fi, PayPal,
// Stripe) and implements the PayPal / Stripe / PayPay payment flows.
// metamaskConfig state itself lives in the component because the wallet hooks
// read it; this hook only writes it via the setter passed in.
import { useEffect, useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import {
	fetchData,
	PAYPAY_CREATE_PAYMENT,
	TOKUSHOHO_PUBLIC,
	METAMASK_STATUS,
	DONERU_STATUS,
	KOFI_STATUS,
	PAYPAL_STATUS,
	PAYPAL_CREATE_PAYMENT,
	STRIPE_STATUS,
	STRIPE_CREATE_PAYMENT,
	PAYMENTS_CREATE,
	withArchiveAccessToken,
} from '../../../../utils/apis';
import { getEffectPrice } from '../../../../interfaces/donation.model';

// Append the logged-in viewer's access token to a payment-create URL so the
// server can resolve the buyer for account-scoped purchases (paid archive
// entitlements, coin top-ups). Harmless for anonymous superchats/effects.
const withPaymentAccessToken = (url: string): string => {
	const token = typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null;
	return withArchiveAccessToken(url, token);
};
import { AVAILABLE_NETWORKS, AVAILABLE_TOKENS } from '../constants';
import {
	DoneruConfig,
	KofiConfig,
	MetamaskConfig,
	NetworkOption,
	PayPalConfig,
	PurchaseItem,
	StripeConfig,
	TokenOption,
} from '../types';

interface UseFiatPaymentsArgs {
	visible: boolean;
	onClose: () => void;
	paypayEnabled: boolean;
	metamaskEnabled: boolean;
	doneruEnabled: boolean;
	kofiEnabled: boolean;
	paypalEnabled: boolean;
	paypalConfigProp: PayPalConfig | null;
	stripeEnabled: boolean;
	stripeConfigProp: StripeConfig | null;
	amount: number;
	donationMessage: string;
	displayName: string;
	isAnonymous: boolean;
	// What is being purchased (superchat or screen effect); spread into every
	// payment creation request.
	purchaseItem: PurchaseItem;
	setAmount: (amount: number) => void;
	setDonationMessage: (donationMessage: string) => void;
	setIsSubmitting: (isSubmitting: boolean) => void;
	setMetamaskConfig: (config: MetamaskConfig | null) => void;
	selectedNetwork: NetworkOption | null;
	setSelectedNetwork: (network: NetworkOption) => void;
	setAvailableTokens: (tokens: TokenOption[]) => void;
	setSelectedToken: (token: TokenOption) => void;
	fetchCryptoPrice: (coinGeckoId: string, retryCount?: number) => Promise<void>;
}

export const useFiatPayments = ({
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
}: UseFiatPaymentsArgs) => {
	const { t } = useTranslation();

	// Screen effect purchases never carry a chat message.
	const effectiveMessage = purchaseItem.itemType === 'effect' ? '' : donationMessage;

	// Screen effects are fixed-price products: the server enforces the price
	// and ignores the client-supplied amount, but we submit the same fixed
	// value so the request matches what the form displayed.
	const purchaseAmount = (currency: string): number =>
		purchaseItem.itemType === 'effect'
			? getEffectPrice(purchaseItem.effectType, currency)
			: amount;

	const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(null);
	const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
	const [doneruConfig, setDoneruConfig] = useState<DoneruConfig | null>(null);
	const [kofiConfig, setKofiConfig] = useState<KofiConfig | null>(null);
	const [tokushohoEnabled, setTokushohoEnabled] = useState<boolean>(false);

	// Check Tokushoho, Metamask, and Doneru config
	useEffect(() => {
		const checkTokushohoStatus = async () => {
			try {
				const response = await fetchData(TOKUSHOHO_PUBLIC);
				setTokushohoEnabled(response && response.enabled);
			} catch (_error) {
				setTokushohoEnabled(false);
			}
		};

		const checkMetamaskConfig = async () => {
			if (!metamaskEnabled) return;
			try {
				const response = await fetchData(METAMASK_STATUS);
				if (response && response.enabled) {
					setMetamaskConfig(response);
					// Initialize with first available network
					if (!selectedNetwork) {
						const defaultNetwork = AVAILABLE_NETWORKS[0];
						setSelectedNetwork(defaultNetwork);
						const tokens = AVAILABLE_TOKENS[defaultNetwork.id] || [];
						setAvailableTokens(tokens);
						if (tokens.length > 0) {
							setSelectedToken(tokens[0]);
							fetchCryptoPrice(tokens[0].coinGeckoId);
						}
					}
				}
			} catch (_error) {
				console.error('Failed to fetch Metamask config');
			}
		};

		const checkDoneruConfig = async () => {
			if (!doneruEnabled) return;
			try {
				const response = await fetchData(DONERU_STATUS);
				if (response && response.enabled) {
					setDoneruConfig(response);
				}
			} catch (_error) {
				console.error('Failed to fetch Doneru config');
			}
		};

		const checkKofiConfig = async () => {
			if (!kofiEnabled) return;
			try {
				const response = await fetchData(KOFI_STATUS);
				if (response && response.enabled) {
					setKofiConfig(response);
				}
			} catch (_error) {
				console.error('Failed to fetch Ko-fi config');
			}
		};

		const checkPaypalConfig = async () => {
			if (!paypalEnabled) return;
			if (paypalConfigProp && paypalConfigProp.enabled) {
				setPaypalConfig(paypalConfigProp);
				return;
			}
			try {
				const response = await fetchData(PAYPAL_STATUS);
				if (response && response.enabled) {
					setPaypalConfig(response);
				}
			} catch (_error) {
				console.error('Failed to fetch PayPal config');
			}
		};

		const checkStripeConfig = async () => {
			if (!stripeEnabled) return;
			if (stripeConfigProp && stripeConfigProp.enabled) {
				setStripeConfig(stripeConfigProp);
				return;
			}
			try {
				const response = await fetchData(STRIPE_STATUS);
				if (response && response.enabled) {
					setStripeConfig(response);
				}
			} catch (_error) {
				console.error('Failed to fetch Stripe config');
			}
		};

		if (visible) {
			checkTokushohoStatus();
			checkMetamaskConfig();
			checkDoneruConfig();
			checkKofiConfig();
			checkPaypalConfig();
			checkStripeConfig();
		}
	}, [
		visible,
		metamaskEnabled,
		doneruEnabled,
		kofiEnabled,
		paypalEnabled,
		paypalConfigProp,
		stripeEnabled,
		stripeConfigProp,
		fetchCryptoPrice,
		selectedNetwork,
	]);

	const handlePayPalPayment = async () => {
		// PayPal charges in its configured currency (fallback matches the form).
		const chargeAmount = purchaseAmount(paypalConfig?.currencyCode || 'USD');
		if (chargeAmount <= 0) {
			message.error(t('donation.enterAmount'));
			return;
		}

		if (!isAnonymous && !displayName.trim()) {
			message.error(t('donation.enterNameOrAnonymous'));
			return;
		}

		if (!paypalEnabled || !paypalConfig) {
			message.error(t('donation.paymentUnavailable', { provider: 'PayPal' }));
			return;
		}

		setIsSubmitting(true);

		try {
			const createData = {
				amount: chargeAmount,
				message: effectiveMessage,
				displayName: isAnonymous ? '' : displayName.trim(),
				isAnonymous,
				...purchaseItem,
			};

			let response;
			try {
				// Carry the logged-in viewer's token so purchases that require an
				// account (paid archive, coin top-up) resolve the buyer server-side.
				response = await fetchData(withPaymentAccessToken(PAYMENTS_CREATE), {
					method: 'POST',
					data: {
						provider: 'paypal',
						...createData,
					},
					auth: false,
				});
			} catch (error) {
				console.warn(
					'Failed to create PayPal payment via aggregated endpoint; falling back to legacy endpoint.',
					error,
				);
				response = await fetchData(PAYPAL_CREATE_PAYMENT, {
					method: 'POST',
					data: createData,
					auth: false,
				});
			}

			if (response.success && response.approvalUrl) {
				// Check if mobile device
				const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

				// Reset form state before navigation/opening new tab
				setAmount(500);
				setDonationMessage('');
				setIsSubmitting(false);
				onClose();

				if (isMobile) {
					// On mobile: redirect to PayPal page
					message.info(t('donation.paymentRedirecting', { provider: 'PayPal' }));
					window.location.href = response.approvalUrl;
				} else {
					// On PC: open in new tab to keep stream/chat active
					window.open(response.approvalUrl, '_blank');
					message.info(t('donation.paymentCompleteInNewTab', { provider: 'PayPal' }));
				}
			} else {
				message.error(
					response.message || t('donation.paymentCreateFailed', { provider: 'PayPal' }),
				);
				setIsSubmitting(false);
			}
		} catch (error) {
			console.error('PayPal error:', error);
			message.error(t('donation.paymentCreateError', { provider: 'PayPal' }));
			setIsSubmitting(false);
		}
	};

	const handleStripePayment = async () => {
		// Stripe charges in its configured currency (fallback matches the form).
		const chargeAmount = purchaseAmount(stripeConfig?.currencyCode || 'JPY');
		if (chargeAmount <= 0) {
			message.error(t('donation.enterAmount'));
			return;
		}

		if (!isAnonymous && !displayName.trim()) {
			message.error(t('donation.enterNameOrAnonymous'));
			return;
		}

		if (!stripeEnabled || !stripeConfig) {
			message.error(t('donation.paymentUnavailable', { provider: 'Stripe' }));
			return;
		}

		setIsSubmitting(true);

		try {
			const createData = {
				amount: chargeAmount,
				message: effectiveMessage,
				displayName: isAnonymous ? '' : displayName.trim(),
				isAnonymous,
				...purchaseItem,
			};

			let response;
			try {
				response = await fetchData(withPaymentAccessToken(PAYMENTS_CREATE), {
					method: 'POST',
					data: {
						provider: 'stripe',
						...createData,
					},
					auth: false,
				});
			} catch (error) {
				console.warn(
					'Failed to create Stripe payment via aggregated endpoint; falling back to legacy endpoint.',
					error,
				);
				response = await fetchData(STRIPE_CREATE_PAYMENT, {
					method: 'POST',
					data: createData,
					auth: false,
				});
			}

			if (response.success && response.url) {
				// Check if mobile device
				const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

				// Reset form state before navigation/opening new tab
				setAmount(500);
				setDonationMessage('');
				setIsSubmitting(false);
				onClose();

				if (isMobile) {
					// On mobile: redirect to Stripe page
					message.info(t('donation.paymentRedirecting', { provider: 'Stripe' }));
					window.location.href = response.url;
				} else {
					// On PC: open in new tab to keep stream/chat active
					window.open(response.url, '_blank');
					message.info(t('donation.paymentCompleteInNewTab', { provider: 'Stripe' }));
				}
			} else {
				message.error(
					response.message || t('donation.paymentCreateFailed', { provider: 'Stripe' }),
				);
				setIsSubmitting(false);
			}
		} catch (error) {
			console.error('Stripe error:', error);
			message.error(t('donation.paymentCreateError', { provider: 'Stripe' }));
			setIsSubmitting(false);
		}
	};

	const handlePayPayPayment = async () => {
		// PayPay always charges in JPY.
		const chargeAmount = purchaseAmount('JPY');
		if (chargeAmount <= 0) {
			message.error(t('donation.enterAmount'));
			return;
		}

		if (!isAnonymous && !displayName.trim()) {
			message.error(t('donation.enterNameOrAnonymous'));
			return;
		}

		if (!paypayEnabled) {
			message.error(t('donation.paymentUnavailable', { provider: 'PayPay' }));
			return;
		}

		setIsSubmitting(true);

		try {
			// Carry the logged-in viewer's token so account-scoped purchases (coin
			// top-up, paid archive) can resolve the buyer server-side.
			const response = await fetchData(withPaymentAccessToken(PAYPAY_CREATE_PAYMENT), {
				method: 'POST',
				data: {
					amount: chargeAmount,
					message: effectiveMessage,
					displayName: isAnonymous ? '' : displayName.trim(),
					isAnonymous,
					...purchaseItem,
				},
				auth: false,
			});

			if (response.success && response.paymentUrl) {
				// Check if mobile device
				const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

				// Reset form state before navigation/opening new tab
				setAmount(500);
				setDonationMessage('');
				setIsSubmitting(false);
				onClose();

				if (isMobile) {
					// On mobile: redirect to PayPay page (allows "Open in App" button)
					message.info(t('donation.paymentRedirecting', { provider: 'PayPay' }));
					window.location.href = response.paymentUrl;
				} else {
					// On PC: open in new tab to keep stream/chat active
					window.open(response.paymentUrl, '_blank');
					message.info(t('donation.paymentCompleteInNewTab', { provider: 'PayPay' }));
				}
			} else {
				message.error(
					response.message || t('donation.paymentCreateFailed', { provider: 'PayPay' }),
				);
				setIsSubmitting(false);
			}
		} catch (error) {
			console.error('PayPay error:', error);
			message.error(t('donation.paymentCreateError', { provider: 'PayPay' }));
			setIsSubmitting(false);
		}
	};

	return {
		paypalConfig,
		stripeConfig,
		doneruConfig,
		kofiConfig,
		tokushohoEnabled,
		handlePayPalPayment,
		handleStripePayment,
		handlePayPayPayment,
	};
};
