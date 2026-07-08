// Client for the Authelia API, used by the admin login-settings page to
// manage passkeys/security keys, TOTP, and the login password natively
// inside the admin UI. Authelia is expected at the /authelia/ subpath behind
// the same origin (see the auth proxy setup); all requests ride on the
// Authelia session cookie.
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const BASE = '/authelia/api';

export interface AutheliaCredential {
	id: string;
	description: string;
	created_at?: string;
	last_used_at?: string;
}

export interface ElevationState {
	elevated: boolean;
	require_second_factor?: boolean;
	skip_second_factor?: boolean;
	can_skip_second_factor?: boolean;
	factor_knowledge?: boolean;
	expires?: number;
}

interface AutheliaResponse<T = unknown> {
	status: 'OK' | 'KO';
	data?: T;
	message?: string;
}

const request = async <T = unknown>(
	path: string,
	options: RequestInit = {},
): Promise<AutheliaResponse<T>> => {
	const response = await fetch(`${BASE}${path}`, {
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		credentials: 'same-origin',
		...options,
	});
	let body: AutheliaResponse<T>;
	try {
		body = await response.json();
	} catch {
		body = { status: response.ok ? 'OK' : 'KO' };
	}
	if (!response.ok && body.status !== 'KO') {
		body.status = 'KO';
	}
	(body as AutheliaResponse<T> & { httpStatus: number }).httpStatus = response.status;
	return body;
};

// --- session / elevation ---

export const getSessionState = () => request<{ username: string; authentication_level: number }>('/state');

export const getElevationState = async (): Promise<ElevationState | null> => {
	const res = await request<ElevationState>('/user/session/elevation');
	return res.status === 'OK' ? (res.data ?? null) : null;
};

// Ask Authelia to generate a one-time code (written to the configured
// notifier, which on this deployment is a local file surfaced through the
// Owncast admin API below).
export const requestOneTimeCode = () =>
	request('/user/session/elevation', { method: 'POST', body: JSON.stringify({}) });

export const validateOneTimeCode = (otc: string) =>
	request('/user/session/elevation', { method: 'PUT', body: JSON.stringify({ otc }) });

// Fetch the latest code from the AoiTube backend, which reads the Authelia
// notification file (self-hosted alternative to email delivery).
export const fetchOneTimeCodeFromServer = async (): Promise<string | null> => {
	try {
		const response = await fetch('/api/admin/authelia/onetimecode');
		const body = await response.json();
		return body?.success && body?.code ? body.code : null;
	} catch {
		return null;
	}
};

// --- WebAuthn credentials ---

export const getCredentials = async (): Promise<AutheliaCredential[]> => {
	const res = await request<AutheliaCredential[]>('/secondfactor/webauthn/credentials');
	return res.status === 'OK' && Array.isArray(res.data) ? res.data : [];
};

export const deleteCredential = (id: string) =>
	request(`/secondfactor/webauthn/credential/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const renameCredential = (id: string, description: string) =>
	request(`/secondfactor/webauthn/credential/${encodeURIComponent(id)}`, {
		method: 'PUT',
		body: JSON.stringify({ description }),
	});

// Register a new passkey / security key: fetch creation options, run the
// browser ceremony, then submit the attestation.
export const registerCredential = async (description: string): Promise<AutheliaResponse> => {
	const optionsRes = await request<Record<string, unknown>>(
		'/secondfactor/webauthn/credential/register',
		{
			method: 'PUT',
			body: JSON.stringify({ description }),
		},
	);
	if (optionsRes.status !== 'OK' || !optionsRes.data) {
		return optionsRes;
	}

	const raw = optionsRes.data as { publicKey?: Record<string, unknown> } & Record<string, unknown>;
	const optionsJSON = (raw.publicKey ?? raw) as unknown as Parameters<
		typeof startRegistration
	>[0]['optionsJSON'];

	let attestation;
	try {
		attestation = await startRegistration({ optionsJSON });
	} catch (e) {
		// Give the server a chance to clean up the pending registration session.
		await request('/secondfactor/webauthn/credential/register', { method: 'DELETE' });
		throw e;
	}

	return request('/secondfactor/webauthn/credential/register', {
		method: 'POST',
		body: JSON.stringify(attestation),
	});
};

// Second-factor confirmation with an existing key (used by the elevation flow
// when require_second_factor is enabled).
export const assertWithSecurityKey = async (): Promise<AutheliaResponse> => {
	const optionsRes = await request<Record<string, unknown>>('/secondfactor/webauthn');
	if (optionsRes.status !== 'OK' || !optionsRes.data) {
		return optionsRes;
	}
	const raw = optionsRes.data as { publicKey?: Record<string, unknown> } & Record<string, unknown>;
	const optionsJSON = (raw.publicKey ?? raw) as unknown as Parameters<
		typeof startAuthentication
	>[0]['optionsJSON'];

	const assertion = await startAuthentication({ optionsJSON });
	return request('/secondfactor/webauthn', {
		method: 'POST',
		body: JSON.stringify({ response: assertion }),
	});
};

export const assertWithTotp = (token: string) =>
	request('/secondfactor/totp', { method: 'POST', body: JSON.stringify({ token }) });

// --- TOTP ---

export const getTotpConfiguration = () =>
	request<{ created_at?: string; issuer?: string }>('/secondfactor/totp');

export const startTotpRegistration = () =>
	request<{ base32_secret: string; otpauth_url: string }>('/secondfactor/totp/register', {
		method: 'PUT',
		body: JSON.stringify({ algorithm: 'SHA1', period: 30, digits: 6 }),
	});

export const finishTotpRegistration = (token: string) =>
	request('/secondfactor/totp/register', { method: 'POST', body: JSON.stringify({ token }) });

export const deleteTotpConfiguration = () =>
	request('/secondfactor/totp/register', { method: 'DELETE' });

// --- password ---

export const changePassword = (username: string, oldPassword: string, newPassword: string) =>
	request('/change-password', {
		method: 'POST',
		body: JSON.stringify({
			username,
			old_password: oldPassword,
			new_password: newPassword,
		}),
	});
