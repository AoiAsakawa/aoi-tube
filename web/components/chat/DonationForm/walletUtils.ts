// Injected-wallet detection helpers (MetaMask / Trust Wallet).
import './types';

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
