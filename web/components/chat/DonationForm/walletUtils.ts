// Injected-wallet detection helpers (MetaMask / Trust Wallet).
import './types';

// Wallet providers reject with a plain JSON-RPC object ({ code, message }), not
// an Error, so `error instanceof Error` misses it and the real cause collapses
// into a generic "an error occurred". Pull out whatever message is there.
export const describeWalletError = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === 'string' && error) {
		return error;
	}
	if (error && typeof error === 'object') {
		const rpc = error as { message?: unknown; code?: unknown };
		if (typeof rpc.message === 'string' && rpc.message) {
			return typeof rpc.code === 'number' ? `${rpc.message} (${rpc.code})` : rpc.message;
		}
		if (typeof rpc.code === 'number') {
			return `code ${rpc.code}`;
		}
	}
	return String(error);
};

// Detect wallet type
export const getWalletName = (): string => {
	if (typeof window === 'undefined' || !window.ethereum) return 'ウォレット';
	if (window.ethereum.isTrust || window.ethereum.isTrustWallet) return 'Trust Wallet';
	if (window.ethereum.isMetaMask) return 'MetaMask';
	return 'ウォレット';
};

// Check if Trust Wallet
export const isTrustWalletConnected = (): boolean => {
	if (typeof window === 'undefined' || !window.ethereum) return false;
	return !!(window.ethereum.isTrust || window.ethereum.isTrustWallet);
};
