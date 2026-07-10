const ADMIN_USERNAME = process.env.NEXT_PUBLIC_ADMIN_USERNAME;
const ADMIN_STREAMKEY = process.env.NEXT_PUBLIC_ADMIN_STREAMKEY;
export const NEXT_PUBLIC_API_HOST = process.env.NEXT_PUBLIC_API_HOST;

const API_LOCATION = `${NEXT_PUBLIC_API_HOST}api/admin/`;

export const FETCH_INTERVAL = 15000;

// Current inbound broadcaster info
export const STATUS = `${API_LOCATION}status`;

// Current server config
export const SERVER_CONFIG = `${API_LOCATION}serverconfig`;

// Base url to update config settings
export const SERVER_CONFIG_UPDATE_URL = `${API_LOCATION}config`;

// Get viewer count over time
export const VIEWERS_OVER_TIME = `${API_LOCATION}viewersOverTime`;

// Get active viewer details
export const ACTIVE_VIEWER_DETAILS = `${API_LOCATION}viewers`;

// Get currently connected chat clients
export const CONNECTED_CLIENTS = `${API_LOCATION}chat/clients`;

// Get list of disabled/blocked chat users
export const DISABLED_USERS = `${API_LOCATION}chat/users/disabled`;

// Get all users
export const ALL_USERS = `${API_LOCATION}chat/users/all`;

// Delete a user
export const DELETE_USER = `${API_LOCATION}chat/users/delete`;

// Delete all users
export const DELETE_ALL_USERS = `${API_LOCATION}chat/users/deleteall`;

// Authentication governance: audit log, manual recovery, account merge
export const USER_AUTH_EVENTS = `${API_LOCATION}chat/users/auth-events`;
export const USER_AUTH_REACTIVATE = `${API_LOCATION}chat/users/auth/reactivate`;
export const USER_MERGE = `${API_LOCATION}chat/users/merge`;

// Disable/enable a single user
export const USER_ENABLED_TOGGLE = `${API_LOCATION}chat/users/setenabled`;

// Get banned IP addresses
export const BANNED_IPS = `${API_LOCATION}chat/users/ipbans`;

// Remove IP ban
export const BANNED_IP_REMOVE = `${API_LOCATION}chat/users/ipbans/remove`;

// Disable/enable a single user
export const USER_SET_MODERATOR = `${API_LOCATION}chat/users/setmoderator`;

// Get list of moderators
export const MODERATORS = `${API_LOCATION}chat/users/moderators`;

// Get hardware stats
export const HARDWARE_STATS = `${API_LOCATION}hardwarestats`;

// Get all logs
export const LOGS_ALL = `${API_LOCATION}logs`;

// Get warnings + errors
export const LOGS_WARN = `${API_LOCATION}logs/warnings`;

// Get chat history
export const CHAT_HISTORY = `${API_LOCATION}chat/messages`;

// Get chat history
export const UPDATE_CHAT_MESSGAE_VIZ = `/api/admin/chat/messagevisibility`;

// Donation management
export const DONATIONS = `${API_LOCATION}donations`;
export const DONATIONS_SUMMARY = `${API_LOCATION}donations/summary`;
export const DONATIONS_STATS = `${API_LOCATION}donations/stats`;
export const DONATIONS_CREATE = `${API_LOCATION}donations/create`;
export const DONATIONS_VISIBILITY = `${API_LOCATION}donations/visibility`;
export const DONATIONS_DELETE = `${API_LOCATION}donations/delete`;
export const DONATIONS_RECENT = `${NEXT_PUBLIC_API_HOST}api/donations/recent`;
// Public supporter ranking (top spenders by Super Chat + effect total).
export const SUPPORTERS = `${NEXT_PUBLIC_API_HOST}api/supporters`;
// The authenticated viewer's own purchase history; requires ?accessToken=.
export const DONATIONS_MINE = `${NEXT_PUBLIC_API_HOST}api/donations/mine`;
export const DONATION_EXTERNAL_CREATE = `${NEXT_PUBLIC_API_HOST}api/integrations/donations/create`;

