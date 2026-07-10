import { FC, useEffect, useState, ReactElement } from 'react';
import { Button, Modal as AntModal, Spin, message } from 'antd';
import { CheckCircleOutlined, LockOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import { Archive, formatArchivePrice } from '../../../interfaces/archive.model';
import {
	fetchData,
	PAYMENTS_CREATE,
	PAYMENTS_STATUS,
	PAYPAY_CREATE_PAYMENT,
	WALLET,
	WALLET_SPEND,
	withArchiveAccessToken,
} from '../../../utils/apis';
import { useAccessToken, useChatAuthenticated, useCurrentUser } from '../../stores/zustand-store';
import { Modal } from '../Modal/Modal';
import styles from './ArchivePurchase.module.scss';

// AuthModal pulls in every OAuth provider tab; load it only when the viewer
// actually needs to log in.
const AuthModal = dynamic(
	() => import('../../modals/AuthModal/AuthModal').then(mod => mod.AuthModal),
	{ ssr: false },
);

// sessionStorage marker recording the archive a payment was started for, so the
// archives page can re-open this panel (and show the purchased confirmation)
// after a full-page payment redirect returns on mobile.
export const ARCHIVE_PENDING_PURCHASE_KEY = 'owncastArchivePendingPurchase';

// Providers that support paid-archive purchase (crypto/Ko-fi/Doneru are
// excluded: the server only ties an entitlement to the buyer for these three).
type ArchiveProvider = 'stripe' | 'paypal' | 'paypay';

interface ProvidersState {
	stripe: boolean;
	paypal: boolean;
	paypay: boolean;
}

export type ArchivePurchaseProps = {
	// The archive being purchased, resolved from the (refreshed) list so its
	// `purchased` flag flips to true after a successful payment.
	archive: Archive | null;
	open: boolean;
	onClose: () => void;
	// Called when the viewer chooses to watch a now-owned archive.
	onWatch: (id: string) => void;
};

// Pay-per-view purchase panel for a paid archive. It teaches the account
// binding that trips buyers up: purchases attach to the viewer's OAuth
// identity, so it requires login before purchase, shows who they are logged in
// as at the purchase step, and repeats the binding after a successful buy.
export const ArchivePurchase: FC<ArchivePurchaseProps> = ({ archive, open, onClose, onWatch }) => {
	const { t, i18n } = useTranslation();
	const currentUser = useCurrentUser();
	const authenticated = useChatAuthenticated();
	const accessToken = useAccessToken();

	const [providers, setProviders] = useState<ProvidersState | null>(null);
	const [submitting, setSubmitting] = useState<ArchiveProvider | null>(null);
	const [showAuthModal, setShowAuthModal] = useState(false);
	// Prepaid coin balance. null until loaded, or when coins are off / logged out.
	const [coinBalance, setCoinBalance] = useState<number | null>(null);
	const [baseCurrency, setBaseCurrency] = useState('');
	const [payingWithCoins, setPayingWithCoins] = useState(false);

	// Load which providers are enabled the first time the panel opens.
	useEffect(() => {
		if (!open) {
			return undefined;
		}
		let cancelled = false;
		const load = async () => {
			try {
				const status = await fetchData(PAYMENTS_STATUS, { auth: false });
				if (!cancelled) {
					setProviders({
						stripe: Boolean(status?.stripe?.enabled),
						paypal: Boolean(status?.paypal?.enabled),
						paypay: Boolean(status?.paypay?.enabled),
					});
					setBaseCurrency(String(status?.baseCurrency || ''));
				}
				// Coins are a per-account balance, so they need both the feature on
				// and a signed-in viewer. A failure here just hides the coin option.
				if (!cancelled && status?.coin?.enabled && accessToken) {
					const wallet = await fetchData(withArchiveAccessToken(WALLET, accessToken), {
						auth: false,
					});
					if (!cancelled) {
						setCoinBalance(Number(wallet?.balance) || 0);
					}
				}
			} catch (_error) {
				if (!cancelled) {
					setProviders({ stripe: false, paypal: false, paypay: false });
				}
			}
		};
		load();
		return () => {
			cancelled = true;
		};
	}, [open, accessToken]);

	// Reset the transient submit state whenever the panel is closed.
	useEffect(() => {
		if (!open) {
			setSubmitting(null);
			setShowAuthModal(false);
		}
	}, [open]);

	const priceText = archive
		? formatArchivePrice(archive.price ?? 0, archive.currency, i18n.language)
		: '';
	const displayName = currentUser?.displayName ?? '';

	// Open the provider's hosted payment page. A new tab keeps this page (and
	// the pending marker) alive on desktop; mobile redirects the whole page.
	const openPaymentUrl = (url: string) => {
		if (archive) {
			window.sessionStorage.setItem(ARCHIVE_PENDING_PURCHASE_KEY, archive.id);
		}
		const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
		if (isMobile) {
			window.location.href = url;
		} else {
			window.open(url, '_blank');
			message.info(t('archives.paid.paymentOpenedTab'));
		}
	};

	const buy = async (provider: ArchiveProvider) => {
		if (!archive) {
			return;
		}
		setSubmitting(provider);
		try {
			// itemType/archiveId select the archive; the server enforces the price
			// from the manifest and ignores this amount. The access token in the
			// URL identifies the buyer so the entitlement attaches to them.
			const payload = {
				itemType: 'archive',
				archiveId: archive.id,
				amount: archive.price ?? 0,
				displayName,
				isAnonymous: false,
				message: '',
			};
			let response;
			if (provider === 'paypay') {
				response = await fetchData(withArchiveAccessToken(PAYPAY_CREATE_PAYMENT, accessToken), {
					method: 'POST',
					auth: false,
					data: payload,
				});
			} else {
				response = await fetchData(withArchiveAccessToken(PAYMENTS_CREATE, accessToken), {
					method: 'POST',
					auth: false,
					data: { provider, ...payload },
				});
			}
			const url = response?.paymentUrl || response?.approvalUrl || response?.url;
			if (response?.success && url) {
				openPaymentUrl(url);
			} else {
				message.error(response?.message || t('archives.paid.paymentFailed'));
			}
		} catch (_error) {
			message.error(t('archives.paid.paymentFailed'));
		} finally {
			setSubmitting(null);
		}
	};

	// Pay from the prepaid coin balance. Unlike the providers there is no hosted
	// page or redirect: the server debits the wallet and records the entitlement
	// in one request, so the panel can flip to "purchased" immediately.
	const buyWithCoins = async () => {
		if (!archive || payingWithCoins) {
			return;
		}
		setPayingWithCoins(true);
		try {
			const response = await fetchData(withArchiveAccessToken(WALLET_SPEND, accessToken), {
				method: 'POST',
				auth: false,
				data: {
					itemType: 'archive',
					archiveId: archive.id,
					displayName,
					isAnonymous: false,
					message: '',
				},
			});
			if (response?.success) {
				setCoinBalance(Number(response.balance) || 0);
				message.success(t('archives.paid.coinPaidSuccess'));
				// The archives list refreshes on close, flipping `purchased` to true.
				onWatch(archive.id);
			} else {
				message.error(response?.message || t('archives.paid.paymentFailed'));
			}
		} catch (_error) {
			message.error(t('archives.paid.paymentFailed'));
		} finally {
			setPayingWithCoins(false);
		}
	};

	let body: ReactElement;
	if (!archive) {
		// The panel was re-opened (e.g. returning from a mobile redirect) before
		// the archive list finished loading.
		body = (
			<div className={`${styles.panel} ${styles.centered}`}>
				<Spin />
			</div>
		);
	} else if (!currentUser) {
		// Chat identity is still connecting; needed for the binding name and to
		// render the auth modal.
		body = (
			<div className={`${styles.panel} ${styles.centered}`}>
				<Spin />
			</div>
		);
	} else if (archive.accessMode === 'authenticated' && authenticated) {
		// A members-only archive right after logging in from this panel: it is
		// now watchable, mirror the after-purchase confirmation.
		body = (
			<div className={styles.panel}>
				<CheckCircleOutlined className={styles.successIcon} />
				<h3 className={styles.heading}>{t('archives.members.loggedInTitle')}</h3>
				<Button type="primary" block onClick={() => onWatch(archive.id)}>
					{t('archives.paid.watchNow')}
				</Button>
			</div>
		);
	} else if (archive.accessMode === 'authenticated') {
		// Members-only archive for a logged-out viewer: plain login gate, no
		// price or purchase step.
		body = (
			<div className={styles.panel}>
				<div className={styles.archiveTitle}>{archive.title || t('archives.untitled')}</div>
				<p className={styles.loginNote}>{t('archives.members.loginRequired')}</p>
				<Button
					type="primary"
					block
					icon={<LockOutlined />}
					onClick={() => setShowAuthModal(true)}
				>
					{t('archives.members.loginToWatch')}
				</Button>
			</div>
		);
	} else if (archive.purchased) {
		// After-purchase confirmation: repeat the account binding.
		body = (
			<div className={styles.panel}>
				<CheckCircleOutlined className={styles.successIcon} />
				<h3 className={styles.heading}>{t('archives.paid.purchasedTitle')}</h3>
				<p className={styles.bindingNote}>
					{t('archives.paid.purchasedBinding', { name: displayName })}
				</p>
				<Button type="primary" block onClick={() => onWatch(archive.id)}>
					{t('archives.paid.watchNow')}
				</Button>
			</div>
		);
	} else if (!authenticated) {
		// Requirement: never show a purchase button to anonymous viewers.
		body = (
			<div className={styles.panel}>
				<div className={styles.archiveTitle}>{archive.title || t('archives.untitled')}</div>
				<div className={styles.price}>{priceText}</div>
				<p className={styles.loginNote}>{t('archives.paid.loginRequired')}</p>
				<Button
					type="primary"
					block
					icon={<LockOutlined />}
					onClick={() => setShowAuthModal(true)}
				>
					{t('archives.paid.loginToPurchase')}
				</Button>
			</div>
		);
	} else {
		// Coins are denominated in base-currency minor units, so they can only pay
		// for an archive priced in that same currency — which is exactly what the
		// server enforces. Offer them only then, rather than letting the request fail.
		const coinPrice = archive.price ?? 0;
		const archiveCurrency = archive.currency || baseCurrency;
		const coinsUsable =
			coinBalance !== null && baseCurrency !== '' && archiveCurrency === baseCurrency;
		const coinsInsufficient = coinsUsable && (coinBalance ?? 0) < coinPrice;
		const noProviders =
			providers !== null &&
			!providers.stripe &&
			!providers.paypal &&
			!providers.paypay &&
			!coinsUsable;
		body = (
			<div className={styles.panel}>
				<div className={styles.archiveTitle}>{archive.title || t('archives.untitled')}</div>
				<div className={styles.price}>{priceText}</div>
				<div className={styles.accountRow}>
					<span className={styles.accountLabel}>{t('archives.paid.loggedInAs')}</span>
					<span className={styles.accountName}>{displayName}</span>
				</div>
				<p className={styles.bindingNote}>{t('archives.paid.bindingNote', { name: displayName })}</p>
				{providers === null && (
					<div className={styles.centered}>
						<Spin />
					</div>
				)}
				{noProviders && <p className={styles.unavailable}>{t('archives.paid.noProviders')}</p>}
				{providers && !noProviders && (
					<div className={styles.providers}>
						{coinsUsable && (
							<>
								<Button
									type="primary"
									block
									loading={payingWithCoins}
									disabled={submitting !== null || coinsInsufficient}
									onClick={buyWithCoins}
								>
									🪙 {t('archives.paid.payWithCoins', { amount: coinPrice.toLocaleString() })}
								</Button>
								<p className={styles.coinBalance}>
									{coinsInsufficient
										? t('archives.paid.coinInsufficient', {
												balance: (coinBalance ?? 0).toLocaleString(),
											})
										: t('archives.paid.coinBalance', {
												balance: (coinBalance ?? 0).toLocaleString(),
											})}
								</p>
							</>
						)}
						{providers.stripe && (
							<Button
								type="primary"
								block
								loading={submitting === 'stripe'}
								disabled={submitting !== null}
								onClick={() => buy('stripe')}
							>
								{t('archives.paid.payWith', { provider: 'Stripe' })}
							</Button>
						)}
						{providers.paypal && (
							<Button
								block
								loading={submitting === 'paypal'}
								disabled={submitting !== null}
								onClick={() => buy('paypal')}
							>
								{t('archives.paid.payWith', { provider: 'PayPal' })}
							</Button>
						)}
						{providers.paypay && (
							<Button
								block
								loading={submitting === 'paypay'}
								disabled={submitting !== null}
								onClick={() => buy('paypay')}
							>
								{t('archives.paid.payWith', { provider: 'PayPay' })}
							</Button>
						)}
					</div>
				)}
				<p className={styles.returnHint}>{t('archives.paid.returnHint')}</p>
			</div>
		);
	}

	return (
		<>
			<AntModal
				open={open}
				title={
					archive?.accessMode === 'authenticated'
						? t('archives.members.title')
						: t('archives.paid.purchaseTitle')
				}
				footer={null}
				onCancel={onClose}
				width={420}
			>
				{body}
			</AntModal>
			<Modal
				title={t('archives.paid.loginModalTitle')}
				open={showAuthModal}
				handleCancel={() => setShowAuthModal(false)}
			>
				<AuthModal />
			</Modal>
		</>
	);
};
