// EVM wallet state and actions for the donation form: MetaMask / Trust Wallet
// connection, network and token selection, balance fetching, network switching
// and native / ERC-20 transfers. Cross-chain values owned by the Bitcoin and
// Solana hooks are passed in from the component.
import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';
import { decimalToBigInt } from '../cryptoAmount';
import {
	AVAILABLE_NETWORKS,
	AVAILABLE_TOKENS,
	ERC20_BALANCE_OF_ABI,
	ERC20_TRANSFER_ABI,
} from '../constants';
import { MetamaskConfig, NetworkOption, TokenOption } from '../types';
import { getWalletName } from '../walletUtils';

interface UseEvmWalletArgs {
	visible: boolean;
	paymentMethod: string;
	metamaskConfig: MetamaskConfig | null;
	cryptoAmount: string;
	setCryptoAmount: (value: string) => void;
	setInputMode: (mode: 'crypto' | 'jpy') => void;
	setCryptoPrice: (price: number) => void;
	fetchCryptoPrice: (coinGeckoId: string, retryCount?: number) => Promise<void>;
	bitcoinBalance: number | null;
	bitcoinAddress: string;
	solanaBalance: number | null;
	solanaAddress: string;
}

export const useEvmWallet = ({
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
}: UseEvmWalletArgs) => {
	const { t } = useTranslation();

	const [walletConnected, setWalletConnected] = useState<boolean>(false);
	const [walletAddress, setWalletAddress] = useState<string>('');
	const [isConnecting, setIsConnecting] = useState<boolean>(false);

	// User-selected network and token
	const [selectedNetwork, setSelectedNetwork] = useState<NetworkOption | null>(null);
	const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null);
	const [availableTokens, setAvailableTokens] = useState<TokenOption[]>([]);
	const [tokensWithBalance, setTokensWithBalance] = useState<TokenOption[]>([]);
	const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(false);
	const [showOnlyWithBalance, setShowOnlyWithBalance] = useState<boolean>(false);
	const [currentChainId, setCurrentChainId] = useState<number | null>(null);

	// Get native balance
	const getNativeBalance = useCallback(async (address: string): Promise<string> => {
		if (!window.ethereum) return '0';
		try {
			const balance = (await window.ethereum.request({
				method: 'eth_getBalance',
				params: [address, 'latest'],
			})) as string;
			const balanceInEther = parseInt(balance, 16) / 1e18;
			return balanceInEther.toFixed(6);
		} catch {
			return '0';
		}
	}, []);

	// Get Bitcoin balance from state (fetched separately)
	const getBitcoinBalance = useCallback(async (): Promise<string> => {
		// Use the bitcoinBalance state that was fetched via mempool.space API
		if (bitcoinBalance !== null && bitcoinBalance > 0) {
			return (bitcoinBalance / 100000000).toFixed(8);
		}
		return '0';
	}, [bitcoinBalance]);

	// Get ERC-20 token balance
	const getTokenBalance = useCallback(
		async (tokenAddress: string, walletAddr: string, decimals: number): Promise<string> => {
			if (!window.ethereum || !tokenAddress) return '0';
			try {
				const paddedAddress = walletAddr.slice(2).padStart(64, '0');
				const data = ERC20_BALANCE_OF_ABI + paddedAddress;

				const result = (await window.ethereum.request({
					method: 'eth_call',
					params: [{ to: tokenAddress, data }, 'latest'],
				})) as string;

				const balance = parseInt(result, 16) / Math.pow(10, decimals);
				return balance.toFixed(decimals > 6 ? 6 : decimals);
			} catch {
				return '0';
			}
		},
		[],
	);

	// Fetch all balances for current network
	const fetchAllBalances = useCallback(
		async (networkId: number, walletAddr: string) => {
			if (!walletAddr || !window.ethereum) return;

			setIsLoadingBalances(true);
			const tokens = AVAILABLE_TOKENS[networkId] || [];
			const network = AVAILABLE_NETWORKS.find(n => n.id === networkId);
			const tokensWithBalances: TokenOption[] = [];

			for (const token of tokens) {
				let balance: string;
				if (network?.chainType === 'bitcoin') {
					// Bitcoin balance
					balance = await getBitcoinBalance();
				} else if (token.address === '') {
					// Native EVM token
					balance = await getNativeBalance(walletAddr);
				} else {
					// ERC-20 token
					balance = await getTokenBalance(token.address, walletAddr, token.decimals);
				}
				tokensWithBalances.push({ ...token, balance });
			}

			setTokensWithBalance(tokensWithBalances);
			setAvailableTokens(tokensWithBalances);

			// Always update selected token to first token with balance
			if (tokensWithBalances.length > 0) {
				setSelectedToken(tokensWithBalances[0]);
			}

			setIsLoadingBalances(false);
		},
		[getNativeBalance, getTokenBalance, getBitcoinBalance],
	);

	// Detect current network from wallet
	const detectCurrentNetwork = useCallback(async () => {
		if (!window.ethereum) return null;
		try {
			const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
			const networkId = parseInt(chainId, 16);
			setCurrentChainId(networkId);
			return networkId;
		} catch {
			return null;
		}
	}, []);

	// Initialize network selection when metamask config loads
	useEffect(() => {
		if (selectedNetwork) {
			// Only update available tokens if they haven't been loaded with balances yet
			if (tokensWithBalance.length === 0) {
				const tokens = AVAILABLE_TOKENS[selectedNetwork.id] || [];
				setAvailableTokens(tokens);
				// Select first token (native currency) only if no token is selected
				if (tokens.length > 0 && !selectedToken) {
					setSelectedToken(tokens[0]);
					fetchCryptoPrice(tokens[0].coinGeckoId);
				}
			}
		}
	}, [selectedNetwork, selectedToken, tokensWithBalance.length, fetchCryptoPrice]);

	// Update Bitcoin token balance when bitcoinBalance state changes
	useEffect(() => {
		if (selectedNetwork?.chainType === 'bitcoin' && bitcoinBalance !== null) {
			const btcBalanceStr = (bitcoinBalance / 100000000).toFixed(8);
			const tokens = AVAILABLE_TOKENS[selectedNetwork.id] || [];
			const tokensWithBalances = tokens.map(token => ({
				...token,
				balance: btcBalanceStr,
			}));
			setTokensWithBalance(tokensWithBalances);
			setAvailableTokens(tokensWithBalances);
			if (tokensWithBalances.length > 0) {
				setSelectedToken(tokensWithBalances[0]);
			}
		}
	}, [bitcoinBalance, selectedNetwork]);

	// Fetch price when token changes
	useEffect(() => {
		if (selectedToken?.coinGeckoId) {
			fetchCryptoPrice(selectedToken.coinGeckoId);
		} else {
			// No CoinGecko ID, reset price to 0
			setCryptoPrice(0);
		}
	}, [selectedToken, fetchCryptoPrice]);

	// Check if wallet is already connected
	useEffect(() => {
		const checkWalletConnection = async () => {
			if (typeof window.ethereum !== 'undefined') {
				try {
					const accounts = (await window.ethereum.request({
						method: 'eth_accounts',
					})) as string[];
					if (accounts.length > 0) {
						setWalletConnected(true);
						setWalletAddress(accounts[0]);

						// Detect current network but don't force selectedNetwork change
						// This allows users to freely select any network from the dropdown
						const networkId = await detectCurrentNetwork();
						if (networkId) {
							// Only set selectedNetwork on initial load if not already set
							if (!selectedNetwork) {
								const network = AVAILABLE_NETWORKS.find(n => n.id === networkId);
								if (network) {
									setSelectedNetwork(network);
									await fetchAllBalances(networkId, accounts[0]);
								} else {
									// If current network not in list, default to first available
									const defaultNetwork = AVAILABLE_NETWORKS[0];
									setSelectedNetwork(defaultNetwork);
									await fetchAllBalances(defaultNetwork.id, accounts[0]);
								}
							} else {
								// Network is already selected, fetch balances for it
								await fetchAllBalances(selectedNetwork.id, accounts[0]);
							}
						} else if (selectedNetwork) {
							// No network detected but one is selected, fetch balances for it
							await fetchAllBalances(selectedNetwork.id, accounts[0]);
						}
					}
				} catch (_error) {
					console.error('Failed to check wallet connection');
				}
			}
		};

		if (visible && paymentMethod === 'metamask') {
			checkWalletConnection();
		}
	}, [visible, paymentMethod, detectCurrentNetwork, fetchAllBalances]);

	// Keep the latest selected network in a ref so the wallet-event listeners
	// (registered once below) can read it without being re-registered on every
	// change. MetaMask misses account/chain events when its listeners are torn
	// down and re-added on each render; Trust Wallet is more forgiving, which is
	// why only MetaMask stopped syncing the address on account switch.
	const selectedNetworkRef = useRef(selectedNetwork);
	useEffect(() => {
		selectedNetworkRef.current = selectedNetwork;
	}, [selectedNetwork]);

	// Register wallet event listeners exactly once (stable across renders).
	useEffect(() => {
		if (!window.ethereum) return undefined;

		const handleChainChanged = async (chainId: string) => {
			const networkId = parseInt(chainId, 16);
			setCurrentChainId(networkId);
			// Only show a message; don't auto-change the user's selected network.
			const network = AVAILABLE_NETWORKS.find(n => n.id === networkId);
			if (network) {
				message.info(t('donation.metamaskSwitchedNetwork', { network: network.name }));
			}
		};

		const handleAccountsChanged = async (accounts: unknown) => {
			const accs = accounts as string[];
			if (!accs || accs.length === 0) {
				setWalletConnected(false);
				setWalletAddress('');
				return;
			}
			setWalletConnected(true);
			setWalletAddress(accs[0]);
			const net = selectedNetworkRef.current;
			if (net) {
				await fetchAllBalances(net.id, accs[0]);
			}
		};

		window.ethereum.on('chainChanged', handleChainChanged);
		window.ethereum.on('accountsChanged', handleAccountsChanged);

		return () => {
			window.ethereum?.removeListener('chainChanged', handleChainChanged);
			window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
		};
	}, [fetchAllBalances]);

	const connectWallet = async () => {
		if (typeof window.ethereum === 'undefined') {
			message.error(t('donation.walletNotInstalled'));
			// Mobile browsers often have Trust Wallet
			const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
			if (isMobile) {
				window.open('https://trustwallet.com/download', '_blank');
			} else {
				window.open('https://metamask.io/download/', '_blank');
			}
			return;
		}

		setIsConnecting(true);
		try {
			const accounts = (await window.ethereum.request({
				method: 'eth_requestAccounts',
			})) as string[];

			if (accounts.length > 0) {
				setWalletConnected(true);
				setWalletAddress(accounts[0]);

				// Detect current network
				const currentNetworkId = await detectCurrentNetwork();

				// If a network is already selected and it's different from current, switch to it
				if (
					selectedNetwork &&
					selectedNetwork.chainType === 'evm' &&
					currentNetworkId !== selectedNetwork.id
				) {
					// Try to switch/add the selected network automatically
					const switched = await switchNetwork(selectedNetwork);
					if (switched) {
						await fetchAllBalances(selectedNetwork.id, accounts[0]);
						message.success(
							t('donation.walletConnectedAndSwitched', {
								wallet: getWalletName(),
								network: selectedNetwork.name,
							}),
						);
					} else {
						// Failed to switch, use current network
						const network = AVAILABLE_NETWORKS.find(n => n.id === currentNetworkId);
						if (network) {
							setSelectedNetwork(network);
							await fetchAllBalances(currentNetworkId!, accounts[0]);
						}
						message.success(t('donation.walletConnected', { wallet: getWalletName() }));
					}
				} else if (currentNetworkId) {
					const network = AVAILABLE_NETWORKS.find(n => n.id === currentNetworkId);
					// Only set if no network is selected yet
					if (!selectedNetwork) {
						if (network) {
							setSelectedNetwork(network);
						} else {
							// Default to first network if current not supported
							const defaultNetwork = AVAILABLE_NETWORKS[0];
							setSelectedNetwork(defaultNetwork);
						}
					}
					// Always fetch balances for the selected or detected network
					const targetNetworkId = selectedNetwork?.id ?? currentNetworkId;
					await fetchAllBalances(targetNetworkId, accounts[0]);
					message.success(t('donation.walletConnected', { wallet: getWalletName() }));
				} else {
					// No network detected, fetch balances for selected network
					if (selectedNetwork) {
						await fetchAllBalances(selectedNetwork.id, accounts[0]);
					}
					message.success(t('donation.walletConnected', { wallet: getWalletName() }));
				}
			}
		} catch (error) {
			console.error('Failed to connect wallet:', error);
			message.error(t('donation.walletConnectFailed'));
		} finally {
			setIsConnecting(false);
		}
	};

	const switchNetwork = async (targetNetwork?: typeof selectedNetwork) => {
		const networkToSwitch = targetNetwork || selectedNetwork;
		if (!networkToSwitch || typeof window.ethereum === 'undefined') return;

		// Bitcoin doesn't use EVM chain switching - it's handled separately
		if (networkToSwitch.id === 0) {
			return;
		}

		const addNetwork = async () => {
			await window.ethereum!.request({
				method: 'wallet_addEthereumChain',
				params: [
					{
						chainId: networkToSwitch.hexChainId,
						chainName: networkToSwitch.name,
						nativeCurrency: {
							name: networkToSwitch.currency,
							symbol: networkToSwitch.currency,
							decimals: 18,
						},
						rpcUrls: [networkToSwitch.rpcUrl],
						blockExplorerUrls: networkToSwitch.blockExplorerUrl
							? [networkToSwitch.blockExplorerUrl]
							: undefined,
					},
				],
			});
		};

		try {
			await window.ethereum.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: networkToSwitch.hexChainId }],
			});
			setCurrentChainId(networkToSwitch.id);
			return true;
		} catch (error: unknown) {
			const errorWithCode = error as { code?: number; message?: string };

			// 4902: Network not found, need to add (MetaMask)
			// -32603: Internal error (often means network not configured)
			// -32002: Request already pending
			// Trust Wallet may use different error codes, so also try for unknown errors
			const shouldTryAddNetwork =
				errorWithCode.code === 4902 ||
				errorWithCode.code === -32603 ||
				(errorWithCode.message && errorWithCode.message.toLowerCase().includes('network'));

			if (shouldTryAddNetwork) {
				try {
					await addNetwork();
					setCurrentChainId(networkToSwitch.id);
					return true;
				} catch (addError: unknown) {
					const addErrorWithCode = addError as { code?: number; message?: string };
					console.error('Failed to add network:', addErrorWithCode);
					if (addErrorWithCode.code === 4001) {
						message.info(t('donation.networkAddCancelled'));
					} else {
						message.error(
							t('donation.networkAddFailed', {
								error: addErrorWithCode.message || t('donation.unknownError'),
							}),
						);
					}
				}
			} else if (errorWithCode.code === 4001) {
				message.info(t('donation.networkSwitchCancelled'));
			} else if (errorWithCode.code === -32002) {
				message.info(t('donation.checkWalletRequest', { wallet: getWalletName() }));
			} else {
				// For unknown errors, also try adding network (Trust Wallet compatibility)
				try {
					await addNetwork();
					setCurrentChainId(networkToSwitch.id);
					return true;
				} catch {
					message.error(
						t('donation.networkSwitchFailed', {
							error: errorWithCode.message || t('donation.unknownError'),
						}),
					);
				}
			}
			return false;
		}
	};

	// Handle network change
	const handleNetworkChange = async (networkId: number | string) => {
		const numericId = typeof networkId === 'string' ? parseInt(networkId, 10) : networkId;
		const network = AVAILABLE_NETWORKS.find(n => n.id === numericId);
		if (network) {
			setSelectedNetwork(network);
			const tokens = AVAILABLE_TOKENS[network.id] || [];
			setAvailableTokens(tokens);
			setTokensWithBalance([]);

			// Reset to native token (without balance for now)
			if (tokens.length > 0) {
				const newToken = tokens[0];
				setSelectedToken(newToken);
				// Fetch price for new token
				if (newToken.coinGeckoId) {
					fetchCryptoPrice(newToken.coinGeckoId);
				} else {
					setCryptoPrice(0);
				}
				// Reset crypto amount based on network type
				if (network.chainType === 'bitcoin') {
					setCryptoAmount('0.0001'); // Default for Bitcoin
				} else if (network.chainType === 'solana') {
					setCryptoAmount('0.01'); // Default for Solana
				} else if (['USDT', 'USDC', 'DAI'].includes(newToken.symbol)) {
					setCryptoAmount('10');
				} else {
					setCryptoAmount('0.01');
				}
			}

			// Handle non-EVM chains (Bitcoin, Solana) - no MetaMask chain switching needed
			if (network.chainType === 'bitcoin') {
				// For Bitcoin, update tokensWithBalance with bitcoinBalance if available
				if (bitcoinBalance !== null && bitcoinAddress) {
					const btcBalanceStr = (bitcoinBalance / 100000000).toFixed(8);
					const tokensWithBal = tokens.map(t => ({ ...t, balance: btcBalanceStr }));
					setTokensWithBalance(tokensWithBal);
					setAvailableTokens(tokensWithBal);
					if (tokens.length > 0) {
						setSelectedToken({ ...tokens[0], balance: btcBalanceStr });
					}
				}
				return; // Don't try to switch EVM network
			}

			if (network.chainType === 'solana') {
				// For Solana, update tokensWithBalance with solanaBalance if available
				if (solanaBalance !== null && solanaAddress) {
					const solBalanceStr = (solanaBalance / 1e9).toFixed(6);
					const tokensWithBal = tokens.map(t => {
						if (t.symbol === 'SOL') {
							return { ...t, balance: solBalanceStr };
						}
						return t;
					});
					setTokensWithBalance(tokensWithBal);
					setAvailableTokens(tokensWithBal);
					if (tokens.length > 0) {
						setSelectedToken({
							...tokens[0],
							balance: tokens[0].symbol === 'SOL' ? solBalanceStr : undefined,
						});
					}
				}
				return; // Don't try to switch EVM network
			}

			// Switch MetaMask network and fetch balances if wallet connected (EVM only)
			if (walletConnected && walletAddress && network.chainType === 'evm') {
				// Switch MetaMask to the selected network first
				const switched = await switchNetwork(network);
				if (switched) {
					await fetchAllBalances(network.id, walletAddress);
				}
			}
		}
	};

	// Get filtered tokens (with balance or all)
	const getDisplayTokens = () => {
		if (!showOnlyWithBalance) return availableTokens;
		return tokensWithBalance.filter(t => parseFloat(t.balance || '0') > 0);
	};

	// Handle token change
	const handleTokenChange = (tokenSymbol: string) => {
		// First try to find from tokensWithBalance (has balance info)
		let token = tokensWithBalance.find(t => t.symbol === tokenSymbol);
		// Fall back to availableTokens if not found
		if (!token) {
			token = availableTokens.find(t => t.symbol === tokenSymbol);
		}
		if (token) {
			setSelectedToken(token);
			// Fetch price for new token
			if (token.coinGeckoId) {
				fetchCryptoPrice(token.coinGeckoId);
			} else {
				setCryptoPrice(0);
			}
			// Reset crypto amount for stablecoins
			if (['USDT', 'USDC', 'DAI'].includes(token.symbol)) {
				setCryptoAmount('10');
				setInputMode('crypto');
			} else {
				setCryptoAmount('0.01');
			}
		}
	};

	// Send EVM transaction (ETH, tokens, etc.)
	const sendEvmTransaction = async (): Promise<string> => {
		if (!metamaskConfig || !selectedNetwork || !selectedToken || !window.ethereum) return '';

		// Check network
		const chainId = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
		const currentChainId = parseInt(chainId, 16);

		if (currentChainId !== selectedNetwork.id) {
			message.error(t('donation.pleaseSwitchNetwork', { network: selectedNetwork.name }));
			return '';
		}

		let txHash: string;

		if (selectedToken.address) {
			// ERC-20 token transfer
			const decimals = selectedToken.decimals || 18;
			const tokenAmount = decimalToBigInt(cryptoAmount, decimals);

			// Encode transfer function call: transfer(address to, uint256 amount)
			const toAddress = metamaskConfig.walletAddress.slice(2).padStart(64, '0');
			const amountHex = tokenAmount.toString(16).padStart(64, '0');
			const data = ERC20_TRANSFER_ABI + toAddress + amountHex;

			txHash = (await window.ethereum.request({
				method: 'eth_sendTransaction',
				params: [
					{
						from: walletAddress,
						to: selectedToken.address,
						data: data,
					},
				],
			})) as string;
		} else {
			// Native currency transfer (ETH, MATIC, etc.)
			const weiValue = decimalToBigInt(cryptoAmount, 18).toString(16);

			txHash = (await window.ethereum.request({
				method: 'eth_sendTransaction',
				params: [
					{
						from: walletAddress,
						to: metamaskConfig.walletAddress,
						value: `0x${weiValue}`,
					},
				],
			})) as string;
		}

		return txHash;
	};

	return {
		walletConnected,
		setWalletConnected,
		walletAddress,
		setWalletAddress,
		isConnecting,
		setIsConnecting,
		selectedNetwork,
		setSelectedNetwork,
		selectedToken,
		setSelectedToken,
		availableTokens,
		setAvailableTokens,
		tokensWithBalance,
		isLoadingBalances,
		showOnlyWithBalance,
		setShowOnlyWithBalance,
		currentChainId,
		fetchAllBalances,
		detectCurrentNetwork,
		connectWallet,
		switchNetwork,
		handleNetworkChange,
		getDisplayTokens,
		handleTokenChange,
		sendEvmTransaction,
	};
};