// PayPay integration
export const ADMIN_PAYPAY_CONFIG = `${API_LOCATION}config/paypay`;
export const ADMIN_PAYPAY_CONFIG_SET = `${API_LOCATION}config/paypay/set`;
export const PAYPAY_STATUS = `${NEXT_PUBLIC_API_HOST}api/paypay/status`;
export const PAYPAY_CREATE_PAYMENT = `${NEXT_PUBLIC_API_HOST}api/paypay/create`;

// Tokushoho (Act on Specified Commercial Transactions disclosure)
export const ADMIN_TOKUSHOHO = `${API_LOCATION}config/tokushoho`;
export const ADMIN_TOKUSHOHO_SET = `${API_LOCATION}config/tokushoho/set`;
export const TOKUSHOHO_PUBLIC = `${NEXT_PUBLIC_API_HOST}api/tokushoho`;

// FAQ (Frequently Asked Questions)
export const ADMIN_FAQ = `${API_LOCATION}config/faq`;
export const ADMIN_FAQ_SET = `${API_LOCATION}config/faq/set`;
export const FAQ_PUBLIC = `${NEXT_PUBLIC_API_HOST}api/faq`;

// Metamask integration
export const ADMIN_METAMASK_CONFIG = `${API_LOCATION}config/metamask`;
export const ADMIN_METAMASK_CONFIG_SET = `${API_LOCATION}config/metamask/set`;
export const METAMASK_STATUS = `${NEXT_PUBLIC_API_HOST}api/metamask/status`;
export const METAMASK_CONFIRM = `${NEXT_PUBLIC_API_HOST}api/metamask/confirm`;

// Doneru integration
export const ADMIN_DONERU_CONFIG = `${API_LOCATION}config/doneru`;
export const ADMIN_DONERU_CONFIG_SET = `${API_LOCATION}config/doneru/set`;
export const DONERU_STATUS = `${NEXT_PUBLIC_API_HOST}api/doneru/status`;

// Ko-fi integration
export const ADMIN_KOFI_CONFIG = `${API_LOCATION}config/kofi`;
export const ADMIN_KOFI_CONFIG_SET = `${API_LOCATION}config/kofi/set`;
export const KOFI_STATUS = `${NEXT_PUBLIC_API_HOST}api/kofi/status`;

// PayPal integration
export const ADMIN_PAYPAL_CONFIG = `${API_LOCATION}config/paypal`;
export const ADMIN_PAYPAL_CONFIG_SET = `${API_LOCATION}config/paypal/set`;
export const PAYPAL_STATUS = `${NEXT_PUBLIC_API_HOST}api/paypal/status`;
export const PAYPAL_CREATE_PAYMENT = `${NEXT_PUBLIC_API_HOST}api/paypal/create`;

// Stripe integration
export const ADMIN_STRIPE_CONFIG = `${API_LOCATION}config/stripe`;
export const ADMIN_STRIPE_CONFIG_SET = `${API_LOCATION}config/stripe/set`;
export const STRIPE_STATUS = `${NEXT_PUBLIC_API_HOST}api/stripe/status`;
export const STRIPE_CREATE_PAYMENT = `${NEXT_PUBLIC_API_HOST}api/stripe/create`;

// Aggregated payments endpoints (avoid provider names in URL path)
export const PAYMENTS_STATUS = `${NEXT_PUBLIC_API_HOST}api/payments/status`;
export const PAYMENTS_CREATE = `${NEXT_PUBLIC_API_HOST}api/payments/create`;

// Base currency (crypto conversion / reporting reference currency)
export const ADMIN_BASE_CURRENCY = `${API_LOCATION}config/basecurrency`;
export const ADMIN_BASE_CURRENCY_SET = `${API_LOCATION}config/basecurrency/set`;

