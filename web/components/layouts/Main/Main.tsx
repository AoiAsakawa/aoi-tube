import Head from '@components/compat/Head';
import { FC, useEffect, useRef, useState } from 'react';
import { Layout, message } from 'antd';
import { useTranslation } from 'react-i18next';
import dynamic from '@components/compat/dynamic';
import Script from '@components/compat/Script';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';
import { Footer } from '../../ui/Footer/Footer';
import { ClientConfigStore } from '../../stores/ClientConfigStore';
import {
	useAppStore,
	useClientConfig,
	useServerStatus,
	useIsChatAvailable,
	useFatalErrorState,
	useAppState,
	useChatAuthenticated,
	useAccessToken,
} from '../../stores/zustand-store';
import { DONATIONS_RECENT, getUnauthedData } from '../../../utils/apis';
import { MessageType, DonationSocketEvent } from '../../../interfaces/socket-events';
import { Content } from '../../ui/Content/Content';
import { Header } from '../../ui/Header/Header';
import { ScreenEffects } from '../../ui/ScreenEffects/ScreenEffects';
import setupNoLinkReferrer from '../../../utils/no-link-referrer';
import { TitleNotifier } from '../../TitleNotifier/TitleNotifier';
import { ServerRenderedHydration } from '../../ServerRendered/ServerRenderedHydration';
import { Theme } from '../../theme/Theme';
import styles from './Main.module.scss';
import { PushNotificationServiceWorker } from '../../workers/PushNotificationServiceWorker/PushNotificationServiceWorker';
import { Noscript } from '../../ui/Noscript/Noscript';

// Lazy loaded components

const FatalErrorStateModal = dynamic(
	() =>
		import('../../modals/FatalErrorStateModal/FatalErrorStateModal').then(
			mod => mod.FatalErrorStateModal,
		),
	{
		ssr: false,
	},
);

const NsfwWarningModal = dynamic(
	() => import('../../modals/NsfwWarningModal/NsfwWarningModal').then(mod => mod.NsfwWarningModal),
	{
		ssr: false,
	},
);

const SocialAuthRequiredModal = dynamic(
	() =>
		import('../../modals/SocialAuthRequiredModal/SocialAuthRequiredModal').then(
			mod => mod.SocialAuthRequiredModal,
		),
	{
		ssr: false,
	},
);

const CookieConsent = dynamic(
	() => import('../../ui/CookieConsent/CookieConsent').then(mod => mod.CookieConsent),
	{
		ssr: false,
	},
);

const NSFW_CONFIRMED_KEY = 'nsfw_age_confirmed';
const AUTH_CHECK_DELAY = 2000; // Wait 2 seconds for auth state to be determined