// Crypto price API
export const CRYPTO_PRICE = `${NEXT_PUBLIC_API_HOST}api/crypto/price`;
export const CRYPTO_PRICES = `${NEXT_PUBLIC_API_HOST}api/crypto/prices`;

// Upload a new custom emoji
export const UPLOAD_EMOJI = `${API_LOCATION}emoji/upload`;

// Delete a custom emoji
export const DELETE_EMOJI = `${API_LOCATION}emoji/delete`;

// Get all access tokens
export const ACCESS_TOKENS = `${API_LOCATION}accesstokens`;

// Delete a single access token
export const DELETE_ACCESS_TOKEN = `${API_LOCATION}accesstokens/delete`;

// Create a new access token
export const CREATE_ACCESS_TOKEN = `${API_LOCATION}accesstokens/create`;

// Get webhooks
export const WEBHOOKS = `${API_LOCATION}webhooks`;

// Delete a single webhook
export const DELETE_WEBHOOK = `${API_LOCATION}webhooks/delete`;

// Create a single webhook
export const CREATE_WEBHOOK = `${API_LOCATION}webhooks/create`;

// hard coded social icons list
export const SOCIAL_PLATFORMS_LIST = `${NEXT_PUBLIC_API_HOST}api/socialplatforms`;

// send a message to the fediverse
export const FEDERATION_MESSAGE_SEND = `${API_LOCATION}federation/send`;

// Get followers
export const FOLLOWERS = `${API_LOCATION}followers`;

// Get followers pending approval
export const FOLLOWERS_PENDING = `${API_LOCATION}followers/pending`;

// Get followers who were blocked or rejected
export const FOLLOWERS_BLOCKED = `${API_LOCATION}followers/blocked`;

// Approve, reject a follow request
export const SET_FOLLOWER_APPROVAL = `${API_LOCATION}followers/approve`;

// List of inbound federated actions that took place.
export const FEDERATION_ACTIONS = `${API_LOCATION}federation/actions`;

export const API_STREAM_HEALTH_METRICS = `${API_LOCATION}metrics/video`;

// Save an array of stream keys
export const UPDATE_STREAM_KEYS = `${API_LOCATION}config/streamkeys`;

export const API_YP_RESET = `${API_LOCATION}yp/reset`;

// Stream Protocol (WebRTC / LL-HLS) Configuration
export const API_STREAM_PROTOCOL_CONFIG = `${API_LOCATION}config/streamprotocol`;
export const API_STREAM_PROTOCOL_SET = `${API_LOCATION}config/streamprotocol/set`;
export const API_LLHLS_LATENCY_LEVEL = `${API_LOCATION}config/llhls/latencylevel`;
export const API_LLHLS_LATENCY_LEVELS = `${API_LOCATION}config/llhls/latencylevels`;
export const API_WEBRTC_STATS = `${API_LOCATION}webrtc/stats`;
export const API_WEBRTC_DISCONNECT = `${API_LOCATION}webrtc/disconnect`;
export const API_WEBRTC_DISCONNECT_ALL = `${API_LOCATION}webrtc/disconnectall`;

// Stream archives (VOD recordings)
// Public: list of visible archives and their VOD master playlists.
export const ARCHIVES = `${NEXT_PUBLIC_API_HOST}api/archives`;
export const archiveStreamURL = (id: string) =>
	`${NEXT_PUBLIC_API_HOST}api/archives/${encodeURIComponent(id)}/stream.m3u8`;
// Single-file progressive replay of an archive (preferred over the HLS
// playlist for playback; VHS mistimes fMP4 HLS VOD).
export const archiveMp4URL = (id: string) =>
	`${NEXT_PUBLIC_API_HOST}api/archives/${encodeURIComponent(id)}/replay.mp4`;

// Session preview image, present when the archive manifest has a `thumbnail`.
export const archiveThumbnailURL = (id: string) =>
	`${NEXT_PUBLIC_API_HOST}api/archives/${encodeURIComponent(id)}/thumbnail.jpg`;