export const Main: FC = () => {
	const { t } = useTranslation();
	const clientConfig = useClientConfig();
	const clientStatus = useServerStatus();
	const { name, nsfw, authentication } = clientConfig;
	const {
		requireTwitterAuth,
		twitterAuthEnabled,
		xAuthEnabled,
		discordAuthEnabled,
		googleAuthEnabled,
		githubAuthEnabled,
	} = authentication || {};
	const isChatAvailable = useIsChatAvailable();
	const fatalError = useFatalErrorState();
	const appState = useAppState();
	const chatAuthenticated = useChatAuthenticated();
	const accessToken = useAccessToken();
	const layoutRef = useRef<HTMLDivElement>(null);
	const { chatDisabled } = clientConfig;
	const { videoAvailable } = appState;
	const { online, streamTitle } = clientStatus;

	// Auth check ready state - wait before showing auth modal to prevent flash
	const [authCheckReady, setAuthCheckReady] = useState(false);

	// Manual login modal opened from the header while offline
	const [showLoginModal, setShowLoginModal] = useState(false);

	// NSFW age gate state
	const [showNsfwWarning, setShowNsfwWarning] = useState(false);
	const [nsfwConfirmed, setNsfwConfirmed] = useState(true); // default true to avoid flash

	// Wait for auth state to be determined before showing social auth modal
	useEffect(() => {
		const timer = setTimeout(() => {
			setAuthCheckReady(true);
		}, AUTH_CHECK_DELAY);

		return () => clearTimeout(timer);
	}, []);

	// If user becomes authenticated, mark auth check as ready immediately
	useEffect(() => {
		if (chatAuthenticated) {
			setAuthCheckReady(true);
		}
	}, [chatAuthenticated]);

	useEffect(() => {
		if (nsfw) {
			const confirmed = localStorage.getItem(NSFW_CONFIRMED_KEY) === 'true';
			setNsfwConfirmed(confirmed);
			if (!confirmed) {
				setShowNsfwWarning(true);
			}
		} else {
			setNsfwConfirmed(true);
			setShowNsfwWarning(false);
		}
	}, [nsfw]);

	const handleNsfwConfirm = () => {
		localStorage.setItem(NSFW_CONFIRMED_KEY, 'true');
		setNsfwConfirmed(true);
		setShowNsfwWarning(false);
	};

	const handleNsfwDecline = () => {
		// Redirect away from the site
		window.location.href = 'https://www.google.com';
	};

	// Handle donation completion redirect
	// When user returns from PayPay, check for donation=success and add recent donation to chat
	const donationProcessedRef = useRef(false);
	const setChatMessages = useAppStore.getState().setChatMessages;

	useEffect(() => {
		const handleDonationRedirect = async () => {
			// Prevent processing twice
			if (donationProcessedRef.current) return;

			const urlParams = new URLSearchParams(window.location.search);
			const donationStatus = urlParams.get('donation');

			if (donationStatus === 'success') {
				donationProcessedRef.current = true;

				// Generic wording: at this point we only know a purchase succeeded,
				// not whether it was a superchat or a screen effect.
				message.success(t('donation.purchaseThanks'));

				// Wait a bit for WebSocket to connect and chat history to load
				await new Promise(resolve => setTimeout(resolve, 1500));

				try {
					// Fetch recent donations
					const response = await getUnauthedData(`${DONATIONS_RECENT}?limit=1`);
					if (response && response.length > 0) {
						const recentDonation = response[0];

						// Check if this donation was within the last 60 seconds.
						// The API returns models.Donation, whose time field is createdAt.
						const donationCreatedAt = recentDonation.createdAt ?? recentDonation.timestamp;
						const donationTime = new Date(donationCreatedAt).getTime();
						const now = Date.now();
						if (now - donationTime < 60000) {
							// Convert to DonationSocketEvent format
							const donationEvent: DonationSocketEvent = {
								type: MessageType.DONATION,
								id: recentDonation.id,
								timestamp: new Date(donationCreatedAt),
								amount: recentDonation.amount,
								currency: recentDonation.currency,
								amountJpy: recentDonation.amountJpy,
								message: recentDonation.message || '',
								displayName: recentDonation.displayName,
								isAnonymous: recentDonation.isAnonymous,
								donationId: recentDonation.id,
								itemType: recentDonation.itemType,
								effectType: recentDonation.effectType,
							};

							// Add to chat messages
							setChatMessages(currentState => {
								// Check if this donation is already in the chat
								const exists = currentState.some(
									(msg: any) =>
										msg.type === MessageType.DONATION &&
										(msg as any).donationId === recentDonation.id,
								);
								if (!exists) {
									return [...currentState, donationEvent];
								}
								return currentState;
							});
						}
					}
				} catch (error) {
					console.error('Failed to fetch recent donation:', error);
				}

				// Clean up URL
				const newUrl = window.location.pathname;
				window.history.replaceState({}, document.title, newUrl);
			} else if (donationStatus === 'error') {
				message.error(t('donation.purchaseError'));
				// Clean up URL
				const newUrl = window.location.pathname;
				window.history.replaceState({}, document.title, newUrl);
			}
		};

		handleDonationRedirect();
		// The processed ref and the URL cleanup make re-runs (language change
		// swaps `t`) a no-op.
	}, [t]);

	// Social auth requirement (X, Discord, Google, GitHub, or legacy Twitter).
	// Shown offline too (viewers can wait in chat, which also requires auth),
	// but only after the NSFW age gate has been passed so the two modals
	// never stack on first visit.
	const anySocialAuthEnabled =
		xAuthEnabled ||
		discordAuthEnabled ||
		twitterAuthEnabled ||
		googleAuthEnabled ||
		githubAuthEnabled;
	const showSocialAuthRequired =
		authCheckReady &&
		nsfwConfirmed &&
		!showNsfwWarning &&
		online &&
		requireTwitterAuth &&
		anySocialAuthEnabled &&
		!chatAuthenticated &&
		accessToken;

	// Unauthenticated visitors get a login button in place of the user menu
	// (the auth modal is only forced while the stream is live).
	const showLoginButton = Boolean(
		authCheckReady &&
		nsfwConfirmed &&
		!showNsfwWarning &&
		requireTwitterAuth &&
		anySocialAuthEnabled &&
		!chatAuthenticated &&
		accessToken,
	);

	const handleXAuth = async () => {
		if (!accessToken) return;

		// Prefer X OAuth 2.0 if configured, otherwise fall back to Twitter OAuth 1.0a
		const authEndpoint = xAuthEnabled ? '/api/auth/x' : '/api/auth/twitter';

		try {
			const url = `${authEndpoint}?accessToken=${accessToken}`;
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			});

			const content = await rawResponse.json();
			if (content.redirect) {
				window.location.href = content.redirect;
			}
		} catch (e) {
			console.error('X auth error:', e);
		}
	};

	const handleDiscordAuth = async () => {
		if (!accessToken) return;

		try {
			const url = `/api/auth/discord?accessToken=${accessToken}`;
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			});

			const content = await rawResponse.json();
			if (content.redirect) {
				window.location.href = content.redirect;
			}
		} catch (e) {
			console.error('Discord auth error:', e);
		}
	};

	const handleGoogleAuth = async () => {
		if (!accessToken) return;

		try {
			const url = `/api/auth/google?accessToken=${accessToken}`;
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			});

			const content = await rawResponse.json();
			if (content.redirect) {
				window.location.href = content.redirect;
			}
		} catch (e) {
			console.error('Google auth error:', e);
		}
	};

	const handleGitHubAuth = async () => {
		if (!accessToken) return;

		try {
			const url = `/api/auth/github?accessToken=${accessToken}`;
			const rawResponse = await fetch(url, {
				method: 'POST',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			});

			const content = await rawResponse.json();
			if (content.redirect) {
				window.location.href = content.redirect;
			}
		} catch (e) {
			console.error('GitHub auth error:', e);
		}
	};

	useEffect(() => {
		setupNoLinkReferrer(layoutRef.current);
	}, []);

	const isProduction = process.env.NODE_ENV === 'production';
	const headerText = online ? streamTitle || name : name;

	return (
		<>
			<Head>
				{isProduction && <ServerRenderedHydration />}

				<link rel="apple-touch-icon" sizes="57x57" href="/img/favicon/apple-icon-57x57.png" />
				<link rel="apple-touch-icon" sizes="60x60" href="/img/favicon/apple-icon-60x60.png" />
				<link rel="apple-touch-icon" sizes="72x72" href="/img/favicon/apple-icon-72x72.png" />
				<link rel="apple-touch-icon" sizes="76x76" href="/img/favicon/apple-icon-76x76.png" />
				<link rel="apple-touch-icon" sizes="114x114" href="/img/favicon/apple-icon-114x114.png" />
				<link rel="apple-touch-icon" sizes="120x120" href="/img/favicon/apple-icon-120x120.png" />
				<link rel="apple-touch-icon" sizes="144x144" href="/img/favicon/apple-icon-144x144.png" />
				<link rel="apple-touch-icon" sizes="152x152" href="/img/favicon/apple-icon-152x152.png" />
				<link rel="apple-touch-icon" sizes="180x180" href="/img/favicon/apple-icon-180x180.png" />
				<link
					rel="icon"
					type="image/png"
					sizes="192x192"
					href="/img/favicon/android-icon-192x192.png"
				/>
				<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon/favicon-32x32.png" />
				<link rel="icon" type="image/png" sizes="96x96" href="/img/favicon/favicon-96x96.png" />
				<link rel="icon" type="image/png" sizes="16x16" href="/img/favicon/favicon-16x16.png" />
				{/* use-credentials: manifests are fetched with credentials omitted by
				    default, which breaks behind auth proxies (Basic auth / Authelia). */}
				<link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
				<link rel="authorization_endpoint" href="/api/auth/provider/indieauth" />
				<meta name="msapplication-TileColor" content="#ffffff" />
				<meta name="msapplication-TileImage" content="/img/favicon/ms-icon-144x144.png" />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
				/>
				<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

				<base target="_blank" />
			</Head>

			{isProduction ? (
				<Head>
					{name ? <title>{name}</title> : <title>{'{{.Name}}'}</title>}
					<meta name="description" content="{{.Summary}}" />

					<meta property="og:title" content="{{.Name}}" />
					<meta property="og:site_name" content="{{.Name}}" />
					<meta property="og:url" content="{{.RequestedURL}}" />
					<meta property="og:description" content="{{.Summary}}" />
					<meta property="og:type" content="video.other" />
					<meta property="video:tag" content="{{.TagsString}}" />

					<meta property="og:image" content="{{.RequestedURL}}{{.Thumbnail}}" />
					<meta property="og:image:url" content="{{.RequestedURL}}{{.Thumbnail}}" />
					<meta property="og:image:alt" content="{{.RequestedURL}}{{.Image}}" />

					<meta property="og:video" content="{{.RequestedURL}}/embed/video" />
					<meta property="og:video:secure_url" content="{{.RequestedURL}}/embed/video" />
					<meta property="og:video:height" content="315" />
					<meta property="og:video:width" content="560" />
					<meta property="og:video:type" content="text/html" />
					<meta property="og:video:actor" content="{{.Name}}" />

					<meta property="twitter:title" content="{{.Name}}" />
					<meta property="twitter:url" content="{{.RequestedURL}}" />
					<meta property="twitter:description" content="{{.Summary}}" />
					<meta property="twitter:image" content="{{.Image}}" />
					<meta property="twitter:card" content="player" />
					<meta property="twitter:player" content="{{.RequestedURL}}/embed/video" />
					<meta property="twitter:player:width" content="560" />
					<meta property="twitter:player:height" content="315" />
				</Head>
			) : (
				<Head>
					<title>{name}</title>
				</Head>
			)}
			<ErrorBoundary
				fallbackRender={({ error }) => (
					<FatalErrorStateModal
						title="Error"
						message={`There was an unexpected error. Please refresh the page to retry. If this error continues please file a bug with the AoiTube project: ${error}`}
					/>
				)}
			>
				<ClientConfigStore />
			</ErrorBoundary>
			<PushNotificationServiceWorker />
			<TitleNotifier name={name} />
			<Theme />
			<Script strategy="afterInteractive" src="/customjavascript" />
			<Layout ref={layoutRef} className={styles.layout}>
				<Header
					name={headerText}
					chatAvailable={isChatAvailable}
					chatDisabled={chatDisabled}
					online={videoAvailable}
					showLoginButton={showLoginButton}
					onLoginClick={() => setShowLoginModal(true)}
				/>
				<Content />
				{/* Full-screen purchased effects overlay; renders above the player. */}
				<ScreenEffects />
				{fatalError && (
					<FatalErrorStateModal title={fatalError.title} message={fatalError.message} />
				)}
				{showNsfwWarning && (
					<NsfwWarningModal onConfirm={handleNsfwConfirm} onDecline={handleNsfwDecline} />
				)}
				{(showSocialAuthRequired || showLoginModal) && (
					<SocialAuthRequiredModal
						onXAuth={handleXAuth}
						onDiscordAuth={handleDiscordAuth}
						onGoogleAuth={handleGoogleAuth}
						onGitHubAuth={handleGitHubAuth}
						xEnabled={xAuthEnabled || twitterAuthEnabled}
						discordEnabled={discordAuthEnabled}
						googleEnabled={googleAuthEnabled}
						githubEnabled={githubAuthEnabled}
						onClose={showSocialAuthRequired ? undefined : () => setShowLoginModal(false)}
					/>
				)}
				{/* Hide content until NSFW is confirmed */}
				{nsfw && !nsfwConfirmed && <div className={styles.nsfwOverlay} />}
				{/* Hide content until social auth is confirmed */}
				{showSocialAuthRequired && <div className={styles.nsfwOverlay} />}

				<div className={classNames(styles.footerContainer, 'footer-shell')}>
					<Footer />
				</div>
				<CookieConsent />
			</Layout>
			<Noscript />
		</>
	);
};