// Recorded broadcast events (chat, effects, donations) for a VOD replay,
// each tagged with its millisecond offset from stream start.
export const archiveEventsURL = (id: string) =>
	`${NEXT_PUBLIC_API_HOST}api/archives/events/${encodeURIComponent(id)}`;
// Appends the viewer's chat access token to an archive API URL so the server
// can authorize the request: it resolves the `purchased` flag for GET
// /api/archives, gates paid VOD media, and identifies the buyer on purchase.
// Returns the URL unchanged when there is no token (anonymous viewer).
export const withArchiveAccessToken = (url: string, accessToken?: string | null): string =>
	accessToken
		? `${url}${url.includes('?') ? '&' : '?'}accessToken=${encodeURIComponent(accessToken)}`
		: url;

// Admin: full archive management (includes hidden archives).
export const ADMIN_ARCHIVES = `${API_LOCATION}archives`;
export const ADMIN_ARCHIVES_DELETE = `${API_LOCATION}archives/delete`;
export const ADMIN_ARCHIVES_VISIBILITY = `${API_LOCATION}archives/visibility`;
export const ADMIN_ARCHIVES_TITLE = `${API_LOCATION}archives/title`;
export const ADMIN_ARCHIVES_PRICING = `${API_LOCATION}archives/pricing`;
// Manually grant / revoke a viewer's paid-archive viewing access.
export const ADMIN_ARCHIVES_PURCHASES_GRANT = `${API_LOCATION}archives/purchases/grant`;
export const ADMIN_ARCHIVES_PURCHASES_REVOKE = `${API_LOCATION}archives/purchases/revoke`;


interface FetchOptions {
	data?: any;
	method?: string;
	auth?: boolean;
}

export async function fetchData(url: string, options?: FetchOptions) {
	const { data, method = 'GET', auth = true } = options || {};

	const requestOptions: RequestInit = {
		method,
		credentials: auth ? 'include' : 'same-origin',
	};

	if (data) {
		requestOptions.body = JSON.stringify(data);
	}

	if (auth && ADMIN_USERNAME && ADMIN_STREAMKEY) {
		const encoded = btoa(`${ADMIN_USERNAME}:${ADMIN_STREAMKEY}`);
		requestOptions.headers = {
			Authorization: `Basic ${encoded}`,
		};
		requestOptions.mode = 'cors';
	}

	const response = await fetch(url, requestOptions);
	const json = await response.json();

	if (!response.ok) {
		const message = json.message || `An error has occurred: ${response.status}`;
		throw new Error(message);
	}
	return json;
}

export async function postFormData(url: string, formData: FormData, auth = true) {
	const requestOptions: RequestInit = {
		method: 'POST',
		body: formData,
		credentials: auth ? 'include' : 'same-origin',
	};

	if (auth && ADMIN_USERNAME && ADMIN_STREAMKEY) {
		const encoded = btoa(`${ADMIN_USERNAME}:${ADMIN_STREAMKEY}`);
		requestOptions.headers = {
			Authorization: `Basic ${encoded}`,
		};
		requestOptions.mode = 'cors';
	}

	const response = await fetch(url, requestOptions);
	const json = await response.json();

	if (!response.ok) {
		const message = json.message || `An error has occurred: ${response.status}`;
		throw new Error(message);
	}

	return json;
}

export async function getUnauthedData(url: string, options?: FetchOptions) {
	const opts = {
		method: 'GET',
		auth: false,
		...options,
	};
	return fetchData(url, opts);
}

export async function fetchExternalData(url: string) {
	try {
		const response = await fetch(url, {
			referrerPolicy: 'no-referrer', // Send no referrer header for privacy reasons.
			referrer: '',
		});
		if (!response.ok) {
			// Return empty object for non-OK responses instead of throwing
			return {};
		}
		const json = await response.json();
		return json;
	} catch (_error) {
		// Silently fail for external data fetches - they are optional
		return {};
	}
}

